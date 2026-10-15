"""Private integration-fixture access; never prints credential material."""
import hashlib
import json
import os
import subprocess


def saved_token(root, name="shared-live"):
    metadata = json.loads((root / "credentials.json").read_text())
    if name in metadata["tokens"]:
        return metadata["tokens"][name]
    backend = metadata["native"][name]["backend"]
    key = hashlib.sha256(json.dumps([str(root), name], separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
    if backend == "linux-secret-service":
        argv = [os.environ.get("HULY_TEST_SECRET_TOOL", "secret-tool"), "lookup", "application", "huly-mcp", "profile", key]
    elif backend == "macos-keychain":
        argv = ["/usr/bin/security", "find-generic-password", "-s", "io.github.dearlordylord.huly-mcp", "-a", key, "-w"]
    else:
        raise AssertionError("Unexpected native backend")
    result = subprocess.run(argv, capture_output=True, text=True, timeout=10)
    assert result.returncode == 0, "Test fixture could not read native credential; output suppressed."
    return json.loads(result.stdout)["token"]
