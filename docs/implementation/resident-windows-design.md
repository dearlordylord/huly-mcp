# Windows resident support: out of scope

On 2026-10-18 the user excluded Windows resident support if it required substantial remaining work. The security component was not connected to the server and had no native Windows execution evidence, so that condition applied.

Windows resident mode remains unsupported and refuses startup. The unused native security source and its CI workflow have been removed. The earlier implementation design is canceled; its historical investigation is not a delivery commitment. Existing child-environment sanitation is retained.

Current resident delivery targets Linux and macOS. Native macOS qualification remains pending. This decision does not claim either platform is fully qualified or close #322–328.
