# Project Instructions

## Package Manager

Use `pnpm`, not npm. Prefer package.json scripts over raw commands (e.g., `pnpm typecheck` not `pnpm tsc --noEmit`).

## Verification

Run before considering work complete: `pnpm build && pnpm typecheck && pnpm lint && pnpm test`

## Integration Testing

See `INTEGRATION_TESTING.md` for manual testing against live Huly instance.

## Code Style

No comments that repeat the code. If the code says what it does, don't add a comment saying the same thing.

## No Dead Code

Every function, type, and export must have at least one call site at time of writing. Never write code "for future use" unless the user explicitly requests it.

## Type Safety

Type casts (`as T`) are a sin. Avoid them. When unavoidable:
1. Add a comment explaining WHY the cast is necessary
2. Document what evidence/API docs support the cast being safe
3. Consider if a generic type parameter or type guard could eliminate the cast

<!-- effect-solutions:start -->
## Effect Best Practices

**IMPORTANT:** Always consult effect-solutions before writing Effect code.

1. Run `effect-solutions list` to see available guides
2. Run `effect-solutions show <topic>...` for relevant patterns (supports multiple topics)
3. Search `.reference/effect/` for real implementations (run `effect-solutions setup` first)

Topics: quick-start, project-setup, tsconfig, basics, services-and-layers, data-modeling, error-handling, config, testing, cli.

Never guess at Effect patterns - check the guide first.
<!-- effect-solutions:end -->

## Huly API Reference

**Source**: https://github.com/hcengineering/huly-examples/tree/main/platform-api

**Local clone**: `.reference/huly-examples/platform-api/` - examples showing API usage patterns

**Keep updated**: `cd .reference/huly-examples && git pull`

Key examples to reference:
- Issue management: `examples/issue-*.ts`
- Document operations: `examples/documents/document-*.ts`
- Contact/person handling: `examples/person-*.ts`

Search examples for real usage patterns when implementing MCP tools.

## Manual Testing (stdio)

```bash
echo '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":1}
{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_projects","arguments":{}},"id":2}' | \
HULY_URL=... HULY_EMAIL=... HULY_PASSWORD=... HULY_WORKSPACE=... timeout 5 node dist/index.cjs
```

Use short timeouts (5s) - MCP keeps connection open.

## Publishing

```bash
pnpm build && pnpm version patch && pnpm publish && git push
```

Package: `@firfi/huly-mcp` on npm.
