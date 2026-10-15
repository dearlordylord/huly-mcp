"""Command-boundary failures against the disposable Linux Secret Service fixture."""
import json
import os
import pathlib
import subprocess
import time

from profile_test_credentials import saved_token


def run_private_native_failures(cli, root):
    token = saved_token(root)
    profiles = (root / "profiles.json").read_bytes()
    credentials = (root / "credentials.json").read_bytes()
    lock = subprocess.run([
        "gdbus", "call", "--session", "--dest", "org.freedesktop.secrets",
        "--object-path", "/org/freedesktop/secrets", "--method",
        "org.freedesktop.Secret.Service.Lock", '["/org/freedesktop/secrets/collection/login"]'
    ], capture_output=True, timeout=10)
    assert lock.returncode == 0, "Could not lock disposable test collection."
    for argv, stdin in [
        ([cli, "projects", "list", "--profile", "shared-live", "--json"], None),
        ([cli, "auth", "import-token", "--profile", "shared-live", "--stdin"], token),
        ([cli, "auth", "logout", "--profile", "shared-live"], None),
    ]:
        result = subprocess.run(argv, input=stdin, text=True, capture_output=True, timeout=30)
        assert result.returncode != 0, "Locked native operation incorrectly succeeded."
        assert "Secret Service" in result.stdout + result.stderr, "Missing actionable native-store failure."
        assert token not in result.stdout + result.stderr, "Native failure exposed a token."
        assert (root / "profiles.json").read_bytes() == profiles, "Failed native operation changed metadata."
        assert (root / "credentials.json").read_bytes() == credentials, "Failed native operation changed saved reference."
    request = pathlib.Path(os.environ["HULY_TEST_MCP_REQUEST"]).read_text()
    mcp_environment = {**os.environ, "MCP_AUTO_EXIT": "true", "HULY_TOOL_MODE": "native"}
    locked_mcp = subprocess.run(["node", "dist/index.cjs"], input=request, text=True, capture_output=True, env=mcp_environment, timeout=10)
    assert locked_mcp.returncode != 0, "Locked stdio unexpectedly succeeded."
    assert "Secret Service" in locked_mcp.stdout + locked_mcp.stderr, "Stdio omitted actionable native-store failure."
    assert token not in locked_mcp.stdout + locked_mcp.stderr, "Locked stdio exposed token."
    status = subprocess.run([cli, "auth", "status", "--profile", "shared-live", "--json"], text=True, capture_output=True, timeout=10)
    assert status.returncode == 0, "Offline status accessed locked native storage."
    assert json.loads(status.stdout)["configured"] is True
    unlock = subprocess.run([
        os.environ["HULY_TEST_KEYRING_DAEMON"], "--replace", "--unlock", "--components=secrets",
        "--control-directory=" + os.environ["HULY_TEST_KEYRING_CONTROL"]
    ], input="test-unlock-password", text=True, capture_output=True, timeout=10)
    assert unlock.returncode == 0, "Could not unlock disposable test collection."
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        state = subprocess.run([
            "gdbus", "call", "--session", "--dest", "org.freedesktop.secrets",
            "--object-path", "/org/freedesktop/secrets/collection/login", "--method",
            "org.freedesktop.DBus.Properties.Get", "org.freedesktop.Secret.Collection", "Locked"
        ], capture_output=True, text=True, timeout=1)
        if state.returncode == 0 and "<false>" in state.stdout:
            break
        time.sleep(0.05)
    else:
        raise AssertionError("Disposable Secret Service did not become unlocked.")
    assert saved_token(root) == token, "Failed locked replacement did not preserve the credential."
    missing_session = {key: value for key, value in mcp_environment.items() if key != "DBUS_SESSION_BUS_ADDRESS"}
    for argv, stdin in [([cli, "projects", "list", "--profile", "shared-live", "--json"], None), (["node", "dist/index.cjs"], request)]:
        result = subprocess.run(argv, input=stdin, text=True, capture_output=True, env=missing_session, timeout=10)
        assert result.returncode != 0, "Missing D-Bus session unexpectedly succeeded."
        assert "Secret Service" in result.stdout + result.stderr, "Missing actionable D-Bus session error."
        assert token not in result.stdout + result.stderr, "Missing-session failure exposed token."


if __name__ == "__main__":
    run_private_native_failures(os.environ["HULY_PREPARED_CLI"], pathlib.Path(os.environ["XDG_CONFIG_HOME"]) / "huly")
