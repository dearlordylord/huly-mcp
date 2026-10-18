import { once } from "node:events"
import { createServer } from "node:http"
import { ClassifierKind } from "@hcengineering/core"
import { Schema } from "effect"
import { ProjectIdentifier } from "../../src/domain/schemas/shared.js"
import { core } from "../../src/huly/huly-plugins.js"

const TOKEN = "fixture-huly-token"
const RESOLVED_TOKEN = "fixture-rest-token"
const WORKSPACE = "00000000-0000-4000-8000-000000000001"
const Empty = Schema.Array(Schema.Never)
const Configuration = Schema.Struct({
  ACCOUNTS_URL: Schema.String,
  COLLABORATOR_URL: Schema.String,
  FILES_URL: Schema.String,
  UPLOAD_URL: Schema.String
})
const Workspace = Schema.Struct({
  result: Schema.Struct({
    endpoint: Schema.String,
    token: Schema.String,
    workspace: Schema.String,
    workspaceUrl: Schema.String
  })
})
const Account = Schema.Struct({
  uuid: Schema.String,
  primarySocialId: Schema.String,
  socialIds: Schema.Array(Schema.String)
})
export const DisposableRestProject = Schema.Struct({
  _id: Schema.NonEmptyString,
  _class: Schema.Literal("tracker:class:Project"),
  space: Schema.NonEmptyString,
  modifiedOn: Schema.Number,
  modifiedBy: Schema.NonEmptyString,
  identifier: ProjectIdentifier,
  name: Schema.NonEmptyString,
  archived: Schema.Boolean
})
const ProjectQuery = Schema.Struct({ identifier: Schema.optionalKey(ProjectIdentifier) })
// The SDK builds both its hierarchy and model database from these wire transactions.
const ModelClassTransaction = Schema.Struct({
  _id: Schema.NonEmptyString,
  _class: Schema.Literal("core:class:TxCreateDoc"),
  space: Schema.Literal("core:space:Tx"),
  objectId: Schema.NonEmptyString,
  objectClass: Schema.Literal("core:class:Class"),
  objectSpace: Schema.Literal("core:space:Model"),
  modifiedOn: Schema.Number,
  modifiedBy: Schema.NonEmptyString,
  attributes: Schema.Struct({ kind: Schema.Literal(ClassifierKind.CLASS), domain: Schema.NonEmptyString })
})
const ProjectModel = Schema.Array(ModelClassTransaction)
// Decode wire strings rather than recursively branded SDK model-reference types.
const projectModel = Schema.decodeUnknownSync(ProjectModel)(
  [String(core.class.Class), "tracker:class:Project"].map((objectId) => ({
    _id: `fixture-model-${objectId}`,
    _class: String(core.class.TxCreateDoc),
    space: String(core.space.Tx),
    objectId,
    objectClass: String(core.class.Class),
    objectSpace: String(core.space.Model),
    modifiedOn: 1,
    modifiedBy: "fixture-owner",
    attributes: { kind: ClassifierKind.CLASS, domain: "model" }
  }))
)
const FindResult = Schema.Struct({
  dataType: Schema.Literal("TotalArray"),
  value: Schema.Array(DisposableRestProject),
  total: Schema.Natural
})
const Select = Schema.Struct({
  method: Schema.Literal("selectWorkspace"),
  params: Schema.Struct({
    workspaceUrl: Schema.Literal("fixture"),
    kind: Schema.Literal("external"),
    externalRegions: Empty
  })
})
const MAX_REQUEST_BYTES = 8_192
const HTTP_BAD_REQUEST = 400

export const startDisposableRestFixture = async (
  options: {
    readonly onModelLoad?: () => Promise<void>
    readonly onProjectRead?: () => Promise<void>
    readonly projects?: ReadonlyArray<Schema.Schema.Type<typeof DisposableRestProject>>
  } = {}
) => {
  const observed = { modelRequests: 0, projectReads: 0, fullModelRequested: true, invalidRequests: 0 }
  const server = createServer((request, response) => {
    const handle = async () => {
      const endpoint = readEndpoint()
      const url = new URL(request.url ?? "/", endpoint)
      response.setHeader("content-type", "application/json")
      if (url.pathname === "/config.json") {
        response.end(
          Schema.encodeSync(Schema.fromJsonString(Configuration))({
            ACCOUNTS_URL: `${endpoint}/accounts`,
            COLLABORATOR_URL: endpoint,
            FILES_URL: `${endpoint}/files`,
            UPLOAD_URL: `${endpoint}/upload`
          })
        )
        return
      }
      if (url.pathname === "/accounts") {
        if (request.headers.authorization !== `Bearer ${TOKEN}`) throw new Error("Fixture account authorization failed")
        const chunks: Array<Buffer> = []
        let size = 0
        for await (const chunk of request) {
          const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(Schema.decodeUnknownSync(Schema.String)(chunk))
          size += bytes.length
          if (size > MAX_REQUEST_BYTES) throw new Error("Fixture account frame exceeded its bound")
          chunks.push(bytes)
        }
        Schema.decodeUnknownSync(Schema.fromJsonString(Select))(Buffer.concat(chunks).toString("utf8"))
        response.end(
          Schema.encodeSync(Schema.fromJsonString(Workspace))({
            result: { endpoint, token: RESOLVED_TOKEN, workspace: WORKSPACE, workspaceUrl: "fixture" }
          })
        )
        return
      }
      if (request.headers.authorization !== `Bearer ${RESOLVED_TOKEN}`)
        throw new Error("Fixture REST authorization failed")
      if (url.pathname === `/api/v1/account/${WORKSPACE}`) {
        response.end(
          Schema.encodeSync(Schema.fromJsonString(Account))({
            uuid: WORKSPACE,
            primarySocialId: "fixture-social-id",
            socialIds: ["fixture-social-id"]
          })
        )
      } else if (url.pathname === `/api/v1/load-model/${WORKSPACE}`) {
        observed.modelRequests++
        observed.fullModelRequested &&= url.searchParams.get("full") === "true"
        await options.onModelLoad?.()
        response.end(Schema.encodeSync(Schema.fromJsonString(ProjectModel))(options.projects ? projectModel : []))
      } else if (
        url.pathname === `/api/v1/find-all/${WORKSPACE}` &&
        url.searchParams.get("class") === "tracker:class:Project"
      ) {
        observed.projectReads++
        await options.onProjectRead?.()
        const query = Schema.decodeUnknownSync(Schema.fromJsonString(ProjectQuery))(
          url.searchParams.get("query") ?? "{}"
        )
        const projects = (options.projects ?? []).filter(
          (project) => query.identifier === undefined || project.identifier === query.identifier
        )
        response.end(
          Schema.encodeSync(Schema.fromJsonString(FindResult))({
            dataType: "TotalArray",
            value: projects,
            total: projects.length
          })
        )
      } else throw new Error("Unexpected disposable REST route")
    }
    void handle().catch(() => {
      observed.invalidRequests++
      response.writeHead(HTTP_BAD_REQUEST).end()
    })
  })
  const readEndpoint = () => {
    const address = server.address()
    if (address === null || typeof address === "string") throw new Error("Fixture listener did not bind TCP")
    return `http://127.0.0.1:${address.port}`
  }
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  return {
    endpoint: readEndpoint(),
    observed,
    close: async () => {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    }
  }
}
