import { execFile } from "node:child_process"
import * as fs from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { Effect, Schema } from "effect"
import { expect, it } from "vitest"

import { CliFailureSchema } from "../../packages/huly-cli/src/failures.js"
import { withPublishedResidentAttachment } from "../../src/resident/attachment-file.js"
import { openGenerationRegistry } from "../../src/resident/generation-registry.js"
import { ResidentDirectory } from "../../src/resident/protected-path.js"
import { ResidentStateStatus } from "../../src/resident/state-status.js"
import { registryAttachment } from "../helpers/resident-registry-fixture.js"
import { testStdioEnvironment } from "../helpers/stdio-environment.js"

const PROCESS_BOUND = 30_000
const RESPONSE_BOUND = 5_000
const runFile = promisify(execFile)
const FailedCommand = Schema.Struct({
  code: Schema.Literal(2),
  stdout: Schema.Literal(""),
  stderr: Schema.NonEmptyString
})

it.skipIf(process.platform !== "linux")(
  "runs the packaged resident status CLI without credentials, startup, repair or private output",
  { timeout: PROCESS_BOUND },
  async () => {
    const directory = ResidentDirectory.make(
      await fs.mkdtemp(join(await fs.realpath(tmpdir()), "resident-status-process-"))
    )
    await fs.mkdir("dist", { recursive: true })
    const artifact = await fs.mkdtemp(join(process.cwd(), "dist", "resident-status-cli-"))
    const executable = join(artifact, "index.cjs")
    let passed = false
    try {
      await runFile("pnpm", ["--filter", "@firfi/huly-cli", "build", `--outfile=${executable}`], {
        timeout: PROCESS_BOUND
      })
      const run = (state: ResidentDirectory) =>
        runFile(process.execPath, [executable, "resident", "status", "--state-directory", state, "--json"], {
          env: testStdioEnvironment(),
          timeout: RESPONSE_BOUND
        })
      const missing = ResidentDirectory.make(join(directory, "absent"))
      const absent = await run(missing)
      expect(Schema.decodeUnknownSync(Schema.fromJsonString(ResidentStateStatus))(absent.stdout).state).toBe("absent")
      expect(absent.stderr).toBe("")
      expect(await fs.readdir(directory)).toEqual([])

      const attachment = registryAttachment()
      await Effect.runPromise(
        withPublishedResidentAttachment(directory, attachment, () =>
          Effect.gen(function* () {
            const registry = yield* openGenerationRegistry(directory)
            yield* Effect.acquireUseRelease(
              registry.publish(attachment),
              (record) =>
                Effect.promise(async () => {
                  const original = await fs.readFile(record.file, "utf8")
                  const result = await run(directory)
                  const status = Schema.decodeUnknownSync(Schema.fromJsonString(ResidentStateStatus))(result.stdout)
                  expect(status).toMatchObject({
                    state: "observed",
                    generations: [{ generation: attachment.identity.generation, liveness: "unverified" }]
                  })
                  expect(result.stderr).toBe("")
                  expect(result.stdout).not.toContain(attachment.identity.key)
                  expect(await fs.readFile(record.file, "utf8")).toBe(original)
                }),
              (record) => record.retire
            )
          })
        )
      )
      expect(await fs.readdir(directory)).toEqual([])
      const unexpected = join(directory, "unexpected")
      await fs.writeFile(unexpected, "private fixture evidence")
      const rejected = await run(directory).then(
        () => {
          throw new Error("Unsafe status unexpectedly succeeded")
        },
        (error: unknown) => Schema.decodeUnknownSync(FailedCommand)(error)
      )
      expect(Schema.decodeUnknownSync(Schema.fromJsonString(CliFailureSchema))(rejected.stderr)).toMatchObject({
        code: "INVALID_INPUT",
        retryable: false
      })
      expect(rejected.stderr).not.toContain("private fixture evidence")
      expect(await fs.readFile(unexpected, "utf8")).toBe("private fixture evidence")
      await fs.unlink(unexpected)
      passed = true
    } finally {
      if (passed) {
        await fs.rm(artifact, { recursive: true })
        await fs.rmdir(directory)
      }
    }
  }
)
