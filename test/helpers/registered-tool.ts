import { expect } from "vitest"
import type { RegisteredTool } from "../../src/mcp/tools/registry.js"

export const expectRegisteredMetadata = (actual: RegisteredTool | undefined, expected: RegisteredTool): void => {
  const { handler: _handler, operation: _operation, ...metadata } = expected
  expect(actual).toBeDefined()
  const { handler: _actualHandler, operation: _actualOperation, ...actualMetadata } = actual ?? expected
  expect(actualMetadata).toEqual(metadata)
}
