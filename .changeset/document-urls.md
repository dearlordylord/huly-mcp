---
"@firfi/huly-mcp": minor
---

Include a `url` field (typed as `UrlString`) on every document result (`list_documents`, `get_document`, `create_document`, `edit_document`) pointing directly at the document in the Huly web app. The URL is built from the connected workspace's `WorkspaceLoginInfo.workspaceUrl` slug and a title-derived path segment (`<baseUrl>/workbench/<workspaceUrl>/document/<title-slug>-<id>`), matching the links Huly itself produces. This removes a common failure mode where callers constructed URLs from the raw `WorkspaceUuid` and hit the login-loop page instead of the document.
