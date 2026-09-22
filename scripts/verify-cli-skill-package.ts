import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"

import { NodeRuntime } from "@effect/platform-node"
import { Console, Effect, Schema } from "effect"

const execFilePromise = promisify(execFile)

class CliSkillPackageError extends Schema.TaggedError<CliSkillPackageError>()("CliSkillPackageError", {
  message: Schema.String
}) {}

const PackageFileNameSchema = Schema.String.pipe(Schema.check(Schema.isEndsWith(".tgz")))
const TarEntrySchema = Schema.Array(Schema.NonEmptyString)
const requiredEntries = [
  "package/dist/index.cjs",
  "package/skills/huly-cli/SKILL.md",
  "package/skills/huly-cli/agents/openai.yaml",
  "package/skills/huly-cli/references/automation.md"
]
const generatedSkillEntries = [
  { archive: "package/skills/huly-cli/SKILL.md", tracked: "packages/huly-cli/skills/huly-cli/SKILL.md" },
  {
    archive: "package/skills/huly-cli/agents/openai.yaml",
    tracked: "packages/huly-cli/skills/huly-cli/agents/openai.yaml"
  },
  {
    archive: "package/skills/huly-cli/references/automation.md",
    tracked: "packages/huly-cli/skills/huly-cli/references/automation.md"
  }
]

const run = (executable: string, args: ReadonlyArray<string>) =>
  Effect.tryPromise({
    try: () => execFilePromise(executable, args),
    catch: () => new CliSkillPackageError({ message: `Command failed: ${executable} ${args.join(" ")}` })
  })

const program = Effect.acquireUseRelease(
  Effect.tryPromise({
    try: () => fs.mkdtemp(path.join(os.tmpdir(), "huly-cli-skill-package-")),
    catch: () => new CliSkillPackageError({ message: "Could not create package smoke-test directory." })
  }),
  (directory) =>
    Effect.gen(function* () {
      const pnpm = process.env["npm_execpath"]
      if (pnpm === undefined) {
        return yield* new CliSkillPackageError({ message: "pnpm executable is unavailable." })
      }
      yield* run(process.execPath, [pnpm, "--filter", "@firfi/huly-cli", "pack", "--pack-destination", directory])
      const fileNames = yield* Effect.tryPromise({
        try: () => fs.readdir(directory),
        catch: () => new CliSkillPackageError({ message: "Could not inspect packed CLI artifacts." })
      })
      const archives = yield* Schema.decodeUnknownEffect(Schema.Array(PackageFileNameSchema))(
        fileNames.filter((fileName) => fileName.endsWith(".tgz"))
      ).pipe(
        Effect.mapError(() => new CliSkillPackageError({ message: "Packed CLI artifact has an invalid filename." }))
      )
      const [archive, ...extraArchives] = archives
      if (archive === undefined || extraArchives.length > 0) {
        return yield* new CliSkillPackageError({ message: "Expected exactly one packed CLI artifact." })
      }
      const archivePath = path.join(directory, archive)
      const listing = yield* run("tar", ["-tzf", archivePath])
      const entries = yield* Schema.decodeUnknownEffect(TarEntrySchema)(listing.stdout.trim().split("\n")).pipe(
        Effect.mapError(() => new CliSkillPackageError({ message: "CLI tarball listing is malformed." }))
      )
      const missing = requiredEntries.filter((entry) => !entries.includes(entry))
      if (missing.length > 0) {
        return yield* new CliSkillPackageError({ message: `CLI tarball is missing: ${missing.join(", ")}.` })
      }
      const extracted = yield* Effect.forEach(generatedSkillEntries, (entry) =>
        Effect.gen(function* () {
          const packed = yield* run("tar", ["-xOzf", archivePath, entry.archive])
          const tracked = yield* Effect.tryPromise({
            try: () => fs.readFile(entry.tracked, "utf8"),
            catch: () => new CliSkillPackageError({ message: `Could not read tracked skill file ${entry.tracked}.` })
          })
          return { entry, packed: packed.stdout, tracked }
        })
      )
      const skill = extracted.find((entry) => entry.entry.archive.endsWith("/SKILL.md"))
      if (skill === undefined || !skill.packed.startsWith("---\nname: huly-cli\n") || skill.packed.includes("TODO")) {
        return yield* new CliSkillPackageError({ message: "Packed Huly CLI skill is not usable." })
      }
      const stale = extracted.filter((entry) => entry.packed !== entry.tracked).map((entry) => entry.entry.archive)
      if (stale.length > 0) {
        return yield* new CliSkillPackageError({ message: `Packed Huly CLI skill bytes differ: ${stale.join(", ")}.` })
      }
      yield* Console.log("CLI tarball contains byte-identical generated Huly CLI Agent Skill files.")
    }),
  (directory) => Effect.promise(() => fs.rm(directory, { force: true, recursive: true }))
)

NodeRuntime.runMain(program)
