/**
 * Issue domain operations — barrel re-export.
 *
 * Split into:
 * - issues-read: listIssues, getIssue
 * - issues-write: createIssue, deleteIssue
 * - issues-update: updateIssue
 * - issues-move: addLabel, moveIssue
 *
 * @module
 */
export { addLabel, moveIssue } from "./issues-move.js"
export { getIssue, listIssues } from "./issues-read.js"
export { updateIssue } from "./issues-update.js"
export { createIssue, deleteIssue } from "./issues-write.js"
