# Backend-only fault isolation between resident configurations

Test-only increment after `41a48034`; all six issues remain incomplete.

The existing configuration fault fixture now distinguishes adapter-plus-backend loss from backend-only loss. In the new branch, the Python injector retains both backend and adapter pidfds, verifies the backend's actual parent is the reported adapter and checks that adapter's handle is still live immediately before signaling only the backend handle. It then requires the backend pidfd to become readable within one second, proving termination of that retained process identity. The invocation itself remains within the existing five-second bound.

The backend-only receipt records this termination observation and its verified adapter identity. It does not invent an outer-subreaper exit code: the live adapter owns and reaps its backend. The original double-fault branch still requires adapter SIGKILL and outer-subreaper backend exit−9. A schema union distinguishes the evidence contracts. During subsequent shutdown the backend-only adapter must close with code1/no signal and its parent with0; this does not locate its precise spontaneous exit time.

In both branches and protocols, unrelated B's actual SDK project query remains held across the fault, authenticated status retains its accepting generation and one request, and its registry stays byte-identical. Exact SURVIVE41 and continued SURVIVE42, zero blocked work, one model/two reads/no writes, B adapter/parent/backend exits0, and retained failed-A registry remain required.

The initial new backend-only cases passed both protocols (`/tmp/resident-config-backend-only-first.log`). The expanded four-case matrix passed in `/tmp/resident-config-fault-two-modes.log`, and TypeScript/Effect diagnostics pass1430 files with zero errors/warnings in `/tmp/resident-config-backend-only-typecheck.log`. Review replaced mutable incomplete fault construction with discriminated initial observations and complete final receipt construction. Final corrected-source matrix passed all four cases in `/tmp/resident-config-fault-two-modes-final.log`. Both scoped reviews accepted the corrected source. Changed-file lint/format pass. A negative live-parent probe refused a package-matching process with false adapter ancestry without signaling (`/tmp/resident-config-backend-live-parent-refusal.log`). No full gate was run.

This extends #327.9 Linux/disposable-REST process evidence to backend-only failure without changing production behavior. Failed-cleanup/overlapping replacement, native macOS, full lifecycle model, uncertainty schedules and final qualification remain separate obligations. Earlier readiness and observation failures remain documented in the preceding fault report.

Final receipt roots, with supervisor terminal0 and externally sampled parent/adapter lineage checked:

- 2025-06-18 / backend-only: `/tmp/resident-config-faults-fn2tpF`
- 2025-06-18 / adapter-backend: `/tmp/resident-config-faults-21naV6`
- 2026-07-28 / backend-only: `/tmp/resident-config-faults-AWrPLW`
- 2026-07-28 / adapter-backend: `/tmp/resident-config-faults-A4s1ZA`
