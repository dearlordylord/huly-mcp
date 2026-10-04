import { Effect, Schema } from "effect"
import { lstat, readFile, realpath, rename, writeFile } from "node:fs/promises"
import { NonEmptyString } from "../src/domain/schemas/shared.js"
import { mergeTreeLedger, TreeLedgerSnapshot } from "./issue-tree-ledger.js"

const PERMISSION_BITS = 0o777
const PRIVATE_DIRECTORY_MODE = 0o700
const Arguments = Schema.Struct({ directory: NonEmptyString, snapshot: TreeLedgerSnapshot })
class LedgerUnavailable extends Schema.TaggedError<LedgerUnavailable>()("LedgerUnavailable", {}) {}
const io = <A>(run: () => Promise<A>) => Effect.tryPromise({ try: run, catch: () => new LedgerUnavailable() })
const priorLedger = (file: string) =>
  Effect.tryPromise({
    try: async () => {
      try {
        return await readFile(file, "utf8")
      } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return undefined
        throw error
      }
    },
    catch: () => new LedgerUnavailable()
  }).pipe(
    Effect.flatMap((raw) =>
      raw === undefined
        ? Effect.succeed(undefined)
        : Schema.decodeUnknownEffect(Schema.fromJsonString(TreeLedgerSnapshot))(raw)
    )
  )
export const persistTreeLedger = Effect.fn("persistTreeLedger")(function* (
  directory: NonEmptyString,
  snapshot: TreeLedgerSnapshot
) {
  const stat = yield* io(() => lstat(directory))
  const normalized = yield* io(() => realpath(directory))
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    normalized !== directory ||
    stat.uid !== process.getuid?.() ||
    (stat.mode & PERMISSION_BITS) !== PRIVATE_DIRECTORY_MODE
  )
    return yield* new LedgerUnavailable()
  const file = `${directory}/tree-ledger.json`
  const previous = yield* priorLedger(file)
  const merged = mergeTreeLedger(previous, snapshot)
  if (merged === undefined) return yield* new LedgerUnavailable()
  const parsed = yield* Schema.decodeUnknownEffect(TreeLedgerSnapshot)(merged)
  const temporary = `${directory}/tree-ledger.pending.json`
  yield* io(() => writeFile(temporary, JSON.stringify(parsed), { mode: 0o600, flag: "wx" }))
  yield* io(() => rename(temporary, file))
})
const main = Effect.gen(function* () {
  const args = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Arguments))(process.argv[2])
  yield* persistTreeLedger(args.directory, args.snapshot)
})
void Effect.runPromise(main).catch(() => {
  process.stderr.write("Private tree ledger unavailable\n")
  process.exitCode = 1
})
