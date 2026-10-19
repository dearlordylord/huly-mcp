"""Behavioral checks for the model runner's real subprocess ownership."""
import ctypes
import importlib.util
import os
from pathlib import Path
import signal
import sys
import time
import unittest

spec = importlib.util.spec_from_file_location("launch_runner", Path(__file__).with_name("verify-resident-launch-model.py"))
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class OwnedCommandTest(unittest.TestCase):
    def test_success_is_joined(self):
        result = runner.run_owned_command([sys.executable, "-c", "print('finished')"], Path.cwd(), deadline=2)
        self.assertEqual(result["exit"], 0)
        self.assertTrue(result["ownedProcessJoined"])
        self.assertEqual(result["output"], "finished\n")

    def test_interrupt_is_retained_and_owned_process_is_joined(self):
        code = "import os,signal,time; time.sleep(.05); os.kill(os.getppid(),signal.SIGINT); time.sleep(30)"
        result = runner.run_owned_command([sys.executable, "-c", code], Path.cwd(), deadline=2)
        self.assertEqual(result["exit"], 130)
        self.assertEqual(result["reason"], "interrupted")
        self.assertTrue(result["ownedProcessJoined"])
        self.assertIsNone(result["cleanupSignalFailure"])

    @unittest.skipUnless(sys.platform == "linux", "Linux subreaper supplies independent descendant wait evidence")
    def test_timeout_kills_and_joins_owned_descendant(self):
        libc = ctypes.CDLL(None, use_errno=True)
        self.assertEqual(libc.prctl(36, 1, 0, 0, 0), 0)
        code = "import subprocess,sys,time; child=subprocess.Popen([sys.executable,'-c','import time; time.sleep(30)']); print(child.pid,flush=True); time.sleep(30)"
        result = runner.run_owned_command([sys.executable, "-c", code], Path.cwd(), deadline=0.2)
        self.assertEqual(result["exit"], 124)
        self.assertEqual(result["reason"], "timeout")
        self.assertTrue(result["ownedProcessJoined"])
        child = int(result["output"].strip())
        self.assertIsNone(result["cleanupSignalFailure"])
        end = time.monotonic() + runner.CLEANUP_SECONDS
        waited, status = os.waitpid(child, os.WNOHANG)
        while waited == 0 and time.monotonic() < end:
            time.sleep(0.01)
            waited, status = os.waitpid(child, os.WNOHANG)
        self.assertEqual(waited, child)
        self.assertTrue(os.WIFSIGNALED(status))
        self.assertEqual(os.WTERMSIG(status), signal.SIGKILL)
        self.assertIsNone(result["cleanupSignalFailure"])
        self.assertEqual(libc.prctl(36, 0, 0, 0, 0), 0)


if __name__ == "__main__":
    unittest.main()
