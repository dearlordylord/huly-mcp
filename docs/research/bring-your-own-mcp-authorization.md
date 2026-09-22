# Optional bring-your-own MCP authorization

Research date: 2026-09-22. Decision ticket: [Establish the common interface for existing MCP authorization providers](https://github.com/dearlordylord/huly-mcp/issues/285). This is documentary research, not provider/client certification or an accepted implementation decision.

## Finding

Support both local and remote use cases. Local users should not need an authorization server. Remote operators should be able to connect an existing suitable authorization service, including a managed service, without installing another identity system. Build a standards-based resource-server integration and publish tested provider/client configuration profiles; do not promise that every product advertising OIDC supports every MCP client automatically.

The requested [Auth0Alternatives directory](https://www.auth0alternatives.com/) was used to discover candidates, including Keycloak, authentik, ZITADEL, and Logto. It mixes identity servers, hosted services, and application libraries. Presence in that directory is not evidence of MCP compatibility; the findings below use primary documentation.

## Who hosts what

| Use case | hulymcp | Authorization service | Huly |
| --- | --- | --- | --- |
| Local stdio | Runs on the user's machine | None required for MCP | Existing Huly Cloud or self-hosted deployment |
| Team remote endpoint | Run by the team's administrator in its infrastructure | Existing organizational provider, a managed tenant, or an independently chosen self-hosted provider | Existing Huly deployment |
| Public hulymcp service, if someone chooses to offer it | Run by that service operator | Chosen and configured by that operator | Users' Huly deployments |

These are deployment choices, not a proposal that the project maintainer operate a public service. End users of a team endpoint sign in; its administrator configures the provider once. The MCP specification explicitly separates the resource server from its authorization server, which may be external. Its HTTP authorization flow is not the prescribed stdio flow. [MCP roles and transport scope](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)

Huly can itself use an external OIDC provider for browser sign-in. An organization could reuse that provider for a separately registered hulymcp resource/client configuration. That reuses the identity system, not Huly's client registration, secrets, or access token. Huly's documented OIDC configuration makes Huly the relying application; it does not make Huly an OAuth authorization server for hulymcp. [Huly self-host OIDC setup](https://github.com/hcengineering/huly-selfhost#configure-openid-connect)

## The flow and responsibilities

1. The client connects to the team's hulymcp HTTPS endpoint.
2. hulymcp advertises the configured authorization server in protected-resource metadata and an authorization challenge.
3. The client obtains permission through that provider, normally using a browser and authorization code with PKCE.
4. The client sends an access token intended for hulymcp; hulymcp verifies it and enforces the requested operation's policy.
5. hulymcp obtains the separately stored Huly credential belonging to the authorized connection and calls Huly.

MCP specifies resource metadata, authorization-server discovery, client registration, and target-resource binding. A JWT validator alone covers only one part of this flow. OIDC login proves identity; permission to invoke a tool and select a stored connection remains application authorization. [MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)

The provider can own passwords, MFA, consent, signing keys, and access-token issuance. hulymcp still owns token acceptance policy, tool permissions, principal-to-connection mapping, encrypted Huly credential storage, onboarding sessions, and disconnection behavior. These are proposed responsibility boundaries. An auth provider's optional vault or token-exchange product does not automatically implement Huly's credential contract.

## Provider evidence and limits

| Provider | Verified relevant capabilities | Qualification for a hulymcp profile |
| --- | --- | --- |
| Auth0 | Managed service explicitly supports MCP, CIMD, and resource-parameter compatibility. | Enable the compatibility profile: without it, requests using `resource` can receive the wrong audience. Register a custom API and its scopes. A strong direct-integration candidate, subject to actual client testing. [GA announcement](https://auth0.com/blog/auth0-auth-for-mcp-servers-generally-available/), [resource/audience troubleshooting](https://support.auth0.com/center/s/article/mcp-audience-error-with-auth0) |
| Microsoft Entra ID | Official direct MCP guide describes discovery, v2 access tokens, registered HTTPS Application ID URI matching the resource, and delegated scopes. | Tenant/application configuration is required. Do not infer anonymous client registration or arbitrary-host compatibility from this guide. Test the exact tenant policy and target MCP client. [Entra MCP guide](https://learn.microsoft.com/en-us/entra/agent-id/secure-mcp-server-with-entra-id) |
| Keycloak | OIDC/OAuth discovery and DCR; experimental CIMD. Its MCP guide documents scope-to-audience mappers and concrete desktop-client setup. | The guide explicitly describes latest MCP compliance as partial because RFC 8707 is unsupported. A mapped scope can produce the right resource audience, but this is a documented compatibility profile, not native resource-indicator processing. [Keycloak MCP guide](https://www.keycloak.org/securing-apps/mcp-authz-server) |
| ZITADEL | DCR, public clients with PKCE, and JWT or opaque access-token introspection. | DCR is disabled by default; token-protected and open modes differ. Documentation says the authorization-code `resource` is ignored and dynamic clients share a project audience. Do not certify resource isolation from DCR/JWT support alone; a dedicated tested audience/claim policy is needed. [DCR limits](https://zitadel.com/docs/guides/integrate/dynamic-client-registration), [introspection](https://zitadel.com/docs/guides/integrate/token-introspection) |
| authentik | OIDC, PKCE, scope mappings, client credentials, and device flow; DCR added in 2026.8. | Documented DCR requires an authorized bearer token and scope, so it is not sufficient for an unknown client arriving without credentials. Its global issuer mode also needs care: discovery remains under the application's path. Native CIMD/resource-indicator compatibility was not established here. Start with explicit registration and an integration investigation. [OAuth provider](https://docs.goauthentik.io/add-secure-apps/providers/oauth2), [DCR](https://docs.goauthentik.io/add-secure-apps/providers/oauth2/dynamic-client-registration/) |
| Okta | Custom authorization servers support discovery, API audiences, custom scopes/claims, policies, and machine access. | Use a custom AS for our API; org-server access tokens are for Okta. Production custom AS use requires the API Access Management add-on. Generic capability does not certify CIMD or first-contact resource handling in every MCP client. [AS distinctions](https://developer.okta.com/docs/concepts/auth-servers/), [custom AS configuration](https://developer.okta.com/docs/guides/customize-authz-server/main/) |
| Logto | Cloud or self-hosted; official third-party MCP guide uses resource-bound JWTs/JWKS, custom API permissions, PKCE public clients, manual registration, or dynamic applications accepting HTTPS client metadata URLs. | Strong direct-integration candidate. Its tutorial is a configuration reference, not evidence that hulymcp has passed those integrations. No need to build its optional management-API registration service when a supported existing registration method suffices. [Third-party MCP guide](https://docs.logto.io/use-cases/ai/mcp-server-enable-third-party-ai-agent-access), [deployment prerequisite](https://docs.logto.io/use-cases/ai/mcp-server-add-auth) |

This sample supports a common standards boundary, not a numerical claim that a majority of the directory works unchanged. Features and tenant entitlements change; only the Okta production add-on requirement above was evaluated. No provider pricing or free-tier guarantee is implied.

## Proposed minimum supported interface

Use operator configuration, not arbitrary request-supplied issuers, to define trusted authorization servers and expected resource audiences. Recommended first implementation:

- Publish RFC 9728 protected-resource metadata and correct HTTP challenges from the existing HTTP boundary.
- Discover AS endpoints through RFC 8414 or OIDC discovery. Preserve issuer identity and validate metadata consistency.
- Verify asymmetric JWT access tokens using trusted JWKS, with a fixed algorithm policy, key rotation, issuer, intended audience, expiry, and required claims. Normalize provider scope representations into an internal authorization result; do not treat an ID token as an API access token.
- Support a configured RFC 7662 introspection adapter when opaque tokens are required. It must authenticate to the trusted endpoint and require an active token plus sufficient audience, expiry, principal, and permissions evidence; incomplete responses fail closed. Introspection adds a secret, network dependency, and revocation/cache policy. [RFC 7662](https://www.rfc-editor.org/rfc/rfc7662.html)
- Require a usable authorization-code/PKCE and client-registration path for each interactive compatibility profile. Pre-registration is valid; CIMD is preferable when supported by both ends; deprecated DCR remains a compatibility option. [MCP registration evolution](https://blog.modelcontextprotocol.io/posts/2026-07-28/)
- Record canonical resource, provider audience mapping, permitted scopes, user/machine identity claims, and client-registration instructions in each profile. Standard names do not guarantee identical token claims.

The injectable authorization service should return a parsed principal and permissions to the existing HTTP request boundary. Provider adapters may normalize verified claims or use introspection; they must not bypass issuer/audience validation. A server-side verifier cannot repair an external client's failed authorization request. If a provider needs an unsupported request parameter, either configure the provider, use a documented client option, or explicitly scope a broker/gateway integration.

## Is an OAuth broker required?

No: direct external-AS integration is already the architecture documented by MCP and the direct provider guides above. A broker becomes an optional additional component when the chosen upstream only provides login, cannot issue suitable API tokens, or cannot accommodate required client registration/resource semantics.

Such a broker would authenticate against the upstream provider and issue its own hulymcp access tokens. It consequently owns token issuance, signing keys, refresh grants, client registration, consent, and its own attack surface. This is materially more work than trusting an existing suitable issuer. Recommendation: do not require or build a universal broker in the first implementation; document unsupported combinations and leave an adapter/gateway route for operators who need them.

## Browser onboarding and identity binding

The Huly connection page can be served by the same remote hulymcp deployment, so it does not require users to install a separate website. It still needs an authenticated browser session and a secure connection-binding flow. The existing Huly research documents why a separate Huly token is currently required; this survey does not re-certify every Huly deployment. [Existing Huly assessment](authentication-security-assessment.md)

Do not assume the browser's OIDC subject equals the MCP access-token subject. OIDC supports pairwise subjects that differ across clients/sectors; email is not a safe substitute for a durable cross-client identifier. [OIDC subject identifiers](https://openid.net/specs/openid-connect-core-1_0.html#SubjectIDTypes)

Proposed binding contract: each supported provider profile must establish a stable, issuer-qualified application principal across both contexts, or the product must implement explicit account linking with proof of control of both contexts. An opaque, expiring, single-use onboarding transaction should bind the authenticated initiating principal to the exact connection being added. Possession of an onboarding URL alone must not silently attach a browser user's Huly credential to an unrelated MCP principal. Unverified subject equality and email matching are not acceptable fallback behavior.

## Headless and actual client support

Local unattended operation retains secret-manager injection of the Huly token and does not require OAuth or browser onboarding. Remote unattended operation can use a provisioned machine identity and OAuth client credentials; the Huly connection must also be provisioned. Client secrets or private-key authentication prove the machine's identity, so authorization must explicitly choose its allowed connection and operations.

The MCP client-credentials extension is currently documented, with client-secret and signed-assertion modes. This corrects the earlier conversation's characterization as merely a draft. SDK support is not proof that a particular desktop or CLI host exposes that mode. [MCP client-credentials extension](https://modelcontextprotocol.io/extensions/auth/oauth-client-credentials), [TypeScript SDK providers](https://ts.sdk.modelcontextprotocol.io/v2/api/%40modelcontextprotocol/client/client/authExtensions.html)

For a terminal with a human but no local browser, current Claude Code documentation describes printing an authorization URL and accepting the full redirect URL, and supports fixed callback ports, preconfigured client IDs, and CIMD. Its CI environment variable for a client secret still belongs to interactive authorization-code setup; it does not by itself establish client-credentials support. Other clients require their own verification. [Claude Code MCP authentication](https://code.claude.com/docs/en/mcp#use-pre-configured-oauth-credentials)

Recommendation: certify at least one current interactive host/provider pair and one explicitly programmed unattended SDK/provider pair. Include a browser-on-another-device scenario; do not assume opening a URL elsewhere makes a loopback callback reachable.

## Verification and remaining decisions

Keep the user-approved existing CLI command and HTTP request boundaries. Inject credential storage and authorization services there; test externally observable denial/acceptance and connection isolation, including wrong issuer/audience, ID-token substitution, expired tokens, missing scope, rotated JWKS, disabled connection, machine identity, and browser/MCP subject mismatch. Provider configuration tests must run full discovery, registration, issuance, and a protected call, not only locally minted JWT verification. Live Huly tests establish the separate downstream credential behavior.

Still requiring product decisions: first certified provider/client pairs; exact tool scopes; browser session/identity binding contract; credential-vault backend and key provisioning; local keychain support/migration; and machine-connection provisioning UX. Research resolves that new self-hosted auth infrastructure need not be mandatory, but does not choose these policies on the user's behalf.

No implementation or provider credentials were created. This document was checked with `git diff --check`; no application test run is claimed for documentary research.
