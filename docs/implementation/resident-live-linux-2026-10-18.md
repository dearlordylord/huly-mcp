# Resident local-Huly read qualification — 2026-10-18

Qualification of #323–328 remains incomplete. The integrated candidate
`2f19c614` now has live local-Huly evidence for manual and managed two-reader
operation, managed idle retirement and a later fresh generation. This record
does not certify all operating systems, supported configurations or fault cases.

## Candidate and environment

The unchanged candidate ran on Linux aarch64 with Node 24.20.0. Complete local
environment credentials selected the existing Docker Huly workspace. The
container URL used `host.docker.internal`; no shared environment file or global
host configuration was changed. A packaged CLI read selected two existing
projects with different identifiers and names from eight returned projects.
Names, credentials and raw project data are not published here.

The three passing schedules used the packaged MCP artifact and the maintained
read-pair probe. Each pair comprises separate reader parents and separate stdio
adapters. Each reader checks modern discovery, the native catalog schema and
`get_project` availability, the project resource template, and two project reads
with colliding request IDs 41 and 42 across readers. Expected identifiers and
names differ between readers, so identical or cross-routed responses cannot pass.
This is SDK-driven host evidence; it is not an actual Claude/Codex Huly-read run.

## Observed outcomes

| Schedule | Reads and identity | Owned retirement |
| --- | --- | --- |
| First managed run | Both readers selected one generation/backend PID and received their own first and continued results. | Supervisor observed backend exit 0; private state empty; command exit 0. |
| Manual attempt 1 | The read-pair probe passed. | Driver expected exit 0 after SIGTERM and failed; it did not retain the actual owner exit code. State was empty. This attempt is not a qualification pass. |
| Manual attempt 2 | Separate manual backend and two packaged adapters passed the same checks. | Direct owner wait recorded SIGTERM exit 130, empty state and an empty pre-stop descendant snapshot; supervisor command exit 0. |
| Managed replacement | After the first managed owner's verified exit, the same empty namespace selected a different generation shared by both readers. | New backend exit 0 was supervisor-observed; state empty; command exit 0. |

The manual driver correction follows the pinned Effect 4 `Runtime.defaultTeardown`:
success exits 0, interruption-only failure exits 130, and other failure causes
take the error exit-code path. It changed the external qualification driver's
expectation, not production behavior or deadlines. The first attempt, driver and
logs remain retained. A pre-stop descendant snapshot is not a general proof
against every possible late descendant; supervisor-owned cleanup is separately
required. The passing supervisors did not force cleanup.

Managed generation identity was correlated with actual context port responses,
protected registry and attachment records. Schema-decoded receipts were checked
against the private input and actual empty directories. The manual receipt keeps
`backendRetirement: "not-requested"`; its separate owner receipt supplies the
termination evidence. No missing PID, listener or file was substituted for an
owned exit. Neither mode created or changed Huly data or sent recipient messages.

## Evidence

Private evidence root: `/tmp/resident-live-linux-campaign-_dtgfmjg/`.
It contains the immutable artifacts, prepared input, original CLI project read,
both manual attempts, managed/replacement receipts, executable verifiers and
raw whole-tree resource observations. `sha256.json` covers 44 evidence files;
`criteria-ledger.json` preserves all 68 child acceptance criteria from the current
GitHub bodies. Most criteria remain partial or untested; this read campaign does
not independently re-adjudicate their historical component evidence.

| Artifact/receipt | SHA-256 |
| --- | --- |
| MCP | `908e121f7d9fd4ab49b931b1ee349a448feec5a6db10d616ac3b0267dfe47416` |
| CLI | `e15d82af60d32f63fdc573bb306fcfde905ae5c1c194c42f58416d940503ed71` |
| Read probe | `4c80c215ca448c670a9ef2d571739bcb154265a8cce3c673f261da54671ecc6d` |
| Matching quality gate | `dc47bbd0f9749a5aff6f2802b9040f0ee644b2c78947575924b442079c67d592` |
| First managed receipt | `c65aa37c4904e562bd94339a3f7658b6458351d4c436dfcf6bfab09c2d632ff8` |
| Replacement receipt | `c29886405157761754cd9022fe89a25b341bd9a0f015d072d26bcad087bdcf6c` |
| Passing manual pair | `3b653bce3d2c9a1452e653c3cbe8621867820c2b25ae2b378901539428d93283` |
| Passing manual owner | `cda22e9412f1ec421771c6e6fca0f4a691bcc0f78a6a1f58569c132b58b3017f` |

The matching quality gate passed 483 files / 5742 tests and all unchanged 99%
coverage thresholds. No production source changed for this live read campaign.
The [preceding implementation report](issue-327.md#sdk-mutation-loss-and-death-during-observed-drain--2026-10-18)
contains its exact coverage, reviews and preserved fault-preparation failures.

## Remaining gates

The [#328 evidence index](issue-328.md#acceptance-evidence-index) remains the
complete qualification checklist. Native macOS, actual-host Huly reads,
supported auth/profile/policy/protocol combinations, live caller-loss and fault
schedules, local-Huly mutation reconciliation, and the five movement integration
suites are unexecuted suffixes of this candidate's final qualification. The
lifecycle Quint sketch remains type-only pending its recorded approval step;
no transition logic or lifecycle proof is claimed. Windows native support stays
excluded, with unsupported startup refusal retained.

Raw resource samples are evidence collection only. Alternating standalone,
managed and direct-HTTP comparisons with one/ten clients, all-adapter accounting,
completion rates and declared cache boundaries remain unexecuted. These were
fresh processes against a Huly instance and filesystem caches already exercised
by preflight; they are not cold-cache or performance measurements. Prototype
cleanup and branch deletion remain deferred until production integration and
complete qualification. All six delivery issues remain open.
