# Windows resident security primitive

This source implements the first native security component of the
[Windows resident design](../../docs/implementation/resident-windows-design.md).
It is not connected to production launch or storage. Windows resident mode
continues to refuse until the complete implementation is integrated.

The component obtains the process user SID, creates a noninheritable private
security descriptor for that user and SYSTEM, and inspects opened objects for
owner, DACL, reparse attributes and volume/file identity. Ancestor inspection
allows ordinary foreign read/traverse and new-subdirectory-only rights. It rejects
foreign deletion/replacement, data/attribute writes and security-control rights.
New-child permission alone cannot delete or replace an existing protected child.
Safe traversal still requires pinning and checking every component and refusing
foreign precreation; this component does not implement that traversal.
Unknown ACL forms fail closed. It does not yet traverse paths, create a complete
storage capability, publish hard links, implement cancellation or expose Node-API.

Build and execute the fixture on native Windows with Visual Studio C++ and CMake:

```powershell
cmake -S native/resident-win32 -B dist/resident-win32-build -A x64
cmake --build dist/resident-win32-build --config Release --parallel 2
ctest --test-dir dist/resident-win32-build -C Release --output-on-failure
```

The native fixture uses actual Windows token, descriptor, file and directory
APIs. It changes only its own temporary objects and emits case names and booleans.
It checks private creation/inspection, object identity, world-readable/null DACL
refusal, ancestor read and new-child-only access versus replacement/control rights,
and owned fixture cleanup. It does not prove cross-account access denial, reparse traversal, publication, detached
process behavior or the complete resident contract. Those cases remain required.

Linux cross-syntax checking against MinGW declarations is separate build evidence
and must never be reported as native fixture execution. The original native
security source was checked with Clang 14 and MinGW-w64 10.0.0 declarations.
Native Windows execution is pending.

The new-child/deletion distinction follows [Windows access-right definitions](https://learn.microsoft.com/en-us/windows/win32/fileio/file-access-rights-constants).
