# Host Claude handoff: Intabia compatibility fixture

Set up a disposable self-hosted Intabia deployment on this Docker-capable host so the Huly MCP agent, running in a separate container, can perform compatibility tests. Do the setup and verify it; return working connection details, not just instructions. Do not run the Huly MCP full integration suite yet.

## Scope and baseline

- Preserve the existing Huly deployment, containers, volumes and ports. It serves host `localhost:8087` and is reachable from the coding container at `http://host.docker.internal:8087`.
- Create a separate host checkout and Compose project named `intabia-compat`, with its own data volumes and generated secrets. Do not reinstall or modify the shared hulymcp `node_modules`.
- Use the official deployment repository, pinned to the reviewed revision, and platform images pinned to `v0.8.33`. This is a compatibility-test baseline matching the cloud version observed on 2026-09-13, not a claim that it is the newest tag.
- Core Intabia images at this version were verified as published for Linux amd64 and arm64. Use native host architecture. Image availability has been checked; this stack has not yet been boot-tested by the coding agent.
- Disable external/local LLM inference, transcription and optional LiveKit for this initial fixture. Retain database, queue, storage, collaborator, fulltext/search and mail capture needed for integration coverage.

```bash
git clone https://github.com/intabia-fusion/platform-selfhost.git intabia-compat
cd intabia-compat
git checkout 87e556bae814495bd84ecef0fc1fae2284040cac
```

Read the checkout's instructions and setup scripts before running them. It provides `setup.sh`, `up.sh`, `create-workspace.sh`, and `run-tool.sh`; a source build of Intabia is not required.

## Networking and isolation

Inspect existing host port use and the complete Compose port list. A separate Compose project does not prevent port collisions: defaults publish PostgreSQL 5432, Redis 6379, datalake 4031, SMTP 1025 and several other service ports.

Use an unused front port, proposed `18087`, and Mailpit UI port, proposed `18025`. Remove unnecessary host publications for internal services or remap them without changing their container ports. Keep modifications in this disposable checkout and record them. Inspect the rendered Compose configuration locally without pasting interpolated secrets into output/reports.

Choose a canonical front origin reachable from all three places: host browser, coding-agent container and Intabia containers. `http://host.docker.internal:18087` is a candidate: it already resolves to the host gateway in the coding container. Verify host and service-container resolution too; provide a host alias or another shared hostname if necessary. Do not advertise `localhost` to clients running in other containers.

The setup script treats `--host` and `--port` separately. Compose constructs externally advertised URLs from `HOST_ADDRESS`; `HTTP_PORT` only selects the nginx host binding. Therefore the advertised authority must contain the nonstandard port as well. Candidate setup after confirming the origin and port availability:

```bash
./setup.sh --silent \
  --host host.docker.internal:18087 --port 18087 \
  --version v0.8.33 --llm none --stt none \
  --env DOCKER_NAME=intabia-compat \
  --env MAILPIT_HTTP_PORT=18025
```

Inspect the generated nginx configuration: its generator uses `HOST_ADDRESS` as `server_name`, so a port-qualified authority may need the server name normalized to the hostname while retaining the port in application URLs. Verify binding reachability from the coding container; a host-only loopback binding may not be sufficient on this Docker installation.

Apply the port-isolation changes before startup. Ensure the invocation actually loads them: `up.sh` constructs its own Compose command, so do not assume an arbitrarily named override is included. Then use the repository startup helper or an equivalent explicit Compose invocation with `config/platform.conf` and the reviewed configuration. The normal helper is:

```bash
./up.sh --pull
```

The deployment scripts are newer than the pinned platform release. If boot fails because of a script/image mismatch, diagnose and record it; do not silently upgrade the target or substitute Huly images.

## Workspace and identities

After database migrations and account/workspace services are healthy:

```bash
./create-workspace.sh mcp-compat
```

The helper generates a technical admin password in `config/.admin.secret`, creates the workspace and assigns its owner. `run-tool.sh` exposes account/workspace administration. Its Docker invocation uses `-t`; adapt that locally if the host agent runs without a TTY. Wait for workspace creation/model initialization to finish, not merely successful command exit.

Create a separate ordinary owner account for testing, plus two accepted member accounts for cross-user scenarios, using documented tool commands or UI invitations delivered to Mailpit. Give them password credentials usable by our SDK. Keep the technical admin for provisioning. Use unique synthetic identities; no real workspace backup or data is required.

If practical, create the `HULY` tracker project and a `Default` card space using the native UI or supported API, with valid types/statuses. These are current harness prerequisites. Do not write guessed model records to force them into existence; report missing fixtures for the coding agent to handle.

Save owner/member credentials in private local files, never in a committed file or chat. Prefer a shell-sourceable, ignored file at `<hulymcp-checkout>/.env.intabia.local`, with permissions 0600, containing the existing `HULY_URL`, `HULY_WORKSPACE`, `HULY_EMAIL`, `HULY_PASSWORD` fields and, when provisioned, `HULY_TEST_ACTOR_EMAIL`, `HULY_TEST_ACTOR_PASSWORD`, `HULY_TEST_REVIEWER_EMAIL`, `HULY_TEST_REVIEWER_PASSWORD`. That filename is not currently covered by the repository ignore rules: add it to the checkout's local Git exclude file and verify with `git check-ignore .env.intabia.local` before writing credentials. Preserve `.env.local` for Huly. Report the file path only.

## Acceptance checks and handback

1. Intabia containers are healthy or demonstrably serving their intended endpoints; workspace initialization completed.
2. The host browser can log in, open `mcp-compat` and display a native project/document.
3. From the coding-agent container, the chosen front URL serves `/config.json`. Advertised accounts, transactor, collaborator and file URLs are reachable from the callers that use them. A WebSocket-only endpoint need not return HTTP 200; use its appropriate handshake/API probe.
4. A native/vendor API probe can authenticate, select the workspace, read account/model data and perform one bounded read. Keep credentials out of diagnostic output.
5. Existing Huly still responds at port 8087.
6. Return: checkout path, Compose project/network name, start/stop commands, front origin, workspace slug/UUID, private env-file path, fixture account roles, source revision, reported platform/model versions, image digests, any overrides, and remaining setup gaps. Do not return tokens/passwords.

Record whether `/config.json` contains `COLLABORATOR_URL` and whether workspace selection returns `collaboratorEndpoint`. Our current MCP expects the former, while Intabia cloud/source moved toward the latter. Do not add a fake global field just to make our MCP appear compatible: preserve the product's actual discovery contract and report it. The coding agent will reproduce and fix any required adapter difference afterward.

Docker daemon access is not needed by the coding agent for API integration tests. If it is already intended to have daemon access, report the configured socket/context route separately; the current session found neither a CLI nor a mounted socket or `DOCKER_HOST`.

Sources: [official self-host checkout](https://github.com/intabia-fusion/platform-selfhost/tree/87e556bae814495bd84ecef0fc1fae2284040cac), [environment research](fork-test-environments.md), [source compatibility findings](intabia-source-compatibility.md).
