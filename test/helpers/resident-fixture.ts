import { randomBytes, randomUUID } from "node:crypto"
import { once } from "node:events"
import * as fs from "node:fs/promises"
import type { RequestListener } from "node:http"
import { tmpdir } from "node:os"
import * as path from "node:path"
import { Redacted, Schema } from "effect"

import { ResidentAttachment } from "../../src/resident/attachment-file.js"
import { ResidentFilePath } from "../../src/resident/protected-path.js"
import { makeResidentHttpsListener, ResidentTlsIdentity } from "../../src/resident/tls-channel.js"
import { VERSION } from "../../src/version.js"
import {
  AttachmentAdmitted,
  type LeasePolicy,
  DEFAULT_LEASE_POLICY,
  RESIDENT_ATTACHMENT_HEADER,
  RESIDENT_ATTACHMENTS_PATH
} from "../../src/resident/admission-contract.js"

const SECRET_BYTES = 32
const PRIVATE_FILE_MODE = 0o600
const HTTP_UNAUTHORIZED = 401
const HTTP_CREATED = 201
const HTTP_NO_CONTENT = 204
const HTTP_FORBIDDEN = 403
const PackageVersion = Schema.Struct({ version: Schema.NonEmptyString })
export const fixturePackageVersion = async () =>
  Schema.decodeUnknownSync(Schema.fromJsonString(PackageVersion))(await fs.readFile("package.json", "utf8")).version

export const startResidentFixture = async (
  handler: RequestListener,
  authorization: string,
  implementationVersion = VERSION,
  controlHandler?: RequestListener,
  leaseControl?: { readonly lease: LeasePolicy; readonly renew: RequestListener },
  telemetryEnabled = false
) => {
  const directory = await fs.mkdtemp(path.join(await fs.realpath(tmpdir()), "resident-fixture-"))
  const identity = Schema.decodeUnknownSync(ResidentTlsIdentity)({
    generation: randomUUID(),
    key: randomBytes(SECRET_BYTES).toString("hex")
  })
  const backend = makeResidentHttpsListener(identity)
  const attachments = new Set<string>()
  const cleanup = async () => {
    backend.closeAllConnections()
    if (backend.listening)
      await new Promise<void>((resolve, reject) => backend.close((error) => (error ? reject(error) : resolve())))
    await fs.rm(directory, { recursive: true, force: true })
  }
  try {
    backend.on("request", (request, response) => {
      if (request.url === RESIDENT_ATTACHMENTS_PATH) {
        if (request.headers.authorization !== `Bearer ${authorization}`) {
          response.writeHead(HTTP_UNAUTHORIZED).end()
        } else if (controlHandler !== undefined) {
          controlHandler(request, response)
        } else if (request.method === "POST") {
          const token = randomBytes(SECRET_BYTES).toString("hex")
          attachments.add(token)
          const admitted = Schema.decodeUnknownSync(AttachmentAdmitted)({
            version: 1,
            token,
            lease: leaseControl?.lease ?? DEFAULT_LEASE_POLICY
          })
          response
            .writeHead(HTTP_CREATED, { "content-type": "application/json" })
            .end(Schema.encodeSync(Schema.fromJsonString(AttachmentAdmitted))(admitted))
        } else {
          if (request.method === "PUT" && leaseControl !== undefined) {
            leaseControl.renew(request, response)
            return
          }
          const token = request.headers[RESIDENT_ATTACHMENT_HEADER]
          if (request.method === "DELETE" && typeof token === "string") attachments.delete(token)
          response.writeHead(HTTP_NO_CONTENT).end()
        }
        return
      }
      const token = request.headers[RESIDENT_ATTACHMENT_HEADER]
      if (typeof token !== "string" || !attachments.has(token)) {
        response.writeHead(HTTP_FORBIDDEN).end()
        return
      }
      handler(request, response)
    })
    backend.listen(0, "127.0.0.1")
    await once(backend, "listening")
    const address = backend.address()
    if (address === null || typeof address === "string") throw new Error("Expected owned resident TCP listener")
    const descriptor = Schema.decodeUnknownSync(ResidentAttachment)({
      telemetryEnabled,
      version: 1,
      transport: "tls13-external-psk-v1",
      implementation: { name: "@firfi/huly-mcp", version: implementationVersion },
      endpoint: `https://127.0.0.1:${address.port}/mcp`,
      identity: { generation: identity.generation, key: Redacted.value(identity.key) },
      authorization
    })
    const file = ResidentFilePath.make(path.join(directory, `${identity.generation}.json`))
    await fs.writeFile(file, Schema.encodeSync(Schema.fromJsonString(ResidentAttachment))(descriptor), {
      flag: "wx",
      mode: PRIVATE_FILE_MODE
    })
    return { backend, cleanup, file }
  } catch (error) {
    await cleanup()
    throw error
  }
}
