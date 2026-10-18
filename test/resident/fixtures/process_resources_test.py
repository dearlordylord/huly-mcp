"""Executable checks for the optional Linux-only diagnostic observer."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest

from process_resources import ResourceSamples, parse_stat, read_tree


class ResourceTests(unittest.TestCase):
    def reaper(self):
        import importlib.util
        spec = importlib.util.spec_from_file_location("reaper", Path(__file__).with_name("reap-descendants.py"))
        reaper = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(reaper)
        return reaper

    def test_stat_with_parentheses_and_spaces(self):
        fields = ["S", "42"] + ["0"] * 22
        fields[11], fields[12], fields[19], fields[21] = "7", "9", "1234", "10"
        parsed = parse_stat("99 (worker (private) name) " + " ".join(fields), 4096)
        self.assertEqual(parsed, {"processId": 99, "parentProcessId": 42, "state": "S",
                                 "userTicks": 7, "systemTicks": 9, "startTicks": 1234,
                                 "rssBytes": 40960})
        self.assertNotIn("private", json.dumps(parsed))

    def test_actual_child_and_private_exclusive_output(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "resources.ndjson"
            child = subprocess.Popen([sys.executable, "-c", "import sys; sys.stdin.read()"], stdin=subprocess.PIPE)
            try:
                samples = ResourceSamples(target, os.getpid(), time.monotonic)
                try:
                    with self.assertRaises(FileExistsError):
                        ResourceSamples(target, os.getpid(), time.monotonic)
                    samples.sample(force=True)
                finally:
                    samples.close(0)
                rows = [json.loads(line) for line in target.read_text().splitlines()]
                self.assertEqual(target.stat().st_mode & 0o777, 0o600)
                observed = {item["processId"] for row in rows if row["kind"] == "sample"
                            for item in row["processes"]}
                self.assertTrue({os.getpid(), child.pid} <= observed)
                self.assertEqual(rows[-1], {"kind": "terminal", "exitCode": 0})
                self.assertNotIn("stdin.read", target.read_text())
            finally:
                child.communicate(timeout=3)
            self.assertEqual(child.returncode, 0)
            processes, _ = read_tree(os.getpid(), os.sysconf("SC_PAGE_SIZE"))
            self.assertNotIn(child.pid, {item["processId"] for item in processes})

    def test_sampler_failure_does_not_abandon_owned_child(self):
        reaper = self.reaper()

        class FailingSamples:
            def sample(self):
                raise OSError("Synthetic diagnostic output failure")

        with tempfile.TemporaryDirectory() as directory:
            completed = Path(directory) / "completed"
            command = [sys.executable, "-c", "import pathlib,sys,time; time.sleep(.1); pathlib.Path(sys.argv[1]).touch()",
                       str(completed)]
            result = reaper.supervise(command, time.monotonic, time.sleep, resources=FailingSamples())
            self.assertEqual(result, 1)
            self.assertTrue(completed.exists())

    def test_kernel_cpu_receipts_include_waited_grandchildren(self):
        burn = "import time\nstart=time.process_time()\nwhile time.process_time()-start<.08:pass\n"
        command = [sys.executable, "-c", "import subprocess,sys; subprocess.run([sys.executable,'-c',sys.argv[1]],check=True)", burn]
        with tempfile.TemporaryFile(mode="w+") as receipts:
            result = self.reaper().supervise(command, time.monotonic, time.sleep, cpu_receipts=receipts)
            receipts.seek(0)
            rows = [json.loads(line) for line in receipts]
        self.assertEqual(result, 0)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["exitCode"], 0)
        self.assertGreaterEqual(rows[0]["userSeconds"] + rows[0]["systemSeconds"], .08)

    def test_kernel_cpu_receipts_separate_adopted_descendants(self):
        command = [sys.executable, "-c", "import os,time\npid=os.fork()\nif pid:os._exit(0)\nstart=time.process_time()\nwhile time.process_time()-start<.08:pass\n"]
        with tempfile.TemporaryFile(mode="w+") as receipts:
            result = self.reaper().supervise(command, time.monotonic, time.sleep, cpu_receipts=receipts)
            receipts.seek(0)
            rows = [json.loads(line) for line in receipts]
        self.assertEqual(result, 0)
        self.assertEqual(len(rows), 2)
        self.assertEqual(len({row["processId"] for row in rows}), 2)
        self.assertTrue(all(row["exitCode"] == 0 for row in rows))
        self.assertGreaterEqual(sum(row["userSeconds"] + row["systemSeconds"] for row in rows), .08)

    def test_cpu_receipt_failure_still_joins_owned_descendants(self):
        class FailingReceipts:
            def write(self, _value):
                raise OSError("Synthetic receipt output failure")

        with tempfile.TemporaryDirectory() as directory:
            completed = Path(directory) / "completed"
            command = [sys.executable, "-c", "import os,pathlib,sys,time\npid=os.fork()\nif pid:os._exit(0)\ntime.sleep(.05)\npathlib.Path(sys.argv[1]).touch()", str(completed)]
            result = self.reaper().supervise(command, time.monotonic, time.sleep, cpu_receipts=FailingReceipts())
            self.assertEqual(result, 1)
            self.assertTrue(completed.exists())

    def test_cpu_receipt_file_is_private_and_exclusive_before_launch(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "cpu.ndjson"
            marker = Path(directory) / "marker"
            command = [sys.executable, str(Path(__file__).with_name("reap-descendants.py")), "--cpu-receipts", str(target),
                       sys.executable, "-c", "import pathlib,sys; pathlib.Path(sys.argv[1]).touch()", str(marker)]
            first = subprocess.run(command, capture_output=True, timeout=3)
            self.assertEqual(first.returncode, 0)
            self.assertEqual(target.stat().st_mode & 0o777, 0o600)
            self.assertTrue(marker.exists())
            marker.unlink()
            original = target.read_bytes()
            second = subprocess.run(command, capture_output=True, timeout=3)
            self.assertNotEqual(second.returncode, 0)
            self.assertFalse(marker.exists())
            self.assertEqual(target.read_bytes(), original)


if __name__ == "__main__":
    unittest.main()
