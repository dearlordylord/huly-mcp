import { describe, it } from "@effect/vitest"
import * as fc from "fast-check"
import { expect } from "vitest"

import { rewriteMovedFolderDescendantPath } from "../../../src/huly/operations/drive-path.js"
import { propertyTestParameters } from "../../helpers/property.js"

const folderRefArbitrary = fc.stringMatching(/^folder-[a-z0-9]{1,8}$/).filter((value) => value !== "folder-moving")

describe("Drive path rewriting properties", () => {
  it("preserves descendant-relative structure when a folder moves", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(folderRefArbitrary, { minLength: 1, maxLength: 5 }),
        fc.uniqueArray(folderRefArbitrary, { maxLength: 4 }),
        fc.uniqueArray(folderRefArbitrary, { maxLength: 4 }),
        (relativeParents, oldMovedFolderPath, newMovedFolderPath) => {
          const movedFolderId = "folder-moving"
          const descendantPath = [...relativeParents, movedFolderId, ...oldMovedFolderPath]

          const rewritten = rewriteMovedFolderDescendantPath(
            descendantPath,
            movedFolderId,
            newMovedFolderPath
          )

          expect(rewritten).toEqual([...relativeParents, movedFolderId, ...newMovedFolderPath])
        }
      ),
      propertyTestParameters
    )
  })

  it("leaves non-descendant paths unchanged", () => {
    fc.assert(
      fc.property(fc.uniqueArray(folderRefArbitrary, { maxLength: 5 }), (path) => {
        const rewritten = rewriteMovedFolderDescendantPath(path, "folder-moving", ["folder-new-parent"])

        expect(rewritten).toEqual(path)
      }),
      propertyTestParameters
    )
  })
})
