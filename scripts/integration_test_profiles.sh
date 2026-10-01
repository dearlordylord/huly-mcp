#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/test-telemetry-env.sh" || exit 1
cd "$(dirname "${BASH_SOURCE[0]}")/.."
node_modules/.bin/esbuild --version >/dev/null
for name in HULY_URL HULY_WORKSPACE HULY_EMAIL HULY_PASSWORD; do
  if [[ -z "${!name:-}" ]]; then echo "Missing $name for live profile login." >&2; exit 1; fi
done
TEST_TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TEST_TMPDIR"' EXIT
source scripts/packed-cli-test-helpers.sh
echo "Preparing packed CLI"
prepare_packed_cli "$TEST_TMPDIR"
echo "Creating isolated profile"
export XDG_CONFIG_HOME="$TEST_TMPDIR/config"
export HULY_PROFILE=shared-live
"$HULY_PREPARED_CLI" profile create shared-live --url "$HULY_URL" --workspace "$HULY_WORKSPACE"
# Answer the real CLI prompts only when emitted; never print or pass secrets in argv.
export HULY_PREPARED_CLI
python3 - <<'PY'
import os, select, subprocess, time
proc = subprocess.Popen([os.environ['HULY_PREPARED_CLI'], 'auth', 'login', '--profile', 'shared-live'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
answers = [(b'Huly email: ', os.environ['HULY_EMAIL']), (b'Huly password: ', os.environ['HULY_PASSWORD'])]
output = b''
all_output = b''
deadline = time.monotonic() + 45
while proc.poll() is None and time.monotonic() < deadline:
    if select.select([proc.stdout], [], [], 0.2)[0]:
        chunk = os.read(proc.stdout.fileno(), 4096)
        if not chunk: break
        output += chunk
        all_output += chunk
        if answers and answers[0][0] in output:
            _, answer = answers.pop(0)
            proc.stdin.write((answer + '\n').encode())
            proc.stdin.flush()
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
    raise SystemExit('Live profile login failed; diagnostics suppressed to protect credentials.')
PY
python3 - <<'PY'
import json, os, pathlib
root = pathlib.Path(os.environ['XDG_CONFIG_HOME']) / 'huly'
credentials = json.loads((root / 'credentials.json').read_text())
metadata = (root / 'profiles.json').read_text()
password = os.environ['HULY_PASSWORD']
assert password not in (root / 'credentials.json').read_text() and password not in metadata, 'Password was persisted.'
assert credentials['tokens']['shared-live'] not in metadata, 'Token appeared in profile metadata.'
(root / 'saved-credential.json').write_text(json.dumps(credentials))
(root / 'saved-credential.json').chmod(0o600)
PY
echo "Login complete; testing saved credentials"
unset HULY_URL HULY_WORKSPACE HULY_EMAIL HULY_PASSWORD HULY_TOKEN
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
echo "Testing changed destination"
"$HULY_PREPARED_CLI" profile update shared-live --workspace changed >/dev/null
if "$HULY_PREPARED_CLI" projects list --profile shared-live --json >"$TEST_TMPDIR/error.out" 2>"$TEST_TMPDIR/error.err"; then echo 'Changed destination accepted!' >&2; exit 1; fi
if ! grep -q 'destination changed' "$TEST_TMPDIR/error.out" "$TEST_TMPDIR/error.err"; then
  cat "$TEST_TMPDIR/error.out" "$TEST_TMPDIR/error.err"
  exit 1
fi
if timeout 10 node dist/index.cjs <"$TEST_TMPDIR/request.jsonl" >"$TEST_TMPDIR/error.out" 2>"$TEST_TMPDIR/stdio.err"; then echo 'Stdio accepted changed destination!' >&2; exit 1; fi
if ! grep -q 'destination changed' "$TEST_TMPDIR/error.out" "$TEST_TMPDIR/stdio.err"; then cat "$TEST_TMPDIR/stdio.err"; exit 1; fi
echo "Testing missing credential"
"$HULY_PREPARED_CLI" auth logout --profile shared-live >/dev/null
if timeout 10 node dist/index.cjs <"$TEST_TMPDIR/request.jsonl" >"$TEST_TMPDIR/error.out" 2>"$TEST_TMPDIR/stdio.err"; then echo 'Stdio accepted missing credential!' >&2; exit 1; fi
grep -q 'no usable credentials' "$TEST_TMPDIR/error.out" "$TEST_TMPDIR/stdio.err"
python3 - "$TEST_TMPDIR" <<'PY'
import json, os, pathlib, sys
root = pathlib.Path(os.environ['XDG_CONFIG_HOME']) / 'huly'
token = json.loads((root / 'saved-credential.json').read_text())['tokens']['shared-live']
for name in ['cli.json', 'stdio.jsonl', 'stdio.err', 'error.out', 'error.err']:
    assert token not in (pathlib.Path(sys.argv[1]) / name).read_text(), 'Diagnostic exposed a saved token.'
PY
echo 'PASS: packed CLI login, shared CLI/stdio live reads, independent active selection, destination binding, prompt-free missing credential.'
