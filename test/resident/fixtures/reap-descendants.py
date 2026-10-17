"""Run one Linux fixture under a bounded, kernel-owned child subreaper."""
import ctypes
import os
import signal
import subprocess
import sys
import time

PR_SET_CHILD_SUBREAPER = 36
RUN_SECONDS = 25
CLEANUP_SECONDS = 4
POLL_SECONDS = 0.02


def supervise(arguments, clock, sleep):
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
    child = subprocess.Popen(arguments)
    result = None
    forced = False

    def reaped(pid, status):
        nonlocal result
        if pid == child.pid:
            result = os.waitstatus_to_exitcode(status)
            child.returncode = result

    while True:
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
    if forced:
        sys.stderr.write("Fixture supervision deadline exceeded; owned descendants terminated\n")
        return 1
    return 1 if result is None else result


if __name__ == "__main__":
    sys.exit(supervise(sys.argv[1:], time.monotonic, time.sleep))
