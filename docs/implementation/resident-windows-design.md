# Windows resident storage implementation design

This is the selected implementation direction for the remaining Windows work in
#324 and #328. At `ad8df76d`, resident storage still refuses Windows. The design,
source implementation, packaged native artifact and native qualification are
separate deliverables. None of the last three follows from this document.

## Preserve the ownership protocol

Keep the existing Node `ChildProcess`, nonce-authenticated Prepared/Start/Ready
frames, startup budget and irreversible surrender of the pre-Start kill
capability. Do not introduce another launcher protocol or guardian solely to
obtain process ownership. Node 24.20.0's bundled libuv distinguishes
`uv_process_kill`, which uses its retained process handle, from `uv_kill`, which
opens a numeric PID. See the [pinned Windows process implementation](https://github.com/nodejs/node/blob/v24.20.0/deps/uv/src/win/process.c).

Native fixtures must still prove detachment after adapter/terminal exit and
behavior under actual host job restrictions. Detached launch does not establish
escape from an enclosing Windows job. Inspect constraints before Start; refuse
uncertain independence without allocating Huly resources. If a required host
needs permitted job breakaway that Node cannot request, implement that primitive
based on the failing native case. Refusing all required hosts does not complete
Windows support.

Canonicalize credential/profile/bootstrap key comparisons on Windows before
spawning the child. Keep POSIX key comparisons case-sensitive. Capture selected
Huly configuration through the existing private bootstrap frame. Unwrap redacted
inherited values only in the process adapter. Hide subprocess windows without
changing readiness or ownership semantics.

## Give protected storage one owner

Use an in-process first-party Node-API module for Windows security and filesystem
operations, with an Effect adapter and the same internal storage port on POSIX.
Use acquired directory and publication capabilities. The port owns complete
bounded read, inventory, exclusive claim, no-replace publication and exact-object
retirement operations. Callers keep attachment/registry schemas, inventory
grammar, generation reconciliation and resource-retirement order.

Native responses and entry identities need Effect Schemas at the binding
boundary. Keep native handles opaque and process-local. Do not serialize HANDLE
numbers or expose raw ACLs and Win32 calls to application callers. Remove
migrated filesystem bypasses in the same implementation wave.

The Windows implementation must establish these facts:

- Obtain identity from the process token's user SID and the default location from
  the current user's Local AppData known folder. Environment names are not OS
  ownership proof.
- Create directories and files with their private security descriptor already
  supplied. New private objects use current-user ownership and a protected DACL
  for that user and SYSTEM. Existing objects are inspected and refused when
  unsafe, rather than repaired. Elevated administrator/SYSTEM interference is
  outside the same threat boundary as POSIX root interference.
- Inspect ancestry and opened objects for ACL and reparse behavior. Reject
  foreign replacement/deletion authority and unsupported ACL forms. The policy
  must accept ordinary supported Windows profile ancestry in native fixtures.
- Preserve temporary-file plus hard-link publication and the inventory proof
  linking temporary and final descriptors. Obtain identity from volume/file ID,
  not POSIX uid/mode assumptions.
- Delete only the owned name/object through a verified native capability. Claims
  and registry records must survive owner failure as unresolved evidence. No
  delete-on-close recovery or pathname/PID-directed takeover is introduced.
- Scope ancestry pins so they do not prevent legitimate directory retirement.
  Distinguish a retained valid empty directory from failed record retirement.
  Prove the exact hard-link, access/share and disposition behavior natively.
- Keep blocking native work off the event loop. Cancellation must retire exact
  late acquisitions and prevent late Start/publication. A JavaScript timeout
  alone does not prove bounded native cleanup. Preserve existing budgets.

Windows `chmod` does not distinguish owner/group/other permissions, and the Node
Windows filesystem API lacks the POSIX no-follow opening flags used by current
code. See [Node 24 filesystem caveats](https://nodejs.org/docs/latest-v24.x/api/fs.html).
Creation-time descriptors and protected inheritance are described in
[Microsoft's security descriptor documentation](https://learn.microsoft.com/en-us/windows/win32/secauthz/security-descriptors-for-new-objects).
Handle security inspection uses
[GetSecurityInfo](https://learn.microsoft.com/en-us/windows/win32/api/aclapi/nf-aclapi-getsecurityinfo).

## Ship a verifiable artifact

Include architecture-specific native binaries inside the existing MCP and CLI
candidate packages, with exact version, ABI and hash metadata. Build them with a
pinned Windows toolchain in native CI and test a clean packed installation.
Runtime execution must not require a compiler, PowerShell policy change,
first-use download, global installation or separately published platform package.
Publishing is outside this task's authorization.

Linux can verify shared schemas, policy and POSIX regressions. It cannot prove
Windows ACL isolation, native linking/disposition, actual detachment or packed
native loading. Add native Windows build and execution before claiming those
criteria. All existing concurrency, cleanup, fault and protocol cases remain.

## Selection and rejected alternatives

Two independent designs and a separate comparison selected native storage with
the existing Node launcher. The comparison favored preserving the existing launcher and packaging artifacts
in the existing packages. The selected design incorporates the alternative's
scoped directory capability and late-completion cleanup discipline.

Per-operation PowerShell workers lose handle lifetimes between commands and add
startup/runtime requirements. A persistent native broker introduces another
process lifetime and protocol. Neither is selected. Mandatory replacement of
Node IPC and a new published optional-package dependency graph are also rejected
without evidence requiring them. No operation journal, replay or guardian is
part of this implementation.

Design inputs and comparison are retained at `/tmp/resident-windows-design`.
Their native sharing and ACL algorithms remain hypotheses until executable native
fixtures prove them. Current Linux has no Windows SDK/compiler, PowerShell, Wine
or native executor. Existing CI runs only on Ubuntu. Native access was requested;
source and fixture authoring can continue independently.
