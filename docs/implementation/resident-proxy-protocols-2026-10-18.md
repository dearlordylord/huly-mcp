# Proxy policy and resource protocol matrix

Test-only increment after `cb4118af`. All six issues remain incomplete.

The existing managed-policy fixture now exercises its three scenarios against both protocols from the shared `LiveReadProtocol` schema. Modern connections pin their revision; initialize-based connections use the installed SDK's legacy negotiation mode with a single supported version. Each of the two clients asserts `getNegotiatedProtocolVersion()` equals the requested revision after connection. Receipts include the schema-owned protocol and the outer test checks it.

This extends successful strict/non-strict proxy `get_project` and project-resource reads to 2025-06-18, retaining exact typed payload comparisons, policy catalog/refusal or schema-visibility semantics, total read accounting, owned backend exit0 and empty state. Native cases retain the zero-Huly-read baseline. This is justified by the installed Codex consumer documented in the protocol necessity audit; it introduces no compatibility production code.

The first attempt incorrectly used SDK pinning for a 2025 revision, which the SDK explicitly rejects before connection (`/tmp/resident-policy-legacy-project-reads.log`). A correction temporarily duplicated the protocol import and failed fixture bundling (`/tmp/resident-policy-legacy-negotiated.log`); it is fixed. Final focused six-case validation passed in `/tmp/resident-policy-protocol-matrix.log` (59.81 seconds). Changed-file Oxlint/format pass; both scoped reviewers accepted shared-schema reuse and actual negotiated-version assertions. No full gate was run.

Evidence remains limited to SDK clients/packaged adapters with disposable REST. It does not certify actual host applications, malformed output validation, independent proxy parents sharing one backend, native macOS or complete lifecycle/final qualification.
