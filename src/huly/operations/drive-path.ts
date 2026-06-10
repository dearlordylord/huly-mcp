export interface NormalizedDrivePath {
  readonly path: string
  readonly segments: ReadonlyArray<string>
}

const DROP_LAST_SEGMENT = -1

export const normalizeDrivePath = (input: string): NormalizedDrivePath => {
  const absolute = input.startsWith("/") ? input : `/${input}`
  const segments = absolute.split("/").reduce<ReadonlyArray<string>>((acc, rawSegment) => {
    if (rawSegment === "" || rawSegment === ".") return acc
    if (rawSegment === "..") {
      return acc.slice(0, DROP_LAST_SEGMENT)
    }
    return [...acc, rawSegment]
  }, [])

  return {
    path: segments.length === 0 ? "/" : `/${segments.join("/")}`,
    segments
  }
}

export const parentPathOf = (path: NormalizedDrivePath): NormalizedDrivePath => {
  const parentSegments = path.segments.slice(0, DROP_LAST_SEGMENT)
  return {
    path: parentSegments.length === 0 ? "/" : `/${parentSegments.join("/")}`,
    segments: parentSegments
  }
}

export const childPath = (parentPath: string, title: string): string =>
  parentPath === "/" ? `/${title}` : `${parentPath}/${title}`

export const rewriteMovedFolderDescendantPath = <T>(
  descendantPath: ReadonlyArray<T>,
  movedFolderId: T,
  newMovedFolderPath: ReadonlyArray<T>
): ReadonlyArray<T> => {
  const sourceIndex = descendantPath.indexOf(movedFolderId)
  if (sourceIndex < 0) return descendantPath
  return [...descendantPath.slice(0, sourceIndex + 1), ...newMovedFolderPath]
}
