# Code Review Rules

Code review agents must check all items below. These are nitpick-level quality gates — enforce strictly.

## Comments

- No comments that repeat the code. If the code says what it does, a comment saying the same thing is noise.
- Cast justifications must be technically accurate (see Type Safety below).

## Dead Code

Every function, type, and export must have at least one call site at time of writing. No code "for future use" unless explicitly requested.

## Tests

Don't write tests that only verify compile-time guarantees (type assignments, interface conformance). If the compiler checks it, a test adds nothing.

Property-based tests must live in `*.property.test.ts` files. Flag any `fast-check` import or `fc.property` use in ordinary `*.test.ts` files; those tests must be moved, not hidden inside example suites. When reviewing generated tests, verify the property is stronger than "does not throw" unless the tested contract is explicitly a no-crash boundary.

## Type Safety — Cast Review Checklist

For every `as T` cast, verify:
1. Comment explains WHY the cast is necessary
2. Evidence/API docs support the cast being safe
3. A generic type parameter or type guard couldn't eliminate the cast

## TypeScript Type-System Terminology

Branded types (phantom types, opaque types) are compile-time only constructs — erased during transpilation. Common errors to catch:
- "branded at runtime" — oxymoron. At runtime they're plain strings/numbers/etc.
- "branded strings over the same runtime value" — brands don't exist at runtime; say "brands erased at runtime; both are plain strings"
- Cast justifications that imply brands have runtime meaning

Correct pattern: "Brands erased at runtime; both are `string`, so the cast is safe."

## State Space Minimality

For every product type (interface, type alias, Schema struct), verify: can every combination of field values occur in practice? If not, restructure to eliminate impossible states (discriminated union, nested types, `Option` instead of sentinel values). Symptoms:
- `""` / `0` / `null` meaning "not applicable" (sentinel values)
- Boolean alongside fields only meaningful when true/false
- Optional fields that must all be present-or-absent together
- Discriminated union variants carrying fields that only apply to some variants at the product level

## Connascence

Review every changed literal, branch condition, helper boundary, narrowed type, protocol step, and duplicated rule for connascence: code facts that must change together for correctness.

Flag distant or high-degree connascence, especially:
- magic strings/numbers whose validity depends on a separate parser, support gate, schema, protocol, SDK convention, or test fixture
- tuple/array index assumptions instead of named fields
- duplicated validation, projection, encoding, decoding, or execution algorithms
- downstream code manually remembering what an upstream narrowing helper or schema already proved
- caller protocols requiring operations in a specific order when a single API or state-typed API could encode the sequence
- duplicated default values, initial state, status meanings, or sentinel semantics

Required reviewer questions:
1. What must change together if this line changes?
2. Is that coupling local and obvious, or distant and implicit?
3. Is the coupling weak enough for its distance? If not, require a refactor.

Preferred fixes:
- replace magic values with named constants, literal unions, branded/domain types, or derived values
- replace positional conventions with records or named fields
- centralize duplicated algorithms behind one implementation
- pass narrowed/domain-specific values forward instead of rechecking or reinterpreting primitives
- colocate unavoidable strong connascence in one helper/module named after the domain invariant

Do not accept comments as the only fix when the relationship can be encoded in types, schemas, constants, or helper structure.

## Boundary Typing

All data crossing system boundaries (APIs, etc.) must be strongly typed — both inbound (decoding) and outbound (encoding), with Effect Schema. Flag any `any`, untyped fetch results, or raw JSON access.

## Parse, Don't Validate

Boundary code must pass parsed/refined domain values forward, not raw DTOs that were merely checked. Flag:
- `validateX` helpers that return a refined/domain value; rename and treat them as parsers
- repeated validation of facts already proven by a schema/parser
- core/application functions accepting raw `unknown`, raw JSON, raw IDs, or nullable DTO bags when a parsed domain type exists
- code that discards parser output and keeps using the original primitive

Expected parse/domain/integration failures must be typed Effect errors. Throws are acceptable only for defects, framework-required behavior, or startup/bootstrap failures.

## Functional Core / Imperative Shell

Review changed MCP handlers, protocol adapters, SDK adapters, and operations for misplaced business logic. Entrypoints should parse protocol input, sequence effects, call shared modules with parsed domain values, and render protocol output. Domain decisions, target resolution, state transitions, and mapping rules belong in shared core/application modules where they can be tested without protocol setup.

Flag hidden I/O, ambient time/randomness, direct SDK calls, or `process.env` reads inside modules that should be pure/domain logic.

## Config and Resources

Configuration must be parsed at startup or the earliest request boundary into typed config with redacted secrets. Flag scattered `process.env` reads outside entrypoint/config modules, raw secret strings crossing module boundaries, and any secret value included in errors, logs, diagnostics, snapshots, or tool results.

Modules should not perform I/O at import time. Flag top-level server startup, connection creation, env reads, handler registration, file/network access, or mutable singleton state outside explicit bootstrap/Effect layer ownership.

## No Bare Primitives for Domain Values

Function signatures and type definitions must never use bare `string`, `number`, or `boolean` where a domain-specific type (union, branded, alias) exists or should exist. This applies to return types, parameters, map key/value types, schema fields, and struct fields.

Examples:
- A function returning `"ChPending" | "ChRunning" | "ChCompleted" | "ChFailed"` must have that union (or a named alias like `DagChildStatus`) as return type, not `string`
- A function producing node IDs must return `DagNodeId`, not `string`
- A timestamp field must use `number` only if no branded type like `Millis` exists; if one does, use it

Symptoms to flag:
- `(s: DomainType): string` — return type loses domain information
- `ReadonlyMap<string, string>` where keys or values have known finite domains
- `Schema.String` in schemas where the field has a known set of valid values (use `Schema.Literals`)
- Bare `number` for quantities that have units or domain meaning (timestamps, indices, counts) when a branded/alias type exists
- Type-narrowing helper that accepts a primitive and returns a type guard — the input might be unavoidable (external data), but document why
- If a suitable brand or alias already exists in `src/domain/schemas/shared.ts`, reuse it before creating a new type
- Calls to `toRef` must receive values already decoded/branded by domain schemas or values already returned by the Huly SDK as refs. Treat `toRef` as the final SDK boundary conversion, not as validation for arbitrary user text.

## Immutability

No `let` for conditional assignment. Use `const` with:
- Ternary for single-variable branches
- Destructured struct (inline or extracted function) for multi-variable branches
- `yield* Effect.gen(function* () { ... })` when a branch needs effectful computation

Legitimate mutation (accumulators, state flags) must be justified by context — flag if unclear.

## Agent-Visible Degradation

Any fallback that changes returned payload fidelity must emit `Diagnostics.warnAgent` into the tool result. Examples: synthesized names, sentinel categories, and partial metadata resolution. Silent degradation is a bug.

Operator-only facts use `Diagnostics.trail` inside request scope, or bare `Effect.log*` outside request scope. `warnAgent` is reserved for payload-fidelity degradation, not routine anomalies.

Tests for fallback paths must assert the warning is present, or assert it is absent when the fallback fully repairs the payload.
