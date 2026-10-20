import { once } from "node:events"
import * as fs from "node:fs/promises"
import { connect, type Socket } from "node:net"
import { dirname } from "node:path"
import * as NodeStream from "@effect/platform-node/NodeStream"
import { Deferred, Effect, Schema, Stream } from "effect"
import { expect, it } from "vitest"

import { ResidentAttachment } from "../../src/resident/attachment-file.js"
import { AdmissionPolicy, DEFAULT_LEASE_POLICY } from "../../src/resident/admission-contract.js"
import { residentAdmissionMiddleware } from "../../src/resident/admission-http.js"
import { makeResidentAdmissions } from "../../src/resident/admissions.js"
import { makeCompatibilityAuthority } from "../../src/resident/compatibility-authority.js"
import { makeCompatibilityProof } from "../../src/resident/compatibility-crypto.js"
import { captureResidentSelection } from "../../src/resident/selection-config.js"
import { NativeHello, type NativeSocketPath } from "../../src/resident/native-contract.js"
import { withNativeResidentSocket } from "../../src/resident/native-server.js"
import { decodeNativeFrames } from "../../src/resident/native-framing.js"
import { nativeSocketStdio } from "../../src/resident/native-stdio.js"
import { BackendMessage } from "../../src/resident/response-stream.js"
import { withNativeServer, AUTHORIZATION, type OwnerName, type Owner } from "../helpers/resident-native-fixture.js"

const policy = Schema.decodeUnknownSync(AdmissionPolicy)({
  capacity: 2,
  closeAllowanceMillis: 1_000,
  lease: DEFAULT_LEASE_POLICY
})
const connection = async (path: NativeSocketPath) => {
  const socket = connect(path)
  socket.on("error", () => {})
  await once(socket, "connect")
  return socket
}
const admitted = async (socket: Socket, hello: string) => {
  const reply = once(socket, "data")
  socket.write(`${hello}\n`)
  const [bytes] = Schema.decodeUnknownSync(Schema.Tuple([Schema.Uint8Array]))(await reply)
  expect(Array.from(bytes)).toEqual([1])
  socket.pause()
}
const refused = async (path: NativeSocketPath, hello: string) => {
  const socket = await connection(path)
  const bytes: Array<Uint8Array> = []
  socket.on("data", (chunk: Buffer) => bytes.push(chunk))
  const closed = once(socket, "close")
  socket.write(`${hello}\n`)
  await closed
  const diagnostic = Buffer.concat(bytes)
  expect(diagnostic.length).toBeGreaterThan(4)
  expect(diagnostic.readUInt32BE(0)).toBeGreaterThanOrEqual(2_147_483_648)
  expect(diagnostic.toString()).not.toContain("native-session-owner-fixture")
}

it("owns a private native channel, authenticates once, forwards a request and releases admission", async () => {
  let ownedPath: NativeSocketPath | undefined
  await Effect.runPromise(
    Effect.gen(function* () {
      const capture = yield* captureResidentSelection({
        HULY_URL: "https://native.invalid",
        HULY_TOKEN: "fixture-native-token",
        HULY_WORKSPACE: "native"
      })
      const admissions = yield* makeResidentAdmissions(policy)
      const available = yield* Deferred.make<Effect.Success<ReturnType<typeof makeCompatibilityAuthority>>>()
      yield* withNativeServer(
        new Map<OwnerName, Owner>(),
        (endpoint, identity) =>
          Effect.gen(function* () {
            const authority = yield* makeCompatibilityAuthority(capture.selection, identity.generation, AUTHORIZATION)
            yield* Deferred.succeed(available, authority)
            const descriptor = ResidentAttachment.make({
              version: 1,
              transport: "tls13-external-psk-v1",
              implementation: { name: "@firfi/huly-mcp", version: "fixture" },
              endpoint,
              identity,
              authorization: AUTHORIZATION
            })
            const proof = yield* makeCompatibilityProof(capture.selection, yield* authority.challenge, AUTHORIZATION)
            const lease = yield* admissions.admit
            const hello = Schema.encodeSync(Schema.fromJsonString(NativeHello))({
              version: 1,
              authorization: AUTHORIZATION,
              proof,
              attachmentToken: lease.token
            })
            const duplicateProof = yield* makeCompatibilityProof(
              capture.selection,
              yield* authority.challenge,
              AUTHORIZATION
            )
            const duplicate = Schema.encodeSync(Schema.fromJsonString(NativeHello))({
              version: 1,
              authorization: AUTHORIZATION,
              proof: duplicateProof,
              attachmentToken: lease.token
            })
            yield* withNativeResidentSocket(descriptor, admissions, authority, policy.capacity, (path) =>
              Effect.promise(async () => {
                ownedPath = path
                expect((await fs.stat(dirname(path))).mode & 0o777).toBe(0o700)
                expect((await fs.lstat(path)).mode & 0o777).toBe(0o600)
                await refused(path, hello.replace("native-session-owner-fixture", "wrong-private-bearer"))
                const socket = await connection(path)
                try {
                  await admitted(socket, hello)
                  await refused(path, duplicate)
                  expect((await Effect.runPromise(admissions.status)).attachments).toBe(1)
                  const stdio = nativeSocketStdio(socket)
                  await Effect.runPromise(Stream.empty.pipe(Stream.run(stdio.stderr())))
                  await Effect.runPromise(Stream.empty.pipe(Stream.run(stdio.stdout())))
                  const reply = Effect.runPromise(
                    NodeStream.fromReadable({
                      evaluate: () => socket,
                      onError: (error) => error,
                      closeOnDone: false
                    }).pipe(decodeNativeFrames, Stream.take(1), Stream.runCollect)
                  )
                  const request = Buffer.from(
                    '{"jsonrpc":"2.0","id":41,"method":"server/discover","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{},"io.modelcontextprotocol/clientInfo":{"name":"first","version":"1.0"}}}}\n'
                  )
                  const header = Buffer.alloc(4)
                  header.writeUInt32BE(request.length)
                  socket.write(Buffer.concat([header, request]))
                  const parsed = Schema.decodeUnknownSync(Schema.fromJsonString(BackendMessage))(
                    Buffer.concat(await reply).toString()
                  )
                  expect(parsed).toMatchObject({
                    jsonrpc: "2.0",
                    id: 41,
                    result: {
                      _meta: {
                        "io.modelcontextprotocol/serverInfo": { name: "native-session-fixture", version: "1.0" }
                      }
                    }
                  })
                  await refused(path, hello)
                } finally {
                  socket.destroy()
                }
              })
            )
            expect((yield* admissions.status).attachments).toBe(0)
          }),
        {
          middleware: (http) =>
            Deferred.await(available).pipe(
              Effect.flatMap((authority) => residentAdmissionMiddleware(admissions, authority)(http))
            )
        }
      )
    }).pipe(Effect.scoped, Effect.timeout("5 seconds"))
  )
  expect(ownedPath).toBeDefined()
  await expect(fs.access(String(ownedPath))).rejects.toThrow()
  await expect(fs.access(dirname(String(ownedPath)))).rejects.toThrow()
})
