# Tree coverage follow-up

Base: reviewed combined `7b480ab2699ba939fb3b5193152bdfae6940fa23` in isolated
`overseer/issue-310-coverage`, bootstrapped from the Linux retry repository.
Original #310 branch remains intact. The combined baseline's 5035 tests passed,
but branch/function coverage failed the unchanged 99% thresholds.

The baseline coverage artifact identifies these owned omissions:

- Tree adapter lines16/78–88: missing selected root and absent/non-null component
  or milestone snapshots. Added strict SDK-port cases that evaluate the actual
  conditions and refuse an absent-to-null concurrent change without sending an
  admissible batch.
- Planner lines15/20/79/88: mismatched, duplicate or missing reservation slots;
  cyclic or absent destination ancestors. Added deterministic planning refusal
  cases. Removed the redundant `existing !== undefined` alternative after
  refining the moved/existing choice; missing ancestors remain explicit refusal.
  Same-project number/identifier/rank behavior is retained from the combined base.
- Discovery line66 and parser error mapper: actual child-attachment overflow and
  malformed response envelopes. Added bounded incomplete discovery and typed
  published-operation pre-write refusal, with no allocation or task send.
- Tree consent fallback/default discovery: pass the actual found discovered task
  into unavailable-consent projection instead of a logically unreachable root
  identifier fallback. Added default-discovery independent consent: one explicit
  clear leaves every unconsented sibling reference intact and conflicted.

`pnpm complexity` passed. Focused Oxlint passed after correcting destructuring
order; Oxc formatting and `git diff --check` passed. No compiler, test, coverage
or live Huly job has run for this successor. Actual coverage improvement and
behavioral proof remain pending the root's exclusive verification schedule.
