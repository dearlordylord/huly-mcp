import type { MarkupBlobRef, Ref, TxOperations } from "@hcengineering/core"
import type { Document as HulyDocument } from "@hcengineering/document"
import { createRequire } from "node:module"

import { documentPlugin } from "../src/huly/huly-plugins.js"

const require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/consistent-type-imports, no-restricted-syntax -- CJS interop boundary: api-client does not expose these helpers as ESM runtime named exports under tsx.
const apiClient = require("@hcengineering/api-client") as typeof import("@hcengineering/api-client")

interface Args {
  readonly content: string
  readonly documentId: string
}

const usage = `Usage:
  pnpm exec tsx scripts/corrupt-document-content.ts --document <document-id> --content <raw-markdown>

This integration-test helper deliberately writes raw markdown into Document.content.
Do not use it outside disposable test documents.
`

const readValue = (args: ReadonlyArray<string>, index: number, flag: string): string => {
  const value = args[index + 1]
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.\n${usage}`)
  }
  return value
}

const parseArgs = (argv: ReadonlyArray<string>): Args => {
  let content = ""
  let documentId = ""

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    switch (arg) {
      case "--content":
        content = readValue(argv, index, arg)
        index++
        break
      case "--document":
        documentId = readValue(argv, index, arg)
        index++
        break
      case "--help":
        console.log(usage)
        process.exit(0)
        break
      default:
        throw new Error(`Unknown argument: ${arg}\n${usage}`)
    }
  }

  if (documentId.trim() === "" || content.trim() === "") {
    throw new Error(`--document and --content are required.\n${usage}`)
  }

  return { content, documentId }
}

const requiredEnv = (name: string): string => {
  const value = process.env[name]
  if (value === undefined || value.trim() === "") throw new Error(`${name} is required.`)
  return value
}

const connect = async (): Promise<TxOperations> => {
  const url = requiredEnv("HULY_URL")
  const workspace = requiredEnv("HULY_WORKSPACE")
  const serverConfig = await apiClient.loadServerConfig(url)
  const token = process.env["HULY_TOKEN"]
  const auth = token !== undefined && token.trim() !== ""
    ? { token, workspace }
    : {
      email: requiredEnv("HULY_EMAIL"),
      password: requiredEnv("HULY_PASSWORD"),
      workspace
    }
  const { endpoint, token: workspaceToken, workspaceId } = await apiClient.getWorkspaceToken(url, auth, serverConfig)
  return await apiClient.createRestTxOperations(endpoint, workspaceId, workspaceToken)
}

const corruptDocumentContent = async (client: TxOperations, args: Args): Promise<void> => {
  // Integration corruption helper: CLI strings intentionally become Huly branded refs at this boundary.
  // eslint-disable-next-line no-restricted-syntax -- SDK boundary: Huly brands document ids as Ref<T>, while script input is a string.
  const documentId = args.documentId as Ref<HulyDocument>
  // eslint-disable-next-line no-restricted-syntax -- SDK boundary: this helper deliberately writes raw markdown into a branded markup field.
  const content = args.content as MarkupBlobRef
  const docs = await client.findAll<HulyDocument>(
    documentPlugin.class.Document,
    { _id: documentId },
    { limit: 1 }
  )
  const doc = docs[0]
  if (doc === undefined) {
    throw new Error(`Document '${args.documentId}' not found.`)
  }

  await client.updateDoc(
    documentPlugin.class.Document,
    doc.space,
    doc._id,
    { content }
  )
}

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2))
  const client = await connect()
  await corruptDocumentContent(client, args)
  console.log(`Corrupted Document.content for ${args.documentId}`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
