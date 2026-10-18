"""Signal only a retained Linux pidfd proven to belong to this fixture supervisor."""
import json
import os
import pathlib
import signal
import select
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
    adapter = int(sys.argv[4]) if len(sys.argv) > 4 else None
    adapter_fd = None
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
        if adapter is not None:
            adapter_fd = os.pidfd_open(adapter)
            adapter_poll = select.poll()
            adapter_poll.register(adapter_fd, select.POLLIN)
            if original[0] != adapter or adapter_poll.poll(0):
                raise ValueError("Target adapter is not its live parent")
        signal.pidfd_send_signal(with_pidfd, signal.SIGKILL)
        closed = select.poll()
        closed.register(with_pidfd, select.POLLIN)
        if not closed.poll(1000):
            raise ValueError("Signaled backend closure was not observed")
        receipt = {"processId": target, "startTicks": original[1], "signal": "SIGKILL", "closed": True}
        if adapter is not None:
            receipt["adapterPid"] = adapter
        print(json.dumps(receipt))
    finally:
        os.close(with_pidfd)
        if adapter_fd is not None:
            os.close(adapter_fd)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, IndexError):
        print("Owned backend fault refused", file=sys.stderr)
        sys.exit(1)
