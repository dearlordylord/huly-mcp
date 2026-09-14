# TraceX and Intabia integration-test environments

Checked 2026-09-13. Research only: public documentation, source and registry metadata were read; no accounts were registered, containers deployed, or authenticated requests made. Image publication is confirmed below; bootability and MCP compatibility are not yet demonstrated.

## Recommendation

Start with **Intabia's published self-host stack**, pinned to `v0.8.33`, then test a disposable Intabia cloud workspace. For **TraceX**, published `v0.7.426` images exist, but its public repository principally documents a source development stack. Build a small release-pinned Compose fixture from that version's service configuration, or obtain a dedicated cloud evaluation workspace. Do not infer compatibility from successful login alone.

A Docker-capable host is needed: the current research container has no Docker executable. Use its host or a separate Linux VM, with isolated volumes, ports, project names and platform-local MCP dependencies. Keep existing Huly fixtures separate.

## Published versions and images

| Evidence | Intabia | TraceX |
|---|---|---|
| Public cloud config observed | `VERSION=0.8.33`, `MODEL_VERSION=0.8.4` | `VERSION=0.7.426`, `MODEL_VERSION=0.7.426` |
| Release baseline | GitHub release `v0.8.33`, published 2026-09-01 | Git tag `v0.7.426`, commit `6ec18f8da1844d92b4e92d7aa2dd589acc305f23`; GitHub latest-release API returns 404 |
| Development head reviewed by team | Separate source analysis | `a5dcad32bf888b85b3261151114850669c7a23ed` |
| Deployment repository | `platform-selfhost` commit `87e556bae814495bd84ecef0fc1fae2284040cac` | Main source repository `dev/` configuration |
| Core container availability | `intabiafusion/*:v0.8.33` | `tracexapp/*:v0.7.426` |

Sources: [Intabia release](https://github.com/intabia-fusion/platform/releases/tag/v0.8.33), [Intabia cloud config](https://platform.intabia.ru/config.json), [TraceX cloud config](https://app.tracex.co/config.json), [TraceX tags](https://api.github.com/repos/TraceX-dev/TraceX/tags?per_page=3), [TraceX latest release API](https://api.github.com/repos/TraceX-dev/TraceX/releases/latest), [Intabia self-host revision](https://github.com/intabia-fusion/platform-selfhost/tree/87e556bae814495bd84ecef0fc1fae2284040cac).

Docker Hub's tag API confirmed **linux/amd64 and linux/arm64** images for `front`, `account`, `workspace`, `transactor`, `collaborator`, `datalake`, `fulltext`, and `rekoni-service` at both baselines. Representative authoritative responses: [Intabia front](https://hub.docker.com/v2/repositories/intabiafusion/front/tags/v0.8.33), [Intabia transactor](https://hub.docker.com/v2/repositories/intabiafusion/transactor/tags/v0.8.33), [TraceX front](https://hub.docker.com/v2/repositories/tracexapp/front/tags/v0.7.426), [TraceX transactor](https://hub.docker.com/v2/repositories/tracexapp/transactor/tags/v0.7.426). Unknown/unknown entries in the TraceX indexes are additional metadata, not evidence of a third runnable CPU target.

The same API check covered all 31 Intabia platform image names found in its current Compose, plus `tool`: all had both CPU targets except `desktop-distro` (amd64 only, and commented out of Compose). This does not validate every third-party dependency image. Record the complete resolved image digests when preparing the runnable fixture; tags can move.

## Intabia self-host: closest to ready

Its maintained [self-host README](https://github.com/intabia-fusion/platform-selfhost/blob/87e556bae814495bd84ecef0fc1fae2284040cac/README.md) documents setup and startup scripts, generated secrets, and captured mail via Mailpit. It requires a Unix shell and Docker; Node is only required for the optional Huly backup importer. AI inference and transcription can be disabled. Default self-host plans provide generous limits and use a local payment test provider, so a paid cloud account is unnecessary for local validation.

A concrete candidate setup, **not executed**, on a dedicated VM with a DNS name resolving from both the browser and MCP runner:

```bash
git clone https://github.com/intabia-fusion/platform-selfhost.git intabia-compat
cd intabia-compat
git checkout 87e556bae814495bd84ecef0fc1fae2284040cac
./setup.sh --silent --host intabia-compat.test --port 80 \
  --version v0.8.33 --llm none --stt none
./up.sh --pull
./create-workspace.sh mcp-compat
```

Use a dedicated VM/host name initially to avoid the current scripts' advertised-URL versus bound-port ambiguity. [Compose](https://github.com/intabia-fusion/platform-selfhost/blob/87e556bae814495bd84ecef0fc1fae2284040cac/compose.yml) forms external account/transactor/front URLs from `HOST_ADDRESS`, while publishing nginx via `HTTP_PORT`. Merely changing the port can leave generated URLs pointing at port 80; inspect `config.json` and the selected workspace endpoint before running tests. The README contains both bundled-nginx and host-nginx guidance; the current Compose explicitly includes nginx. Verify the rendered configuration rather than launching an additional proxy by assumption.

The [workspace helper](https://github.com/intabia-fusion/platform-selfhost/blob/87e556bae814495bd84ecef0fc1fae2284040cac/create-workspace.sh) creates a local technical admin with a generated password stored in `config/.admin.secret`, creates the workspace owned by `email:<owner>`, and assigns that account. The [tool wrapper](https://github.com/intabia-fusion/platform-selfhost/blob/87e556bae814495bd84ecef0fc1fae2284040cac/run-tool.sh) runs the versioned `intabiafusion/tool` container inside the stack network and supports account/workspace/token operations. Use the technical account only for bootstrap; create a separate ordinary test user and test both owner and member permissions. The wrapper allocates `docker run -t`, which may require adjustment for a non-TTY CI job.

No existing workspace backup is required. UI signup is another option; locally generated OTP mail is captured in Mailpit on port 8025. The MCP's password path should be tried against the created password account; OTP-only cloud login is a separate compatibility case. Do not output generated credentials or tokens into test reports.

The [Compose topology](https://github.com/intabia-fusion/platform-selfhost/blob/87e556bae814495bd84ecef0fc1fae2284040cac/compose.yml) includes PostgreSQL 18.1, Redpanda, MinIO, Elasticsearch 8.19.1, account/workspace/transactor, datalake, collaborator, and fulltext. It is a substantial multi-service deployment. No authoritative RAM/CPU minimum was found in the reviewed self-host docs. A Linux VM with 4 vCPU, 16 GB RAM and ample SSD space is a **proposed initial test allocation**, not a vendor minimum; measure actual steady-state and workspace-creation peaks.

Version caution: [setup.sh](https://github.com/intabia-fusion/platform-selfhost/blob/87e556bae814495bd84ecef0fc1fae2284040cac/setup.sh) takes the first Git tag when no version is supplied, not GitHub's latest published release. At research time the first tag was `v0.8.44`, while the public cloud and latest release were `v0.8.33`. Pin explicitly. The deployment repository is newer than the release: image availability does not prove that its current environment variables and database migration flow work with the older release. Boot smoke is the next check.

## Intabia cloud: viable low-cost second layer

[Official pricing](https://platform.intabia.ru/) offers a free Start plan for up to five people and a fourteen-day Business trial without a card. The [first-party tariff documentation](https://github.com/intabia-fusion/platform-docs/blob/c547d013cc74bb1115ef1257591fc1d36594978a/src/content/docs/ru/tariffs/tariff-plans.mdx) explicitly lists platform API access among the baseline plan capabilities. Distinguish that from the separate external-service integrations feature in the marketing comparison.

Signup is linked at [platform.intabia.ru/login/signup](https://platform.intabia.ru/login/signup). The public config advertises account discovery at `https://platform.intabia.ru/_account/`, plus datalake paths for blobs and uploads. Thus `HULY_URL` should be the front URL, not the account endpoint or marketing API example URL. The fetched Intabia config at version `0.8.33` had **no `COLLABORATOR_URL` key**; TraceX at `0.7.426` did. This is a concrete discovery-contract difference that must be checked against our initialization path before attempting the full suite.

Concrete test path: register or use an authorized account, create a disposable workspace, establish either a password credential or supported workspace token, run connection/model probes, then run the approved mutation suite with synthetic data. No account or credentials were supplied here. Whether signup requires additional verification from the tester's location, whether password login is offered, and the exact current token UI remain unverified. Public API documentation points back to Huly examples; it does not prove our SDK's current authentication flow works.

## TraceX self-host: images exist, deployment needs assembly

The [source README](https://github.com/TraceX-dev/TraceX/blob/a5dcad32bf888b85b3261151114850669c7a23ed/README.md) documents a Rush source build and Docker workflow, including native amd64/arm64 support. Its dependency instructions require a GitHub Packages token with `read:packages`; this is a source-build requirement, not evidence that published Docker images require authentication. README disk guidance reports more than 35 GB for a clean full WSL deployment and about 4.5 GB for sources/build artifacts. It does not establish a server RAM minimum.

Two distinct routes:

1. **Preferred release test:** use `v0.7.426` source configuration with published `tracexapp/*:v0.7.426` images, pin all remaining images, and create a dedicated Compose override for ports, advertised endpoints, volumes, branding/config mounts and test secrets. This avoids building the monorepo. It still requires engineering and a boot smoke test; there is no verified ready-to-run standalone self-host bundle in this research.
2. **Documented developer route:** obtain package access, install the repository's required Node/Rush toolchain, run its build/bundle/package/docker phases, then start the dev services. That verifies the selected source commit, not the cloud release. Do not mix development models with released containers.

The [current dev Compose](https://github.com/TraceX-dev/TraceX/blob/a5dcad32bf888b85b3261151114850669c7a23ed/dev/docker-compose.yaml) uses untagged locally built TraceX images and multiple directly exposed service endpoints. Its front is `http://tracex.local:8087`; services include PostgreSQL, Redpanda, MinIO, Elasticsearch, account/workspace/transactor, collaborator and datalake. Branding and signing assets use relative mounts. Use the equivalent file at the release tag for the release fixture; blindly replacing the Huly image namespace is insufficient.

For bootstrap, [tests/create-local.sh](https://github.com/TraceX-dev/TraceX/blob/a5dcad32bf888b85b3261151114850669c7a23ed/tests/create-local.sh) shows account creation, workspace creation, assignment and owner-role setup. It also restores a repository fixture and enables every module; adapt its sequence for a fresh empty workspace rather than running it against another installation. [tool-local.sh](https://github.com/TraceX-dev/TraceX/blob/a5dcad32bf888b85b3261151114850669c7a23ed/tests/tool-local.sh) hardcodes dev endpoints/database assumptions, so it is a reference, not a portable provisioning command. Preserve the default enabled-module set for the first compatibility result, then test any legacy Huly modules separately if explicitly enabled.

The README's reduced stack excludes fulltext and Elasticsearch, among other services. It can establish basic login/read behavior, but cannot validate the complete MCP feature set. Do not report a full pass when search, collaborative documents, file processing or other omitted services were never exercised.

## TraceX cloud: obtain a writable evaluation workspace

The [public app configuration](https://app.tracex.co/config.json) is reachable without authentication, advertises `/login/signup`, and points accounts at `https://app.tracex.co/accounts`. This proves discovery availability, not that signup creates an unrestricted writable workspace. [Official pricing](https://tracex.co/pricing) offers free access for selected roles, including read-only users and communities, and paid eQMS/PLM tiers. It does not promise a general-purpose free writable API sandbox or a specified trial duration. [The product site's API section](https://tracex.co/) links Huly API examples and offers demos/contact paths.

Use an authorized dedicated evaluation workspace with permission to create/update/delete synthetic fixtures. Confirm password or workspace-token access, enabled modules and API allowances with the workspace owner. A community guest link or public release-notes workspace is not a suitable mutation-test target. No public disposable API sandbox was confirmed.

## What a live result must record

Record front URL, cloud/self-host distinction, code/model versions, image digests, enabled modules, user role, auth method and which tests ran. First verify account discovery, login or token selection, workspace resolution, REST account/model loading and collaborator endpoint resolution. Our primary data path uses REST; exercise WebSocket behavior separately where a vendor control client or UI relies on it. Then confirm known reads, isolated CRUD and cleanup, attachments, collaborative content and search with bounded eventual-consistency retries. Test permission failures with a limited user and verify UI visibility of representative writes. A self-host pass does not establish cloud plan/auth behavior; a cloud pass without a pinned version does not establish every future release.
