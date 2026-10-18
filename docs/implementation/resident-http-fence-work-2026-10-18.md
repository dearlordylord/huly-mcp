# Accepted native HTTP work across generation fencing

Test-only increment after `4268601e`. All six issues remain incomplete.

The maintained admission HTTP fixture now registers a native held MCP tool over actual private TLS. It obtains an attachment through POST, initializes its native session, dispatches the held call and waits for its handler to enter. Explicit generation fencing then refuses a new attachment with409, renewal with403 and new work on the existing session with403. The accepted request remains incomplete and its owner still owns the native session.

Releasing the handler produces exactly one decoded terminal response: JSON-RPC2.0, ID2, content text `accepted-before-fence`. The session remains owned until attachment DELETE204; ownership must then be absent and admission drain completes. The existing HTTP exchange helper now retains its consumed body and content type so the test can parse it using the production backend response decoder rather than infer success from HTTP200 alone.

Admission/attachment-context focused checks pass two files/three tests in `/tmp/resident-http-fence-exact-reply-fixed.log`. The initial status-only run passed; a subsequent helper variable-name collision failed transformation, retained in `/tmp/resident-http-fence-exact-reply.log`, then was corrected. Changed-file Oxlint/format and both scoped reviews pass. Neighbor session/shutdown/continuity validation passed in `/tmp/resident-http-fence-neighbor-sessions.log`. No full gate was run.

This is real HTTPS/native MCP component evidence with an explicit fence. It does not prove automatic idle triggering, packaged separate OS-process races, full lifecycle oracle coverage or final qualification. No production code changed.
