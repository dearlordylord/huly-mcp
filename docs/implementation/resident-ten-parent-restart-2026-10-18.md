# Ten concurrent parents after confirmed retirement

The packaged idle-restart fixture now starts ten independent replacement parents
after the original single-parent generation has fully retired. It spawns every
parent before awaiting any connection. The shared observation contract owns the
replacement count; driver and assertions import it.

All replacement parents must have distinct parent/adapter identities, successful
native catalog/context observations, the expected workspace and one observed
backend port. The private registry must contain exactly one generation. Every
parent then closes with exit0/no signal; the fixture requires the exact backend
PID's kernel exit0 and an empty namespace. The original generation has already
met these same exit/state requirements before concurrent replacement starts.

Evidence: `/tmp/resident-ten-parent-restart-first.log`, one test passes19.07s.
Receipt `/tmp/resident-idle-restart-pm2aQe.receipt.json` records parent counts1/10,
ten unique replacement parents/adapters, one replacement port, distinct
generations and backend exits0 for3616756/3617471. The corresponding phases log
retains launch/retirement ordering. Standards' shared-count finding was corrected;
Spec review accepted. Existing5s request,7s exit and25s supervisor bounds remain.

The receipt now uses a per-cycle parents array. The earlier one-parent receipt
in the prior report is historical evidence from its own source revision; there
is no compatibility parser or new runtime legacy path for it.

This supports serialized fresh ownership after confirmed normal retirement. It
does not prove transparent crash failover, real Huly reads, native macOS or the
full lifecycle fault matrix. No production changes/full gate/live Huly campaign.
All six issues remain incomplete.
