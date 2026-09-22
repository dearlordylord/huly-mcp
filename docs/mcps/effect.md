# Effect reference sources

This project keeps exact source checkouts for active Effect work. The checkouts
are ignored local reference material; this tracked document records their
reviewed refs.

## Reference corpus

| Purpose | Local path | Upstream ref | Commit |
| --- | --- | --- | --- |
| Active Effect 4 target source | `.reference/effect-v4.0.0-rc.117/` | `effect@4.0.0-rc.117` | `14a3f140095fdebbff9162944fe7d4ea83e054e6` |
| Official agent workflows | `.reference/effect-skills/` | `Effect-TS/skills` `main`, reviewed pin | `28822c9e19998876a6b0e0d97877442012ed4391` |

The installed target cohort is:

- `effect@4.0.0-rc.117`
- `@effect/platform-node@4.0.0-rc.117`
- `@effect/vitest@4.0.0-rc.117`
- `@effect/tsgo@0.36.4`
- `vitest@5.0.1`
- `@vitest/coverage-v8@5.0.1`

The installed `effect` package includes the tracked
`patches/effect@4.0.0-rc.117.patch` extension. The pnpm lockfile records patch
hash `48dd300ad8ca97ea41839a226dc716242015feab66fd050c1032725451ea8a06`.
The extension keeps the native rc.117 transports and protocol codecs while
adding the application hooks required to preserve this server's established
MCP behavior:

- request-local legacy stateless HTTP sessions selected through
  `legacyStatelessProtocolVersion` and released when the request disconnects;
- effectful resource listing in the active MCP request context;
- a tool call-eligibility predicate independent from list visibility, with
  call eligibility defaulting to the visibility predicate;
- an optional unknown-tool fallback invoked only when no tool registration
  exists; registered but non-callable tools still fail through native policy,
  and the upstream invalid-params behavior remains the default;
- request-specific interruption sent when the native HTTP response wait is
  interrupted; the application retention barrier then waits for target
  operation cleanup before physically closing the request-scoped client lease;
- graceful RPC transport finishing with a joined output queue writer so stdio
  responses admitted before EOF are flushed before the transport closes.

These hooks are a local extension contract, not an upstream rc.117 API. Review
or remove the patch when adopting a later Effect release that provides
equivalent public capabilities.

`@effect/cli` and `@effect/platform` are intentionally absent as direct target
dependencies. Their APIs moved into the core package, including
`effect/unstable/cli` and `effect/unstable/http`; use the exact import map for
symbol-level replacements. `@effect/platform-node` remains a separate package.

There is intentionally no ambiguous `.reference/effect` alias. Choose the source
generation explicitly in every search.

## Authority and lookup order

For current Effect work, use evidence in this order:

1. The exact package declarations installed by the lockfile and the tracked
   Effect patch for current behavior.
2. The pinned unmodified v4 topic guides and source for implementation patterns.
3. The consumer guidance shipped as `node_modules/effect/AGENTS.md` in the exact
   installed v4 package.
4. The release announcement and project research note for rationale only.

Exact installed package declarations and the tracked patch override the
unmodified source snapshot, generic guidance, and globally installed skills.
The installed `AGENTS.md` is generated consumer guidance; the pinned source's
`.agents/AGENTS.md` contains instructions for contributors to Effect itself and
does not replace this project's instructions. This matters for `4.0.0-rc.117`:
the installed guide and declarations use `Schema.TaggedError`, even when
generic guidance describes a different name.

The installed rc.117 declarations also confirm the current surfaces used by
this project: class-style `Context.Service<Self, Shape>()`,
`Schema.toJsonSchemaDocument` with `JsonSchema.toDocumentDraft07`,
`Effect.runPromiseExit`, the flat `Cause.reasons` representation, and the
`effect/unstable/cli` and `effect/unstable/process` package exports. Search the
installed declarations before applying any of these patterns; this list is a
provenance checkpoint, not a substitute for exact signatures.

Before editing Effect code, read the relevant project instructions and search the
smallest applicable installed declaration or pinned v4 source region. Escalate to
a topic guide and then exact v4 source when a pattern is structural or ambiguous.

## Setup and refresh

From the canonical checkout, create or verify the active pinned v4 source and
general Effect workflow repositories with:

```bash
bash scripts/setup-effect-references.sh
```

The command stages each new clone in a temporary directory and moves it into
place only after checkout. It never rewrites an existing repository. An existing
checkout with the wrong origin or commit, local changes, or an ambiguous
`.reference/effect` path causes a failure that must be inspected manually.

Use the network-free verification mode in routine checks and before starting
Effect work:

```bash
bash scripts/setup-effect-references.sh --check
```

The active Effect source tree is an immutable upstream snapshot. Do not
`git pull` it or apply the project patch inside it. Changing the snapshot is a
dependency and specification decision that requires updating the constants in
the setup script and this document together. pnpm applies the tracked extension
to the installed package instead.

The skills repository is moving guidance, but this project uses the recorded
commit rather than a moving branch. To consider an update, fetch and review it
without changing the checked-out pin:

```bash
git -C .reference/effect-skills fetch origin main
git -C .reference/effect-skills diff HEAD..origin/main
```

Adopting that update requires changing the reviewed commit in both the setup
script and this document. Do not merge moving `main` into the reference checkout.

Secondary worktrees receive the local reference corpus through
`bash scripts/bootstrap-worktree.sh`, which links the complete `.reference`
directory from the canonical checkout.

Keep or replace the v4 snapshot only alongside an explicit Effect version
change.
