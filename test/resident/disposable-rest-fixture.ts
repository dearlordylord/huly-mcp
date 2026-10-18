import { once } from "node:events"
import { createServer, type IncomingMessage } from "node:http"
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
const ProjectUpdate = Schema.Struct({
  _id: Schema.NonEmptyString,
  _class: Schema.Literal("core:class:TxUpdateDoc"),
  space: Schema.NonEmptyString,
  objectId: Schema.NonEmptyString,
  objectClass: DisposableRestProject.fields._class,
  objectSpace: Schema.NonEmptyString,
  modifiedOn: Schema.Number,
  modifiedBy: Schema.NonEmptyString,
  operations: Schema.Struct({ name: DisposableRestProject.fields.name }),
  retrieve: Schema.optionalKey(Schema.Boolean)
})
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
const readBody = async (request: IncomingMessage) => {
  const chunks: Array<Buffer> = []
  let size = 0
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(Schema.decodeUnknownSync(Schema.String)(chunk))
    size += bytes.length
    if (size > MAX_REQUEST_BYTES) throw new Error("Fixture request frame exceeded its bound")
    chunks.push(bytes)
  }
  return Buffer.concat(chunks).toString("utf8")
}

export const startDisposableRestFixture = async (
  options: {
    readonly onModelLoad?: () => Promise<void>
    readonly onProjectRead?: (identifier: Schema.Schema.Type<typeof ProjectIdentifier> | undefined) => Promise<void>
    readonly afterProjectWrite?: () => Promise<void>
    readonly projects?: ReadonlyArray<Schema.Schema.Type<typeof DisposableRestProject>>
  } = {}
) => {
  const observed = {
    modelRequests: 0,
    projectReads: 0,
    projectQueries: new Array<Schema.Schema.Type<typeof ProjectIdentifier>>(),
    projectWrites: 0,
    committedProjectWrites: 0,
    fullModelRequested: true,
    invalidRequests: 0
  }
  let projectState = [...(options.projects ?? [])]
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
        Schema.decodeUnknownSync(Schema.fromJsonString(Select))(await readBody(request))
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
        const query = Schema.decodeUnknownSync(Schema.fromJsonString(ProjectQuery))(
          url.searchParams.get("query") ?? "{}"
        )
        if (query.identifier !== undefined) observed.projectQueries.push(query.identifier)
        await options.onProjectRead?.(query.identifier)
        const projects = projectState.filter(
          (project) => query.identifier === undefined || project.identifier === query.identifier
        )
        response.end(
          Schema.encodeSync(Schema.fromJsonString(FindResult))({
            dataType: "TotalArray",
            value: projects,
            total: projects.length
          })
        )
      } else if (url.pathname === `/api/v1/tx/${WORKSPACE}` && request.method === "POST") {
        const tx = Schema.decodeUnknownSync(Schema.fromJsonString(ProjectUpdate))(await readBody(request))
        const target = projectState.find((project) => project._id === tx.objectId)
        if (target === undefined || tx.objectSpace !== target._id)
          throw new Error("Fixture write targeted another project")
        observed.projectWrites++
        projectState = projectState.map((project) =>
          project._id === tx.objectId ? { ...project, name: tx.operations.name } : project
        )
        observed.committedProjectWrites++
        await options.afterProjectWrite?.()
        response.end(Schema.encodeSync(Schema.fromJsonString(Schema.Struct({})))({}))
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
    projects: () => projectState,
    close: async () => {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    }
  }
}
