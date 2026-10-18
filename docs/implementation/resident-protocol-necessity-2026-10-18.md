# Current MCP protocol consumers

The user requires a demonstrated current consumer before retaining legacy behavior. Updating this package, restarting its backend and changing the host's MCP protocol implementation are separate operations. The package already checks its own implementation version before accepting an attachment; that ownership rule does not justify an old MCP protocol.

An isolated handshake probe checked the installed applications on2026-10-18, with fresh processes and empty private home/configuration directories. It recorded only method names and protocol versions, used a local stdio endpoint, supplied no Huly credentials and requested no model turn.

| Installed consumer | Observed handshake |
| --- | --- |
| Codex CLI0.163.0 | `initialize`, `protocolVersion: 2025-06-18` |
| Claude Code2.1.296 | `server/discover`, modern protocol2026-07-28; after deliberate method-not-found refusal, fallback `initialize` proposing2025-11-25 |

The probe intentionally rejects every request. Its failed MCP health status is expected; it demonstrates which protocol the real client attempts, not successful application operation. Both outer client processes exited0. Evidence: `/tmp/resident-client-handshake-04ebwjxd`, including `server.py`, sanitized handshake records and client exit records. Prior actual-host tool qualification is separate evidence.

There is therefore a concrete current need for initialize-based2025-06-18 support: the installed supported Codex host starts with it even after a fresh restart. Keep that path for this consumer. This finding does not authorize generic compatibility with arbitrary old package versions, persistent-state formats, APIs or hypothetical clients. Recheck the handshake when changing the supported client version; if the dependency disappears, remove the path and its specification/tests together. A restart of this exact client version does not change its observed handshake.

Source-history inspection found explicit modern/legacy requirements in the tickets and their implementation, but no prior named current consumer justifying the obligation. Those requirements alone were insufficient. The real-client observation above supplies the missing evidence; it does not turn every existing legacy test into an ongoing requirement.
