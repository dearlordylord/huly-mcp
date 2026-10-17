#!/usr/bin/env bash
set -euo pipefail
export PYTHONDONTWRITEBYTECODE=1
source "$(dirname "${BASH_SOURCE[0]}")/test-telemetry-env.sh" || exit 1
cd "$(dirname "${BASH_SOURCE[0]}")/.."
node_modules/.bin/esbuild --version >/dev/null
for name in HULY_URL HULY_WORKSPACE HULY_EMAIL HULY_PASSWORD; do
  if [[ -z "${!name:-}" ]]; then echo "Missing $name for live profile login." >&2; exit 1; fi
done
if [[ "$(uname -s)" == Darwin && -z "${HULY_TEST_PROFILE_HOME:-}" ]]; then
  # Darwin ignores XDG_CONFIG_HOME. Isolate every child, including PTY login,
  # before allowing it to create profiles in Application Support.
  python3 - scripts/integration_test_profiles.sh <<'PYHOME'
import hashlib, os, pathlib, subprocess, sys, tempfile

real_root = pathlib.Path.home() / 'Library' / 'Application Support' / 'huly'
def snapshot():
    return {path.name: hashlib.sha256(path.read_bytes()).hexdigest()
            for path in real_root.glob('*.json') if path.is_file()}

before = snapshot()
with tempfile.TemporaryDirectory(prefix='huly-profile-home-') as directory:
    environment = dict(os.environ, HOME=directory, HULY_TEST_PROFILE_HOME=directory)
    result = subprocess.run(['bash', sys.argv[1]], env=environment)
assert snapshot() == before, 'Profile qualification changed the real macOS profile store.'
sys.exit(result.returncode)
PYHOME
  exit $?
fi
TEST_TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TEST_TMPDIR"' EXIT
source scripts/packed-cli-test-helpers.sh
echo "Preparing packed CLI"
prepare_packed_cli "$TEST_TMPDIR"
echo "Creating isolated profile"
export XDG_CONFIG_HOME="$TEST_TMPDIR/config"
if [[ "$(uname -s)" == Darwin ]]; then
  export HULY_TEST_PROFILE_DIRECTORY="$HULY_TEST_PROFILE_HOME/Library/Application Support/huly"
else
  export HULY_TEST_PROFILE_DIRECTORY="$XDG_CONFIG_HOME/huly"
fi
export HULY_PROFILE=shared-live
"$HULY_PREPARED_CLI" profile create shared-live --url "$HULY_URL" --workspace "$HULY_WORKSPACE"
# Answer the real CLI prompts only when emitted; never print or pass secrets in argv.
export HULY_PREPARED_CLI
python3 - <<'PY'
import os, pty, select, subprocess, time
master, slave = pty.openpty()
proc = subprocess.Popen([os.environ['HULY_PREPARED_CLI'], 'auth', 'login', '--profile', 'shared-live', '--storage', os.environ.get('HULY_TEST_CREDENTIAL_STORAGE', 'file')], stdin=slave, stdout=slave, stderr=slave)
os.close(slave)
answers = [(b'Huly email: ', os.environ['HULY_EMAIL']), (b'Huly password: ', os.environ['HULY_PASSWORD'])]
output = b''
all_output = b''
deadline = time.monotonic() + 45
while proc.poll() is None and time.monotonic() < deadline:
    if select.select([master], [], [], 0.2)[0]:
        try: chunk = os.read(master, 4096)
        except OSError: break
        if not chunk: break
        output += chunk
        all_output += chunk
        if answers and answers[0][0] in output:
            _, answer = answers.pop(0)
            os.write(master, (answer + '\n').encode())
            output = b''
if proc.poll() is None:
    try: proc.wait(timeout=2)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()
        raise SystemExit('Live profile login timed out.')
if os.environ['HULY_PASSWORD'].encode() in all_output:
    raise SystemExit('Login exposed password in its output.')
if proc.returncode != 0 or answers:
    raise SystemExit('Live profile login failed: returncode=' + str(proc.returncode) + ', remaining prompts=' + str(len(answers)) + ', authentication failure=' + str(b'Huly login failed' in all_output) + ', terminal failure=' + str(b'Unable to read' in all_output))
PY
python3 - <<'PY'
import json, os, pathlib, sys
sys.path.insert(0, 'scripts')
from profile_test_credentials import saved_token
root = pathlib.Path(os.environ['HULY_TEST_PROFILE_DIRECTORY'])
credentials = json.loads((root / 'credentials.json').read_text())
metadata = (root / 'profiles.json').read_text()
password = os.environ['HULY_PASSWORD']
assert password not in (root / 'credentials.json').read_text() and password not in metadata, 'Password was persisted.'
assert saved_token(root) not in metadata, 'Token appeared in profile metadata.'
(root / 'saved-credential.json').write_text(json.dumps(credentials))
(root / 'saved-credential.json').chmod(0o600)
PY
echo "Login complete; testing private token import and failed replacement"
python3 - <<'PYIMPORT'
import json, os, pathlib, pty, select, subprocess, time, sys
sys.path.insert(0, 'scripts')
from profile_test_credentials import saved_token
cli = os.environ['HULY_PREPARED_CLI']
root = pathlib.Path(os.environ['HULY_TEST_PROFILE_DIRECTORY'])
original = (root / 'credentials.json').read_bytes()
token = saved_token(root)
master, slave = pty.openpty()
proc = subprocess.Popen([cli, 'auth', 'import-token', '--profile', 'shared-live'], stdin=slave, stdout=slave, stderr=slave)
os.close(slave)
output = b''
answered = False
deadline = time.monotonic() + 30
while proc.poll() is None and time.monotonic() < deadline:
    if select.select([master], [], [], 0.2)[0]:
        try: output += os.read(master, 4096)
        except OSError: break
        if not answered and b'Huly token: ' in output:
            os.write(master, (token + '\n').encode())
            answered = True
try: proc.wait(timeout=2)
except subprocess.TimeoutExpired:
    proc.kill()
    proc.wait()
    raise SystemExit('Hidden token import timed out.')
os.close(master)
assert answered and proc.returncode == 0, 'Hidden token import failed: ' + str(proc.returncode) + '; known categories=' + str([tag for tag in ['ConnectionError', 'HulyAuthError', 'TimeoutError', 'ConfigValidationError'] if tag.encode() in output])
assert token.encode() not in output, 'Hidden token import exposed token.'
result = subprocess.run([cli, 'auth', 'import-token', '--stdin', '--profile', 'shared-live'], input=token, text=True, capture_output=True, timeout=30)
assert result.returncode == 0, 'Stdin import failed; diagnostics suppressed.'
assert token not in result.stdout + result.stderr, 'Stdin import exposed token.'
before = (root / 'credentials.json').read_bytes()
metadata = (root / 'profiles.json').read_bytes()
failed = subprocess.run([cli, 'auth', 'import-token', '--stdin', '--profile', 'shared-live'], input='invalid-replacement-sentinel', text=True, capture_output=True, timeout=30)
assert failed.returncode != 0, 'Invalid token accepted.'
assert 'invalid-replacement-sentinel' not in failed.stdout + failed.stderr, 'Failed import exposed token.'
assert (root / 'credentials.json').read_bytes() == before, 'Failed replacement changed credential.'
assert (root / 'profiles.json').read_bytes() == metadata, 'Failed replacement changed metadata.'
PYIMPORT
unset HULY_URL HULY_WORKSPACE HULY_EMAIL HULY_PASSWORD HULY_TOKEN
"$HULY_PREPARED_CLI" auth status --profile shared-live --json >"$TEST_TMPDIR/status.json"
jq -e '.configured == true and .verified == false' "$TEST_TMPDIR/status.json" >/dev/null
"$HULY_PREPARED_CLI" auth check --profile shared-live --json >"$TEST_TMPDIR/check.json"
jq -e '.verified == true' "$TEST_TMPDIR/check.json" >/dev/null
if ! "$HULY_PREPARED_CLI" projects list --profile shared-live --json >"$TEST_TMPDIR/cli.json"; then
  cat "$TEST_TMPDIR/cli.json"
  exit 1
fi
jq -e '.projects | type == "array" and length > 0' "$TEST_TMPDIR/cli.json" >/dev/null
# Switching the active CLI context must not redirect explicitly selected stdio.
"$HULY_PREPARED_CLI" profile create other --url http://127.0.0.1:1 --workspace wrong >/dev/null
"$HULY_PREPARED_CLI" profile select other >/dev/null
cat >"$TEST_TMPDIR/request.jsonl" <<'JSON'
{"jsonrpc":"2.0","method":"server/discover","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{},"io.modelcontextprotocol/clientInfo":{"name":"profile-integration","version":"1.0"}}},"id":1}
{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_projects","arguments":{},"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{},"io.modelcontextprotocol/clientInfo":{"name":"profile-integration","version":"1.0"}}},"id":2}
JSON
cat >"$TEST_TMPDIR/failure-request.jsonl" <<'JSON'
{"jsonrpc":"2.0","method":"server/discover","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}}},"id":1}
{"jsonrpc":"2.0","method":"tools/list","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}}},"id":2}
{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_huly_startup_diagnostic","arguments":{},"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}}},"id":3}
JSON
assert_profile_startup_refused() {
  timeout 10 node dist/index.cjs <"$TEST_TMPDIR/failure-request.jsonl" >"$TEST_TMPDIR/error.out" 2>"$TEST_TMPDIR/stdio.err"
  jq -es --arg expected "$1" 'length == 3 and any(.[]; .id == 1 and (.result.instructions | contains($expected))) and any(.[]; .id == 2 and [.result.tools[].name] == ["get_huly_startup_diagnostic"]) and any(.[]; .id == 3 and .result.isError == true and .result.structuredContent.error.code == "PROFILE_CREDENTIALS_UNAVAILABLE" and (.result.structuredContent.error.message | contains($expected)))' "$TEST_TMPDIR/error.out" >/dev/null
  grep -q "$1" "$TEST_TMPDIR/stdio.err"
}
echo "Testing stdio with saved profile"
if ! HULY_TOOL_MODE=native MCP_AUTO_EXIT=true timeout 30 node dist/index.cjs <"$TEST_TMPDIR/request.jsonl" >"$TEST_TMPDIR/stdio.jsonl" 2>"$TEST_TMPDIR/stdio.err"; then
  echo "Stdio live read failed"
  cat "$TEST_TMPDIR/stdio.err"
  exit 1
fi
if ! jq -e 'select(.id == 2) | .result != null and .result.isError != true and .error == null and (.result.content | length > 0)' "$TEST_TMPDIR/stdio.jsonl" >/dev/null; then
  echo "Stdio returned a failed operation"
  cat "$TEST_TMPDIR/stdio.jsonl"
  exit 1
fi
jq -S '.projects | map(.identifier) | sort' "$TEST_TMPDIR/cli.json" >"$TEST_TMPDIR/cli-projects.json"
jq -S 'select(.id == 2) | .result.content[] | select(.type == "text") | .text | fromjson | .projects | map(.identifier) | sort' "$TEST_TMPDIR/stdio.jsonl" >"$TEST_TMPDIR/stdio-projects.json"
cmp "$TEST_TMPDIR/cli-projects.json" "$TEST_TMPDIR/stdio-projects.json"
if [[ "${HULY_TEST_CREDENTIAL_STORAGE:-file}" == os && -n "${HULY_TEST_KEYRING_DAEMON:-}" ]]; then
  echo "Testing locked native storage through CLI"
  HULY_TEST_MCP_REQUEST="$TEST_TMPDIR/failure-request.jsonl" python3 scripts/profile_native_failures.py
fi
echo "Testing changed destination"
"$HULY_PREPARED_CLI" profile update shared-live --workspace changed >/dev/null
if "$HULY_PREPARED_CLI" projects list --profile shared-live --json >"$TEST_TMPDIR/error.out" 2>"$TEST_TMPDIR/error.err"; then echo 'Changed destination accepted!' >&2; exit 1; fi
if ! grep -q 'destination changed' "$TEST_TMPDIR/error.out" "$TEST_TMPDIR/error.err"; then
  cat "$TEST_TMPDIR/error.out" "$TEST_TMPDIR/error.err"
  exit 1
fi
assert_profile_startup_refused "destination changed"
if ! grep -q 'destination changed' "$TEST_TMPDIR/error.out" "$TEST_TMPDIR/stdio.err"; then cat "$TEST_TMPDIR/stdio.err"; exit 1; fi
python3 - "$TEST_TMPDIR" <<'PY'
import json, os, pathlib, sys
sys.path.insert(0, 'scripts')
from profile_test_credentials import saved_token
root = pathlib.Path(os.environ['HULY_TEST_PROFILE_DIRECTORY'])
token = saved_token(root)
for name in ['cli.json', 'stdio.jsonl', 'stdio.err', 'error.out', 'error.err', 'status.json', 'check.json']:
    assert token not in (pathlib.Path(sys.argv[1]) / name).read_text(), 'Diagnostic exposed a saved token.'
if os.environ.get('HULY_TEST_CREDENTIAL_STORAGE') == 'os':
    for entry in root.rglob('*'):
        if entry.is_file():
            assert token.encode() not in entry.read_bytes(), 'Native credential appeared in an application-managed file.'
PY

echo "Testing missing credential"
cp "$HULY_TEST_PROFILE_DIRECTORY/profiles.json" "$TEST_TMPDIR/metadata-before-logout.json"
"$HULY_PREPARED_CLI" auth logout --profile shared-live >/dev/null
cmp "$HULY_TEST_PROFILE_DIRECTORY/profiles.json" "$TEST_TMPDIR/metadata-before-logout.json"
assert_profile_startup_refused "no usable credentials"
grep -q 'no usable credentials' "$TEST_TMPDIR/error.out" "$TEST_TMPDIR/stdio.err"

echo 'PASS: packed CLI login, shared CLI/stdio live reads, independent active selection, destination binding, prompt-free missing credential.'
