# Native HTTPS output validation across exposure modes

Test-only increment after `979356dc`; all six issues remain incomplete.

`native-output-validation.test.ts` registers a fixture operation through production `defineTool` and `makeEffectMcpRegistry`, using the real native HTTPS MCP transport. Its declared output schema requires a positive count, while one invocation deliberately returns−1. The operation counter proves this invocation reached the operation rather than failing input parsing. Typed Effect test layers supply internal service ports; no remote Huly calls or module mocks are used.

For native, strict proxy and non-strict proxy exposure, raw HTTP requests must yield the exact `Tool fixture_output produced invalid output` tool error, with isError=true and no successful structured content. No MCP SDK client is involved, so client-side validation cannot explain the observed rejection. A subsequent valid invocation returns the exact expected count1 envelope (with the proxy tool wrapper where applicable), and the operation counter must equal2. Input/output contracts and wire parsing derive from Effect schemas.

The initial three-mode file passes in `/tmp/resident-native-output-validation-first.log`. The strengthened success-envelope assertion and registry cohort pass two files/19tests in `/tmp/resident-native-output-validation-focused.log`. Changed-file lint/format and both scoped source reviews pass. Commit typechecking caught an unconstrained empty owner map inferred with string keys; explicitly retaining the fixture’s OwnerName/Owner types fixes it. The corrected three-mode file passes in `/tmp/resident-native-output-validation-map-fixed.log`. No full gate was run.

This proves production registry/native server-path output validation for an injected operation. It does not qualify a packaged resident adapter, actual Huly result payloads, all resource/result types, independent-client failure isolation or final platform/lifecycle qualification. Existing packaged successful proxy/resource evidence remains separate. No production behavior changed.
