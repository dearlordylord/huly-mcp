import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { test } from "vitest"

const execute = promisify(execFile)

test.skipIf(process.platform !== "linux")(
  "Linux resource observer preserves ownership and private diagnostic output",
  async () => {
    await execute(
      "python3",
      ["-B", "-m", "unittest", "discover", "-s", "test/resident/fixtures", "-p", "process_resources_test.py"],
      { timeout: 5_000 }
    )
  }
)
