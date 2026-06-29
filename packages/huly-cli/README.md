# Huly CLI

Command-line frontend for the Huly operations shipped by [`@firfi/huly-mcp`](https://www.npmjs.com/package/@firfi/huly-mcp).

The CLI uses the same schema-owned operation registry as the MCP server. It does not proxy through MCP, JSON-RPC, or `tools/call`.

## Installation

```bash
npx -y @firfi/huly-cli@latest --help
```

Or install it globally:

```bash
npm install -g @firfi/huly-cli
huly --help
```

## Configuration

The CLI reads the same Huly environment variables as the MCP server:

```bash
export HULY_URL=https://huly.app
export HULY_WORKSPACE=yourworkspace
export HULY_EMAIL=your@email.com
export HULY_PASSWORD=yourpassword
```

You can use `HULY_TOKEN` instead of `HULY_EMAIL` and `HULY_PASSWORD`. `HULY_CONNECTION_TIMEOUT` is also supported.

## Usage

Every command supports `--json`, `--input-json '<object>'`, and `--input-file path/to/input.json`. Explicit command-line flags override JSON/file input.

```bash
huly projects list
huly projects list --json
huly issues get PROJ 123 --json
huly issues create --project PROJ --title "Fix login flow" --description-file ./body.md
huly comments delete --comment-id 0123456789abcdef --yes
huly attachments download 0123456789abcdef --output ./attachment.bin
huly search "customer import"
```

Run `huly --help` for the generated command tree.
