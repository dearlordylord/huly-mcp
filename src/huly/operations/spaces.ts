/**
 * Generic Huly space, space type, role, and permission operations.
 *
 * This layer intentionally handles discovery and safe metadata/member updates
 * only. Module-specific tools remain the friendly entrypoints for creating or
 * deleting project, teamspace, card, drive, and other typed spaces.
 *
 * @module
 */
export { getSpace, getSpaceType, listSpacePermissions, listSpaces, listSpaceTypes } from "./spaces-read.js"

export { addSpaceMembers, removeSpaceMembers, setSpaceOwners, updateSpace } from "./spaces-write.js"

export { mergeUniqueSortedAccountUuids, removeAccountUuids } from "./spaces-shared.js"
