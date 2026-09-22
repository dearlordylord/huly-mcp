# Hosted authorization reference setup

Research date: 2026-09-22. Narrow documentary follow-up to [Optional bring-your-own MCP authorization](bring-your-own-mcp-authorization.md). This proposes a reference profile; no provider, accounts, credentials, or application code were created, and no interoperability test was run.

## Recommendation

For minimum setup, use a **Logto Cloud development tenant**, with **Claude Code on the macOS host** as the interactive client and an **MCP TypeScript SDK client** in the development container for client credentials. A disposable **Logto OSS + PostgreSQL** fixture on OrbStack is the self-hosted alternative. This is a recommendation inferred from the capabilities below, not a completed integration check. Keep the initial contract JWT/JWKS-only, with explicit client registration; defer opaque-token introspection, dynamic registration, and provider comparison.

Cloud onboarding creates a development tenant, documented as free for testing. Development tenants expose paid features without a subscription but have feature quotas, a development banner, and 90-day user retention; they are not production environments. Using the provider-managed issuer avoids configuring local issuer DNS/TLS. It does not remove MCP endpoint reachability or TLS requirements. Account creation and setup remain deferred. [Cloud setup](https://docs.logto.io/introduction/set-up-logto-cloud), [Development tenant policy](https://docs.logto.io/logto-cloud/tenant-settings), [Hosted discovery example](https://docs.logto.io/use-cases/multi-tenancy/build-multi-tenant-saas-application)

## Provider contract

Logto's official MCP guide supports manually registered third-party applications. Native or SPA applications use PKCE without a client secret; third-party access includes user consent. Its resource-server example verifies audience-bound JWTs using issuer, JWKS, audience, and expiry. Register one Native application for the interactive client. [Logto third-party MCP guide](https://docs.logto.io/use-cases/ai/mcp-server-enable-third-party-ai-agent-access)

Register one global API resource whose identifier exactly equals the canonical hulymcp resource URI, including its path/trailing-slash decision. Logto documents `resource` in authorization and token requests, JWT issuance for global API resources, and a space-separated `scope` claim. Permissions come from roles assigned to users or clients. Existing JWTs retain old permissions until expiry. Use an agreed test permission for the fixture; its name does not settle the later product scope design. [Global API resources](https://docs.logto.io/authorization/global-api-resources)

The verifier profile should accept only explicitly allowed asymmetric signing algorithms. Logto's validation examples include RS256, issuer ending `/oidc`, and JWKS ending `/oidc/jwks`; they normalize audience strings/arrays and space-separated scopes. **Confirm the fixture's actual access-token algorithm before fixing its allowlist**; an example is not a guarantee about a selected release's defaults. [Token validation](https://docs.logto.io/authorization/validate-access-tokens)

Create a separate Machine-to-machine application, assign an M2M role containing the test API permission, and use `client_credentials` with `client_secret_basic`, `resource`, and `scope`. Logto documents machine `sub` as the application ID, not a user identity. Record the issuer-qualified machine subject separately from human subjects and explicitly provision its allowed Huly connection; browser account linking remains a later decision. [Logto M2M guide](https://docs.logto.io/quick-starts/m2m)

## Client choices

Claude Code documents pre-registered public clients via `--client-id` without `--client-secret`, and a fixed `--callback-port` matching `http://localhost:PORT/callback`. Run it beside the macOS browser to keep that callback local. Its documentation establishes registration and discovery support but does not explicitly establish the exact `resource` parameters sent by the chosen version: inspect those during the integration check. Record the version; the docs identify a past localhost/127.0.0.1 callback mismatch. [Claude Code OAuth configuration](https://code.claude.com/docs/en/mcp#use-pre-configured-oauth-credentials)

Use the SDK's `ClientCredentialsProvider` with a `StreamableHTTPClientTransport`, configured client ID/secret, requested scope, and `expectedIssuer`. The provider documents Basic client authentication and discovered resource storage; binding the expected issuer prevents sending static credentials to another discovered issuer. This is documented machinery, not a tested Logto pairing. [SDK auth providers](https://ts.sdk.modelcontextprotocol.io/v2/api/@modelcontextprotocol/client/client/authExtensions.html)

## Fixture topology

Logto publishes a demonstration Compose file containing Logto and PostgreSQL, exposing core port 3001 and admin port 3002. It is suitable as the disposable starting point, not a production deployment template. Pin the eventual tested image version/digest rather than testing an unpinned `latest`. [Official Compose source](https://github.com/logto-io/logto/blob/master/docker-compose.yml), [OSS setup](https://docs.logto.io/logto-oss/get-started-with-oss)

Set one canonical `ENDPOINT`; Logto says this affects issuer identity. It supports HTTPS directly or through a reverse proxy, with forwarded-header configuration. **Topology inference:** the browser, Claude Code, and container must resolve and trust the same HTTPS issuer hostname. A container-only alias such as `host.docker.internal` can assist routing, but must not silently replace the issuer advertised to the browser. Choose and verify DNS/hosts routing and certificate trust during fixture setup. [Deployment configuration](https://docs.logto.io/logto-oss/deployment-and-configuration)

Although Logto's quickstart demonstrates local HTTP, current SDK v2 documentation lists `InsecureTokenEndpointError` for non-HTTPS token exchange, including client-credentials fetches. Therefore plan HTTPS for the issuer and MCP resource; do not depend on disabling TLS verification. The interactive localhost HTTP callback is a separate redirect endpoint. [SDK v2 migration reference](https://ts.sdk.modelcontextprotocol.io/v2/migration/upgrade-to-v2), [Claude Code callback configuration](https://code.claude.com/docs/en/mcp#use-a-fixed-oauth-callback-port)

## What the representative integration check must establish

Pin the actual Logto/client versions and verify discovery, explicit registration, PKCE, resource-bound JWT issuance, JWKS verification, and a protected call for both grants. Confirm actual user/machine subject and scope claims, algorithm, expiry, and issuer consistency; test wrong audience/issuer, missing scope, expired tokens, and key rotation. Demonstrate that machine access uses only its provisioned Huly connection. DNS, certificates, selected image behavior, Claude Code resource handling, SDK request parameters, and end-to-end interoperability remain untested facts. Browser-to-MCP identity binding and final tool permissions remain product decisions, not conclusions of this fixture research.
