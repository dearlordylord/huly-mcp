"""Run one Linux fixture under a bounded, kernel-owned child subreaper."""
import ctypes
import argparse
import json
import os
import signal
import subprocess
import sys
import time

PR_SET_CHILD_SUBREAPER = 36
RUN_SECONDS = 25
CLEANUP_SECONDS = 4
POLL_SECONDS = 0.02


def supervise(arguments, clock, sleep, report_reaped=False, resources=None):
    libc = ctypes.CDLL(None, use_errno=True)
    if libc.prctl(PR_SET_CHILD_SUBREAPER, 1, 0, 0, 0) != 0:
        raise OSError(ctypes.get_errno(), "Cannot establish fixture child ownership")
    stopping = False

    def stop(_signal, _frame):
        nonlocal stopping
        stopping = True

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    deadline = clock() + RUN_SECONDS
    events_read, events_write = os.pipe() if report_reaped else (None, None)
    environment = None
    if report_reaped:
        environment = dict(os.environ, HULY_TEST_REAPED_FD=str(events_read))
    try:
        child = subprocess.Popen(
            arguments,
            env=environment,
            pass_fds=() if events_read is None else (events_read,),
        )
    finally:
        if events_read is not None:
            os.close(events_read)
    result = None
    forced = False
    sampling_failed = False

    def reaped(pid, status):
        nonlocal result
        if pid == child.pid:
            result = os.waitstatus_to_exitcode(status)
            child.returncode = result
        if events_write is not None:
            event = {"processId": pid, "exitCode": os.waitstatus_to_exitcode(status)}
            try:
                os.write(events_write, (json.dumps(event) + "\n").encode("ascii"))
            except BrokenPipeError:
                pass

    while True:
        if resources is not None and not sampling_failed:
            try:
                resources.sample()
            except (OSError, ValueError, IndexError):
                sampling_failed = True
                sys.stderr.write("Diagnostic resource sampling failed; owned cleanup continues\n")
        try:
            pid, status = os.waitpid(-1, os.WNOHANG)
        except ChildProcessError:
            break
        if pid:
            reaped(pid, status)
            continue
        if stopping or clock() >= deadline:
            forced = True
            children_path = f"/proc/self/task/{os.getpid()}/children"
            with open(children_path, encoding="ascii") as children:
                owned = [int(value) for value in children.read().split()]
            for owned_pid in owned:
                # A live, unreaped direct child cannot have its PID recycled.
                pid, status = os.waitpid(owned_pid, os.WNOHANG)
                if pid:
                    reaped(pid, status)
                else:
                    try:
                        os.kill(owned_pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
            if clock() >= deadline + CLEANUP_SECONDS:
                raise RuntimeError("Owned fixture descendants did not retire")
        sleep(POLL_SECONDS)
    if events_write is not None:
        os.close(events_write)
    if forced:
        sys.stderr.write("Fixture supervision deadline exceeded; owned descendants terminated\n")
        return 1
    return 1 if result is None or sampling_failed else result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report-reaped", action="store_true")
    parser.add_argument("--resources", help="Exclusive new private Linux diagnostic NDJSON file")
    parser.add_argument("command", nargs=argparse.REMAINDER)
    options = parser.parse_args()
    if not options.command:
        parser.error("A fixture command is required")
    samples = None
    if options.resources is not None:
        from process_resources import ResourceSamples
        samples = ResourceSamples(options.resources, os.getpid(), time.monotonic)
    outcome = 1
    try:
        outcome = supervise(options.command, time.monotonic, time.sleep, options.report_reaped, samples)
    finally:
        if samples is not None:
            samples.close(outcome)
    sys.exit(outcome)
