# Huly MCP

Language for Huly MCP authentication and tracker issue operations.

## Language

**MCP operator**:
The person or organization running a remote hulymcp service and responsible for its configuration and machine connections.

**Authorization provider**:
The service issuing access credentials for a hosted MCP deployment. It may be operated separately from both hulymcp and Huly.

**MCP identity**:
A human or machine recognized by the hosted service through its verified authorization-provider issuer and subject.

**Hosted Huly connection**:
An MCP identity's saved association with a Huly instance, workspace, and downstream credentials. It is distinct from an MCP protocol session.

**Machine identity**:
An unattended caller acting as itself, with a Huly connection provisioned by the MCP operator.

**Hosted disconnect**:
Removal of a saved connection's availability for subsequent operations. It does not revoke the credential at Huly or undo operations already admitted.

**Hosted service access**:
Permission to use a hosted MCP deployment with the caller's own Huly connection. It does not grant rights beyond the connected Huly account or ownership of another identity's connection.

**Huly permissions**:
The access rights Huly applies to the connected account. Hosted authentication preserves these rights rather than introducing a separate per-operation or per-project permission system.

**Hosted connection setup**:
A human's authenticated creation or replacement of their own hosted Huly connection. Opening a setup link is not completion; completion means the connection has been verified and saved.

**Setup transaction**:
A temporary association between a request to set up Huly and the intended MCP identity. It identifies the setup in progress without granting authority to manage the connection.

**Machine connection provisioning**:
The MCP operator's creation or replacement of a machine identity's hosted Huly connection before unattended use. It is separate from the machine obtaining credentials from its authorization provider.

**Local Huly profile**:
A named local connection configuration shared by CLI and stdio MCP, identifying a Huly instance and workspace and any associated saved credential.

**Active local profile**:
The user's default profile for CLI operations when no profile is explicitly selected. It does not implicitly select a connection for stdio MCP.

**Saved credential destination**:
The Huly instance and workspace for which a local credential was saved. Changing a profile's destination does not authorize sending its saved credential to the new destination.

**Local logout**:
Removal of the selected local profile's saved credential while retaining the profile. It does not revoke the credential at Huly, remove environment credentials, or disconnect already-running processes.

**Issue transfer conflict**:
An unresolved incompatibility between a task's project-scoped attributes and its destination project that prevents transfer until the caller chooses a resolution.

**Project attribute reference**:
A task's reference to a project-scoped value, such as a component or milestone, whose meaning must remain valid in the destination project.

**Explicit attribute discard**:
The caller's deliberate choice to remove a specific project attribute reference as part of a transfer.
