import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { test } from "node:test"

const scriptsDirectory = fileURLToPath(new URL(".", import.meta.url))
const issue = (id, parent, children, childInfo) => ({ issue: { _id: id, attachedTo: parent, subIssues: children, estimation: 3, reportedTime: 2, childInfo } })
const info = (id) => ({ childId: id, estimation: 3, reportedTime: 2 })
const tree = () => ({ issues: [issue("root", "external", 1, [info("grandchild"), info("child")]), issue("child", "root", 1, [info("grandchild")]), issue("grandchild", "child", 0, [])] })
const inspect = (state) => spawnSync("jq", ["-L", scriptsDirectory, "-e", 'include "issue-tree-aggregates"; tree_aggregates_valid(.)'], { input: JSON.stringify(state), encoding: "utf8", timeout: 5000 })

test("accepts a complete three-level tree with reordered aggregate entries", () => {
  assert.equal(inspect(tree()).status, 0)
})
for (const [name, change] of [
  ["missing descendant", (state) => state.issues[0].issue.childInfo.pop()],
  ["duplicate descendant", (state) => state.issues[0].issue.childInfo.push(info("child"))],
  ["wrong estimation", (state) => state.issues[0].issue.childInfo[0].estimation++],
  ["wrong reported time", (state) => state.issues[0].issue.childInfo[0].reportedTime++],
  ["stale direct count", (state) => state.issues[0].issue.subIssues++],
  ["cycle", (state) => state.issues[0].issue.attachedTo = "grandchild"]
]) {
  test(`rejects ${name}`, () => {
    const state = tree()
    change(state)
    assert.notEqual(inspect(state).status, 0)
  })
}
