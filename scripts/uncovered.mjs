// Dump uncovered branch/function/statement locations for a source file from the v8 coverage JSON.
// Usage: node scripts/uncovered.mjs <substring-of-file-path>
import fs from "node:fs"

const needle = process.argv[2]
if (!needle) {
  console.error("usage: node scripts/uncovered.mjs <path-substring>")
  process.exit(1)
}
const cov = JSON.parse(fs.readFileSync("coverage/coverage-final.json", "utf8"))
const entry = Object.entries(cov).find(([f]) => f.includes(needle) && f.includes("/src/"))
if (!entry) {
  console.error("no coverage entry matching " + needle)
  process.exit(1)
}
const [file, data] = entry
console.log(file)
const loc = (l) => l ? `${l.start.line}:${l.start.column}-${l.end.line}:${l.end.column}` : "?"

console.log("\n== uncovered branches ==")
for (const [k, counts] of Object.entries(data.b || {})) {
  counts.forEach((c, i) => {
    if (c === 0) {
      const bm = data.branchMap[k]
      const where = bm.locations && bm.locations[i] ? loc(bm.locations[i]) : loc(bm.loc)
      console.log(`  ${bm.type} branch#${i} @ ${where}`)
    }
  })
}

console.log("\n== uncovered functions ==")
for (const [k, c] of Object.entries(data.f || {})) {
  if (c === 0) {
    const fm = data.fnMap[k]
    console.log(`  ${fm.name} @ ${loc(fm.decl)}`)
  }
}

console.log("\n== uncovered statements ==")
for (const [k, c] of Object.entries(data.s || {})) {
  if (c === 0) {
    console.log(`  @ ${loc(data.statementMap[k])}`)
  }
}
