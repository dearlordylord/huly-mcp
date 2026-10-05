# GH306–311 process retrospective

The accepted implementation covered 71 requirements. Its final five-suite chain
took 43m26.771s; total goal accounting was about 30h25m. These are separate
measurements. Existing quality and receipt safeguards did not prevent repeated
orchestration, evidence work and diagnostic churn.

## Findings and repairs, in severity order

1. **The supported command contradicted the authorized campaign policy.** The
   user removed the overall twenty-minute limit, but the stock coordinator still
   enforced it. Continuation required private drivers, separate fingerprints and
   repeated reviews of orchestration. The stock command now supports immutable
   per-suite bounds while retaining the original deadline policy and custody.
2. **Report publication could rewrite historical evidence.** `eced90d9` changed
   thirty historical `finalInputAudit` values from pending to passed.
   `3253b79b` corrected them before completion. The frozen/publication comparison
   and checked-in immutable projection now reject this exact mechanical error,
   changed requirements, source proofs and test declarations.
3. **A partial case selection could be labelled full certification.** The case
   selector exposed its scope, but the stock coordinator accepted the shell's
   successful exit without proving the required case union. Full certification
   now refuses a selection before preparation. Characterization remains distinct
   from a complete matrix receipt.

Astra inspected the current runner, primary terminal receipts and publication
commits, plus the Dalph churn postmortem and Jev testing guidance. We chose these
three missing controls because receipt reuse, process tests, quality checks and
CI already existed. A second gate, generic retry counter or new orchestration
service would add maintenance without proving a new accepted behavior.

## Operating changes

Use one stock campaign, freeze its inputs and let valid receipts select the
remaining work. Preserve the first causal failure and test a distinguishing
hypothesis before another expensive attempt. After two uninformative attempts
or thirty minutes of active repair, change diagnostic method. The orchestrator
owns this decision; reviewers check scope and evidence preservation. The exact
commands and publication contract live in
[integration guidance](../../INTEGRATION_TESTING.md#campaign-policy-and-evidence-publication).

Keep reports compact and read current contracts before historical logs. Request
individual rows or excerpts from the 71-row ledger instead of dumping the whole
artifact. The ledger remains historical evidence for its executed source;
future code changes do not rewrite it into current-state proof.

The new controls are tested with disposable local processes and injected clocks.
They do not establish a new live Huly feature result, eliminate every race or
promise a twenty-minute total delivery. The five deployed suites from the
completed feature campaign retain their original source and receipt attribution.

## Verification

Astra approved the final diff after corrections for staged/working-tree divergence
and newly checked documentation inputs. Registered process checks passed, including
the real staged-rewrite control and report/manifest/hook receipt invalidation.
One final `pnpm check-all` passed: 401 files, 5348 tests, strict diagnostics, lint,
complexity, build, and unchanged coverage thresholds. No live fixture was rerun.
