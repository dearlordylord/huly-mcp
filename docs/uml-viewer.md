# UML view of external issue publication

The repository includes a hand-authored UML Viewer snapshot at
`examples/hulymcp.edn`. It focuses on the Huly-owned GitHub publication flow:
the schema contract, pure projection/target-resolution core, Huly adapter,
MCP tools, error mapping, and the regression/integration test seams.

UML Viewer currently discovers source topology through its Clojure parser, so
this TypeScript project uses an explicit EDN view rather than claiming that a
live parser generated it. The snapshot is intentionally review-oriented and
should be updated when the publication architecture changes.

## Run it

The setup script has installed the upstream viewer under the ignored
`.uml-viewer/` directory and added the portable `./uml` launcher. From the
repository root:

```bash
./uml examples/hulymcp.edn
```

The launcher requires the Clojure CLI and Java 21 or newer. `--help` is a
non-GUI smoke check:

```bash
./uml --help
```
