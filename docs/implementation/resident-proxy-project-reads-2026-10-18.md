# Successful proxy project calls and resource reads

Test-only increment after `03822b45`. All six issues remain incomplete; production code is unchanged.

The existing managed-policy process fixture now owns a disposable HTTP REST service and supplies its endpoint to actual packaged managed adapters/backends. In strict and non-strict proxy modes, the projects client invokes `get_project` through `invoke_tool`, parses the nested successful result with the production project schema and checks identifier PROXY, Unicode name and archived=false. It then reads `huly://projects/PROXY`, parses the resource envelope and compares its entire project with the operation result.

Existing policy catalog, schema visibility/refusal, distinct backend ports, registry records and kernel-owned backend retirement checks remain. After both backends retire, native mode requires zero model acquisitions/reads; each proxy mode requires one model acquisition and exactly two project reads with identifiers PROXY/PROXY, zero writes and zero invalid REST requests. These are two distinct policy backends owned by one fixture parent, not a proof of separate host parents sharing one backend.

The initial run failed because the test parsed resource text as a bare project; the actual contract is a typed resource envelope. Correcting this fixture assumption produced three passing cases in `/tmp/resident-policy-proxy-resource-envelope.log`. Review added total-read accounting and independent kernel/REST cleanup preserving the scenario failure. `/tmp/resident-policy-proxy-final.log` passed those three cases. Final cleanup placement passed all three cases in `/tmp/resident-policy-proxy-final-cleanup.log`. Earlier failure log `/tmp/resident-policy-proxy-reads.log` is retained. Changed-file lint/format pass; both scoped reviews accepted the accounting/cleanup corrections.

No full gate was run. This covers successful project tool/resource semantics with disposable REST and the modern SDK client. It does not establish malformed output rejection, all resource types, legacy successful proxy results, actual host applications, native macOS or final movement qualification.
