import { execFile } from "node:child_process"
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"

import { expect, test } from "vitest"

import { Milliseconds, runBoundedCommand } from "../../scripts/run-bounded-command.js"

const execFileAsync = promisify(execFile)
const COMMAND_TIMEOUT = Milliseconds.make(2_000)
const PROCESS_TEST_TIMEOUT_MS = 30_000

const processExists = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ESRCH") {
      return false
    }
    throw error
  }
}

const terminateRecordedDescendant = async (pidFile: string): Promise<void> => {
  try {
    const pid = Number(await readFile(pidFile, "utf8"))
    if (processExists(pid)) process.kill(pid, "SIGKILL")
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error
  }
}

test("counts complete and unterminated stdout and stderr lines", async () => {
  const result = await runBoundedCommand({
    args: ["-e", "process.stdout.write('first\\nsecond'); process.stderr.write('third\\n')"],
    executable: process.execPath,
    forwardOutput: false,
    name: "output line fixture",
    timeoutMilliseconds: COMMAND_TIMEOUT
  })

  expect(result).toEqual({ outputLineCount: 3 })
})

test("counts a successful command with no output", async () => {
  const result = await runBoundedCommand({
    args: ["-e", ""],
    executable: process.execPath,
    forwardOutput: false,
    name: "empty output fixture",
    timeoutMilliseconds: COMMAND_TIMEOUT
  })

  expect(result).toEqual({ outputLineCount: 0 })
})

test(
  "forwards output by default while counting it",
  async () => {
    const runnerUrl = new URL("../../scripts/run-bounded-command.ts", import.meta.url).href
    const program = `
    import { Milliseconds, runBoundedCommand } from ${JSON.stringify(runnerUrl)}
    await runBoundedCommand({
      args: ["-e", "process.stdout.write('forwarded fixture\\\\n')"],
      executable: process.execPath,
      name: "forwarded output fixture",
      timeoutMilliseconds: Milliseconds.make(2000)
    })
  `
    const { stdout } = await execFileAsync(process.execPath, ["--import", "tsx", "--eval", program])

    expect(stdout).toBe("forwarded fixture\n")
  },
  PROCESS_TEST_TIMEOUT_MS
)

test("reports a nonzero command exit", async () => {
  await expect(
    runBoundedCommand({
      args: ["-e", "process.exit(7)"],
      executable: process.execPath,
      forwardOutput: false,
      name: "nonzero fixture",
      timeoutMilliseconds: COMMAND_TIMEOUT
    })
  ).rejects.toThrow("nonzero fixture failed with exit 7")
})

test("reports a command terminated by a signal", async () => {
  await expect(
    runBoundedCommand({
      args: ["-e", "process.kill(process.pid, 'SIGTERM')"],
      executable: process.execPath,
      forwardOutput: false,
      name: "signal fixture",
      timeoutMilliseconds: COMMAND_TIMEOUT
    })
  ).rejects.toThrow("signal fixture failed with SIGTERM")
})

test("reports failure to spawn the executable", async () => {
  await expect(
    runBoundedCommand({
      args: [],
      executable: "/path/that/does/not/exist/hulymcp-quality-fixture",
      forwardOutput: false,
      name: "spawn fixture",
      timeoutMilliseconds: COMMAND_TIMEOUT
    })
  ).rejects.toThrow("ENOENT")
})

test.skipIf(process.platform === "win32")(
  "kills a resistant descendant after the process-group leader exits",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "hulymcp-bounded-command-"))
    const pidFile = join(directory, "descendant.pid")
    const resistantDescendant = "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"
    const leader = `
      const { spawn } = require("node:child_process")
      const { writeFileSync } = require("node:fs")
      const descendant = spawn(
        process.execPath,
        ["-e", ${JSON.stringify(resistantDescendant)}],
        { stdio: "ignore" }
      )
      writeFileSync(${JSON.stringify(pidFile)}, String(descendant.pid))
      process.on("SIGTERM", () => process.exit(0))
      setInterval(() => {}, 1000)
    `

    try {
      const custodyDirectory = join(directory, "custody")
      const program = `
      const {runBoundedCommand,Milliseconds}=await import('./scripts/run-bounded-command.ts');
      try { await runBoundedCommand({executable:process.execPath,args:['-e',${JSON.stringify(leader)}],name:'resistant descendant fixture',timeoutMilliseconds:Milliseconds.make(${COMMAND_TIMEOUT}),terminationGraceMilliseconds:Milliseconds.make(100)}); }
      catch(error) { console.log(error.message); }
    `
      const { stdout } = await execFileAsync(process.execPath, ["--import", "tsx", "--eval", program], {
        env: { ...process.env, MOVEMENT_CUSTODY_DIR: custodyDirectory }
      })
      expect(stdout).toContain("resistant descendant fixture exceeded 2 seconds")
      expect(await readdir(custodyDirectory)).toEqual([])

      const descendantPid = Number(await readFile(pidFile, "utf8"))
      await expect.poll(() => processExists(descendantPid), { interval: 20, timeout: 2_000 }).toBe(false)
    } finally {
      await terminateRecordedDescendant(pidFile)
      await rm(directory, { force: true, recursive: true })
    }
  }
)

test.skipIf(process.platform === "win32")(
  "relays parent termination to its detached stage and descendant",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "hulymcp-parent-term-"))
    const pidFile = join(directory, "descendant.pid")
    const leader = `
    const { spawn } = require('node:child_process');
    const { writeFileSync } = require('node:fs');
    const descendant = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {stdio:'inherit'});
    writeFileSync(${JSON.stringify(pidFile)}, String(descendant.pid));
    process.kill(process.ppid, 'SIGTERM');
    setInterval(() => {}, 1000);
  `
    const program = `
    const {runBoundedCommand, Milliseconds} = await import('./scripts/run-bounded-command.ts');
    try { await runBoundedCommand({executable:process.execPath,args:['-e',${JSON.stringify(leader)}],name:'parent relay',timeoutMilliseconds:Milliseconds.make(30000)}); }
    catch (error) { console.log(error.message); }
  `
    try {
      const { stdout } = await execFileAsync(process.execPath, ["--import", "tsx", "--eval", program])
      expect(stdout).toContain("parent relay interrupted by SIGTERM")
      expect(processExists(Number(await readFile(pidFile, "utf8")))).toBe(false)
    } finally {
      await terminateRecordedDescendant(pidFile)
      await rm(directory, { recursive: true, force: true })
    }
  },
  PROCESS_TEST_TIMEOUT_MS
)

test.skipIf(process.platform === "win32")(
  "retains custody when a normal leader exits before group absence is proven",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "hulymcp-custody-"))
    const pidFile = join(directory, "descendant.pid")
    const custodyDirectory = join(directory, "custody")
    const leader = `
    const {spawn} = require('node:child_process');
    const {writeFileSync} = require('node:fs');
    const child = spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{stdio:'ignore'});
    writeFileSync(${JSON.stringify(pidFile)},String(child.pid));
    child.unref();
  `
    const program = `
    const {runBoundedCommand,Milliseconds} = await import('./scripts/run-bounded-command.ts');
    const clock = {value:0};
    try { await runBoundedCommand({executable:process.execPath,args:['-e',${JSON.stringify(leader)}],name:'custody fixture',timeoutMilliseconds:Milliseconds.make(30000),cleanup:{now:()=>clock.value,pause:async()=>{clock.value+=10000}}}); }
    catch(error) { console.log(error.message); }
  `
    try {
      const { stdout } = await execFileAsync(process.execPath, ["--import", "tsx", "--eval", program], {
        env: { ...process.env, MOVEMENT_CUSTODY_DIR: custodyDirectory }
      })
      expect(stdout).toContain("process-group cleanup is unconfirmed")
      const files = await readdir(custodyDirectory)
      expect(files).toHaveLength(1)
      expect(JSON.parse(await readFile(join(custodyDirectory, files[0] ?? ""), "utf8"))).toMatchObject({
        state: "unconfirmed"
      })
      const descendantPid = Number(await readFile(pidFile, "utf8"))
      await expect.poll(() => processExists(descendantPid), { timeout: 2000 }).toBe(false)
    } finally {
      await terminateRecordedDescendant(pidFile)
      await rm(directory, { recursive: true, force: true })
    }
  },
  PROCESS_TEST_TIMEOUT_MS
)

test.skipIf(process.platform === "win32")(
  "settles unconfirmed cleanup when an escaped descendant holds stage stdio",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "hulymcp-escaped-stdio-"))
    const pidFile = join(directory, "descendant.pid")
    const leader = `
    const {spawn}=require('node:child_process');
    const {writeFileSync}=require('node:fs');
    const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'inherit'});
    writeFileSync(${JSON.stringify(pidFile)},String(child.pid));child.unref();
  `
    try {
      const program = `
      const {runBoundedCommand,Milliseconds}=await import('./scripts/run-bounded-command.ts');
      try { await runBoundedCommand({executable:process.execPath,args:['-e',${JSON.stringify(leader)}],name:'escaped stdio',timeoutMilliseconds:Milliseconds.make(${COMMAND_TIMEOUT}),terminationGraceMilliseconds:Milliseconds.make(100)}); }
      catch(error) { console.log(error.message); }
    `
      const { stdout } = await execFileAsync(process.execPath, ["--import", "tsx", "--eval", program], {
        env: { ...process.env, MOVEMENT_CUSTODY_DIR: join(directory, "custody") }
      })
      expect(stdout).toContain("process-group cleanup is unconfirmed")
    } finally {
      await terminateRecordedDescendant(pidFile)
      await rm(directory, { recursive: true, force: true })
    }
  },
  PROCESS_TEST_TIMEOUT_MS
)
