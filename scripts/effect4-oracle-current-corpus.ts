import { getHulyContextToolDefinition, versionToolDefinition } from "../src/mcp/huly-context-tool.js"
import { proxyToolDefinitions } from "../src/mcp/proxy-tools.js"
import { toolRegistry } from "../src/mcp/tools/index.js"
import { validateDraft07ToolCorpus } from "./effect4-oracle-draft07.js"

export const currentDraft07Corpora = () => ({
  native: [...toolRegistry.definitions, versionToolDefinition, getHulyContextToolDefinition],
  proxy: [...proxyToolDefinitions, versionToolDefinition, getHulyContextToolDefinition]
})

export const validateCurrentDraft07Corpora = (): { readonly native: number; readonly proxy: number } => {
  const current = currentDraft07Corpora()
  const native = validateDraft07ToolCorpus(current.native)
  const proxy = validateDraft07ToolCorpus(current.proxy)
  return { native: native.length, proxy: proxy.length }
}
