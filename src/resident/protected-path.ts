import { constants } from "node:fs"
import type { Stats } from "node:fs"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { Effect, Schema } from "effect"

const ROOT_USER = 0
const OTHER_PERMISSIONS = 0o077
const FOREIGN_WRITE = 0o022
const STICKY = 0o1000
export const PRIVATE_DIRECTORY_MODE = 0o700
export const PRIVATE_FILE_MODE = 0o600

export const ResidentDirectory = Schema.NonEmptyString.pipe(Schema.brand("ResidentDirectory"))
export type ResidentDirectory = Schema.Schema.Type<typeof ResidentDirectory>
export const ResidentFilePath = Schema.NonEmptyString.pipe(Schema.brand("ResidentFilePath"))
export type ResidentFilePath = Schema.Schema.Type<typeof ResidentFilePath>
export const ResidentPlatform = Schema.Literals(["linux", "darwin"])
const PosixOwner = Schema.Struct({
  platform: ResidentPlatform,
  userId: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
})
export type PosixOwner = Schema.Schema.Type<typeof PosixOwner>

export class ProtectedFileError extends Schema.TaggedError<ProtectedFileError>()("ProtectedFileError", {
  kind: Schema.Literals(["unsupported", "permission", "input", "io", "conflict"]),
  message: Schema.String
}) {}

export const unsupportedResidentProtection = () =>
  new ProtectedFileError({
    kind: "unsupported",
    message: "Resident attachment file protection is not qualified on this OS"
  })

export const fileFailure = () =>
  new ProtectedFileError({ kind: "io", message: "Resident attachment file operation failed" })
const permissionFailure = () =>
  new ProtectedFileError({
    kind: "permission",
    message: "Resident attachment requires private files and directories owned by this OS user"
  })

export const currentPosixOwner = Effect.suspend(() =>
  Schema.decodeUnknownEffect(PosixOwner)({ platform: process.platform, userId: process.getuid?.() }).pipe(
    Effect.mapError(unsupportedResidentProtection)
  )
)

const isProtectedAncestor = (entry: Stats, owner: PosixOwner) =>
  entry.isDirectory() &&
  (entry.uid === ROOT_USER || entry.uid === owner.userId) &&
  ((entry.mode & FOREIGN_WRITE) === 0 || (entry.mode & STICKY) !== 0)

const inspectAncestors = (directory: string, owner: PosixOwner) =>
  Effect.gen(function* () {
    const root = path.parse(directory).root
    let current = root
    for (const component of directory
      .slice(root.length)
      .split(path.sep)
      .filter((part) => part !== "")) {
      current = path.join(current, component)
      const entry = yield* Effect.tryPromise({ try: () => fs.lstat(current), catch: fileFailure })
      if (entry.isSymbolicLink()) {
        // Root-owned OS aliases are checked again through their canonical target.
        if (entry.uid !== ROOT_USER) return yield* permissionFailure()
        continue
      }
      if (!isProtectedAncestor(entry, owner)) return yield* permissionFailure()
    }
  })

export const inspectPrivateDirectory = (directory: ResidentDirectory, owner: PosixOwner) =>
  Effect.gen(function* () {
    const absolute = path.resolve(directory)
    yield* inspectAncestors(absolute, owner)
    const canonical = yield* Effect.tryPromise({ try: () => fs.realpath(absolute), catch: fileFailure })
    if (canonical !== absolute) yield* inspectAncestors(canonical, owner)
    const entry = yield* Effect.tryPromise({ try: () => fs.lstat(canonical), catch: fileFailure })
    if (!entry.isDirectory() || entry.uid !== owner.userId || (entry.mode & OTHER_PERMISSIONS) !== 0)
      return yield* permissionFailure()
    return ResidentDirectory.make(canonical)
  })

export const inspectPrivateFile = (handle: fs.FileHandle, owner: PosixOwner) =>
  Effect.gen(function* () {
    const entry = yield* Effect.tryPromise({ try: () => handle.stat({ bigint: true }), catch: fileFailure })
    if (!entry.isFile() || entry.uid !== BigInt(owner.userId) || (entry.mode & BigInt(OTHER_PERMISSIONS)) !== 0n)
      return yield* permissionFailure()
    return entry
  })

export const openPrivateFile = (file: ResidentFilePath) =>
  Effect.tryPromise({
    try: () => fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK),
    catch: (error) =>
      Schema.is(Schema.Struct({ code: Schema.Literals(["ELOOP", "EACCES", "EPERM"]) }))(error)
        ? permissionFailure()
        : fileFailure()
  })

export const closePrivateFile = (handle: fs.FileHandle) =>
  Effect.tryPromise({ try: () => handle.close(), catch: fileFailure })
