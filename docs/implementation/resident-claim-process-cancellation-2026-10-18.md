# Selection claim cancellation in actual processes

`test/resident/selection-claim-process.test.ts` now exercises cooperative
termination after a child reports an acquired selection claim. SIGTERM must
produce the runtime's exit130 with no signal termination and leave the private
namespace empty. A second child must then acquire its own claim and complete
the same termination and cleanup sequence.

The scenario shares a five-second observation deadline. Rejection enters
owned-child cleanup; a separate two-second allowance bounds exit joining. The
seven-second outer test allowance includes cleanup without extending the
scenario deadline. Primary assertion/observation failure takes precedence over
cleanup failure. An unconfirmed exit retains the private namespace rather than
removing potentially live ownership state. Review identified and corrected both
the original unbounded waits and cleanup-error masking.

The existing ten-contender crash case remains. It now asserts successful
SIGKILL delivery, null exit code and exact SIGKILL signal. A refused late
contender must preserve the original claim's device/inode identity, in addition
to retaining its pathname.

Evidence: `/tmp/resident-claim-cooperative-final.log`, two files/seven tests pass.
Changed-file lint/format and scoped Standards/Spec reviews accepted. These are
actual child processes using the production selection-claim primitive. They do
not qualify packaged launch/publication boundaries or native macOS behavior.
No production changes, legacy behavior, journal or full campaign were added.
All six issues remain incomplete.
