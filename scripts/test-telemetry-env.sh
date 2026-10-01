#!/usr/bin/env bash
# Test traffic must never enter production usage analytics, even when the caller
# explicitly enabled telemetry. Children inherit both opt-outs.
export HULY_MCP_TELEMETRY=0
export HULY_CLI_TELEMETRY=0
