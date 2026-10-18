"""Linux diagnostic samples; no command lines, environment or process signals."""
import json
import os
from pathlib import Path

SAMPLE_SECONDS = 0.1
MAX_PROCESSES = 1024


def parse_stat(text, page_bytes):
    # comm may contain spaces and parentheses; fields start after its last ') '.
    prefix, separator, suffix = text.rpartition(") ")
    if not separator:
        raise ValueError("Invalid Linux process stat")
    fields = suffix.split()
    return {
        "processId": int(prefix.split(" ", 1)[0]),
        "parentProcessId": int(fields[1]),
        "state": fields[0],
        "userTicks": int(fields[11]),
        "systemTicks": int(fields[12]),
        "startTicks": int(fields[19]),
        "rssBytes": int(fields[21]) * page_bytes,
    }


def read_tree(root_pid, page_bytes):
    pending = [(root_pid, None)]
    seen = set()
    processes = []
    vanished = 0
    while pending:
        pid, expected_parent = pending.pop()
        if pid in seen:
            continue
        seen.add(pid)
        if len(seen) > MAX_PROCESSES:
            raise ValueError("Diagnostic process inventory exceeded its bound")
        try:
            root = Path(f"/proc/{pid}")
            first = parse_stat((root / "stat").read_text(encoding="latin-1"), page_bytes)
            if expected_parent is not None and first["parentProcessId"] != expected_parent:
                vanished += 1
                continue
            children = set()
            for task in (root / "task").iterdir():
                try:
                    children.update(int(value) for value in (task / "children").read_text(encoding="ascii").split())
                except (FileNotFoundError, ProcessLookupError):
                    pass
            second = parse_stat((root / "stat").read_text(encoding="latin-1"), page_bytes)
            if first["startTicks"] != second["startTicks"] or first["parentProcessId"] != second["parentProcessId"]:
                vanished += 1
                continue
            processes.append(second)
            pending.extend((child, pid) for child in children)
        except (FileNotFoundError, ProcessLookupError):
            vanished += 1
    return processes, vanished


class ResourceSamples:
    def __init__(self, filename, root_pid, clock):
        self.clock = clock
        self.root_pid = root_pid
        self.next_sample = clock()
        self.page_bytes = os.sysconf("SC_PAGE_SIZE")
        descriptor = os.open(filename, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        self.output = os.fdopen(descriptor, "w", encoding="ascii", buffering=1)
        self.write({
            "kind": "metadata", "rootProcessId": root_pid,
            "ticksPerSecond": os.sysconf("SC_CLK_TCK"), "pageBytes": self.page_bytes,
            "sampleSeconds": SAMPLE_SECONDS, "affinityCount": len(os.sched_getaffinity(0)),
            "loadAverage": os.getloadavg(),
            "scope": "supervisor and observed descendants; summed RSS is not physical memory",
        })

    def write(self, value):
        self.output.write(json.dumps(value, separators=(",", ":")) + "\n")

    def sample(self, force=False):
        now = self.clock()
        if not force and now < self.next_sample:
            return
        self.next_sample = now + SAMPLE_SECONDS
        processes, vanished = read_tree(self.root_pid, self.page_bytes)
        self.write({"kind": "sample", "monotonicSeconds": now, "processes": processes,
                    "vanishedDuringRead": vanished})

    def close(self, result):
        try:
            self.sample(force=True)
            self.write({"kind": "terminal", "exitCode": result})
        finally:
            self.output.close()
