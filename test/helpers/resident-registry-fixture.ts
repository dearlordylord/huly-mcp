import { randomBytes, randomUUID } from "node:crypto"
import * as fs from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Schema } from "effect"

import { ResidentAttachment } from "../../src/resident/attachment-file.js"
import { ResidentDirectory } from "../../src/resident/protected-path.js"
import { VERSION } from "../../src/version.js"

const KEY_BYTES = 32

export const registryAttachment = () =>
  Schema.decodeUnknownSync(ResidentAttachment)({
    version: 1,
    transport: "tls13-external-psk-v1",
    implementation: { name: "@firfi/huly-mcp", version: VERSION },
    endpoint: "https://127.0.0.1:4321/mcp",
    identity: { generation: randomUUID(), key: randomBytes(KEY_BYTES).toString("hex") },
    authorization: "registry-fixture-private-authorization"
  })

export const withRegistryDirectory = async (use: (directory: ResidentDirectory) => Promise<void>) => {
  const root = ResidentDirectory.make(await fs.mkdtemp(join(await fs.realpath(tmpdir()), "resident-registry-")))
  try {
    await use(root)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
}
