"""Signal only a retained Linux pidfd proven to belong to this fixture supervisor."""
import json
import os
import pathlib
import signal
import sys


def identity(pid):
    text = pathlib.Path(f"/proc/{pid}/stat").read_text()
    fields = text[text.rindex(")") + 2:].split()
    return int(fields[1]), int(fields[19])


def main():
    target, supervisor = map(int, sys.argv[1:3])
    bundle = os.fsencode(sys.argv[3])
    if target <= 1 or supervisor <= 1 or target == supervisor:
        raise ValueError("Invalid fixture process identity")
    with_pidfd = os.pidfd_open(target)
    try:
        original = identity(target)
        current = target
        for _ in range(32):
            parent, _ = identity(current)
            if parent == supervisor:
                break
            if parent <= 1 or parent == current:
                raise ValueError("Target is outside fixture supervisor ancestry")
            current = parent
        else:
            raise ValueError("Fixture ancestry exceeds bound")
        arguments = pathlib.Path(f"/proc/{target}/cmdline").read_bytes().split(b"\0")
        if bundle not in arguments:
            raise ValueError("Target does not run the fixture package")
        if identity(target) != original:
            raise ValueError("Target identity changed before fault")
        signal.pidfd_send_signal(with_pidfd, signal.SIGKILL)
        print(json.dumps({"processId": target, "startTicks": original[1], "signal": "SIGKILL"}))
    finally:
        os.close(with_pidfd)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, IndexError):
        print("Owned backend fault refused", file=sys.stderr)
        sys.exit(1)
