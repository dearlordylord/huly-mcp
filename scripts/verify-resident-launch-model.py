#!/usr/bin/env python3
"""Run bounded launch-model scenarios and retain exact inputs and all results."""
import argparse
import hashlib
import json
import os
import signal
from pathlib import Path
import re
import subprocess
import tempfile


COMMAND_SECONDS = 60
CLEANUP_SECONDS = 5


def run_owned_command(command, cwd, deadline=COMMAND_SECONDS):
    """Own one fresh POSIX session; join it after bounded forced cleanup."""
    process = subprocess.Popen(command, cwd=cwd, text=True, stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT, start_new_session=True)
    reason = None
    signal_failure = None
    joined = False
    output = ""
    try:
        output, _ = process.communicate(timeout=deadline)
        joined = True
    except (subprocess.TimeoutExpired, KeyboardInterrupt) as error:
        reason = "timeout" if isinstance(error, subprocess.TimeoutExpired) else "interrupted"
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        except OSError as cleanup_error:
            signal_failure = type(cleanup_error).__name__
        try:
            output, _ = process.communicate(timeout=CLEANUP_SECONDS)
            joined = True
        except subprocess.TimeoutExpired as cleanup_error:
            partial = cleanup_error.output or b""
            output = partial.decode(errors="replace") if isinstance(partial, bytes) else partial
    return {
        "exit": process.returncode if reason is None else (124 if reason == "timeout" else 130),
        "reason": reason,
        "ownedProcessJoined": joined,
        "cleanupSignalFailure": signal_failure,
        "output": output,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    out = args.out or Path(tempfile.mkdtemp(prefix="resident-launch-model-"))
    out.mkdir(parents=True, exist_ok=True)
    sources = sorted((root / "quint-specs").glob("resident-launch*.qnt"))
    sources += [root / "test/helpers/resident-launch-replay.ts", root / "test/resident/launch-model-alignment.test.ts"]
    hashes = {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sources}
    model = "quint-specs/resident-launch.qnt"
    scenarios = "quint-specs/resident-launch_test.qnt"
    witnesses = re.findall(r'  val (\w+) = seen.contains\(', (root / model).read_text())
    report = {"inputs": hashes, "cases": [], "witnesses": {name: 0 for name in witnesses}, "complete": False}

    def save():
        (out / "report.json").write_text(json.dumps(report, indent=2) + "\n")

    def run(name, argv):
        command = ["pnpm", "exec", "quint", *argv]
        save()
        result = run_owned_command(command, root)
        (out / (name + ".log")).write_text(result["output"])
        entry = {"name": name, "command": command, "deadlineSeconds": COMMAND_SECONDS,
            **{key: value for key, value in result.items() if key != "output"}}
        report["cases"].append(entry)
        save()
        print(json.dumps(entry), flush=True)
        if result["exit"] != 0 or not result["ownedProcessJoined"] or result["cleanupSignalFailure"]:
            raise SystemExit("Quint failed; retained evidence: " + str(out))
        return result["output"]

    for name, path in [("scenarios", scenarios), ("observations", "quint-specs/resident-launch-observations_test.qnt")]:
        run(name + "-typecheck", ["typecheck", path])
        run(name + "-tests", ["test", path, "--backend=rust", "--match=Test$", "--max-samples=1"])
    schedules = [
        ("initial-faults", model, "init", "step"),
        ("healthy-service", scenarios, "init", "serviceStep"),
        ("publication-faults", scenarios, "publishedOwner", "step"),
        ("attached-faults", scenarios, "attachedOwner", "step"),
        ("model-wait-faults", scenarios, "waitingOwner", "step"),
        ("write-faults", scenarios, "runningWriteOwner", "step"),
        ("uncertain-write-faults", scenarios, "uncertainOwner", "step"),
        ("replacement-faults", scenarios, "replacementOwner", "step"),
    ]
    for name, path, initial, step in schedules:
        output = run(name, ["run", path, "--init=" + initial, "--step=" + step,
            "--backend=rust", "--n-threads=1", "--seed=324", "--max-samples=100", "--max-steps=64",
            "--verbosity=1", "--invariant=safety", "--witnesses", *witnesses])
        counts = {name: int(count) for name, count in re.findall(r'(\w+) was witnessed in (\d+) trace', output)}
        if counts.keys() != report["witnesses"].keys():
            raise SystemExit("Missing witness results; retained evidence: " + str(out))
        report["cases"][-1]["witnesses"] = counts
        for witness, count in counts.items():
            report["witnesses"][witness] += count
        save()
    report["uncovered"] = [name for name, count in report["witnesses"].items() if count == 0]
    current = {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sources}
    report["inputsUnchanged"] = current == hashes
    report["complete"] = not report["uncovered"] and report["inputsUnchanged"]
    save()
    if not report["complete"]:
        raise SystemExit("Model qualification incomplete; retained evidence: " + str(out))
    print("Bounded model checks passed; evidence: " + str(out))


if __name__ == "__main__":
    main()
