# Project Instructions

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

## Publishing

```bash
npm run build && npm version patch && npm publish && git push
```

**Note:** Must run `npm run build` before publish - dist is not auto-built.

Package: `@firfi/huly-mcp` on npm.
