import { JSONSchema, Schema } from "effect"

import { optionalOutput } from "./output-helpers.js"
import {
  Count,
  DEFAULT_LIMIT,
  DocId,
  Email,
  LimitParam,
  ListTotal,
  NonEmptyString,
  ObjectClassName,
  PersonId,
  PersonName,
  SpaceId,
  Timestamp,
  UrlString
} from "./shared.js"

const SdkOpenPayload = Schema.Unknown.annotations({
  description: "Raw SDK-owned approval transaction payload passed through without inventing a closed MCP-side schema."
})

export const ApprovalRequestId = DocId.pipe(Schema.brand("ApprovalRequestId")).annotations({
  identifier: "ApprovalRequestId",
  title: "ApprovalRequestId",
  description: "Raw Huly Request document _id."
})
export type ApprovalRequestId = Schema.Schema.Type<typeof ApprovalRequestId>

export const ApprovalRequestCollection = NonEmptyString.pipe(Schema.brand("ApprovalRequestCollection")).annotations({
  identifier: "ApprovalRequestCollection",
  title: "ApprovalRequestCollection",
  description: "Parent collection name stored in Request.collection."
})
export type ApprovalRequestCollection = Schema.Schema.Type<typeof ApprovalRequestCollection>

export const ApprovalRequestStatusSchema = Schema.Literal(
  "Active",
  "Completed",
  "Rejected",
  "Cancelled"
).annotations({
  title: "ApprovalRequestStatus",
  description: "Generic approval request status from @hcengineering/request."
})
export type ApprovalRequestStatus = Schema.Schema.Type<typeof ApprovalRequestStatusSchema>

export const ApprovalPersonRefSchema = Schema.Struct({
  id: PersonId.annotations({
    description: "Raw Huly contact Person _id referenced by the approval request."
  }),
  name: optionalOutput(PersonName),
  email: optionalOutput(Email.annotations({
    description: "Best email channel found for the person, if resolvable and email-shaped."
  })),
  url: optionalOutput(UrlString)
}).annotations({
  title: "ApprovalPersonRef",
  description:
    "Person referenced by a generic approval request. When contact metadata cannot be resolved, only id is returned."
})
export type ApprovalPersonRef = Schema.Schema.Type<typeof ApprovalPersonRefSchema>

export const ListApprovalRequestsParamsSchema = Schema.Struct({
  status: Schema.optional(ApprovalRequestStatusSchema.annotations({
    description: "Optional approval request status filter."
  })),
  attachedTo: Schema.optional(DocId.annotations({
    description:
      "Optional raw Huly document _id from Request.attachedTo. Use this when you already know the target document id."
  })),
  attachedToClass: Schema.optional(ObjectClassName.annotations({
    description:
      "Optional raw Huly class id from Request.attachedToClass, for example tracker:class:Issue. Use with attachedTo when possible."
  })),
  limit: Schema.optional(LimitParam.annotations({
    description: `Maximum number of approval requests to return (default: ${DEFAULT_LIMIT}).`
  }))
}).annotations({
  title: "ListApprovalRequestsParams",
  description:
    "Read-only discovery for generic @hcengineering/request Request documents. Filters accept raw Huly ids because approval requests can attach to many document classes."
})
export type ListApprovalRequestsParams = Schema.Schema.Type<typeof ListApprovalRequestsParamsSchema>

export const GetApprovalRequestParamsSchema = Schema.Struct({
  request: ApprovalRequestId.annotations({
    description: "Approval Request document _id."
  })
}).annotations({
  title: "GetApprovalRequestParams",
  description: "Read one generic approval Request document by _id."
})
export type GetApprovalRequestParams = Schema.Schema.Type<typeof GetApprovalRequestParamsSchema>

export const ApprovalRequestSummarySchema = Schema.Struct({
  id: ApprovalRequestId,
  class: ObjectClassName.annotations({
    description: "Raw Huly class id for the returned Request document."
  }),
  status: ApprovalRequestStatusSchema,
  attachedTo: DocId.annotations({
    description: "Raw Huly document _id stored in Request.attachedTo."
  }),
  attachedToClass: ObjectClassName.annotations({
    description: "Raw Huly class id stored in Request.attachedToClass."
  }),
  collection: ApprovalRequestCollection,
  space: SpaceId.annotations({
    description: "Raw Huly space id stored in Request.space."
  }),
  requiredApprovesCount: Count.annotations({
    description: "Number of approvals required to complete the request."
  }),
  requested: Schema.Array(ApprovalPersonRefSchema),
  approved: Schema.Array(ApprovalPersonRefSchema),
  rejected: optionalOutput(ApprovalPersonRefSchema),
  comments: optionalOutput(Count),
  createdOn: optionalOutput(Timestamp),
  modifiedOn: Timestamp
}).annotations({
  title: "ApprovalRequestSummary",
  description: "Read-only summary of a generic approval Request document."
})
export type ApprovalRequestSummary = Schema.Schema.Type<typeof ApprovalRequestSummarySchema>

export const ApprovalRequestDetailSchema = Schema.extend(
  ApprovalRequestSummarySchema,
  Schema.Struct({
    approvedDates: optionalOutput(
      Schema.Array(Timestamp).annotations({
        description: "Approval timestamps from Request.approvedDates, aligned with approved people when present."
      })
    ),
    tx: SdkOpenPayload.annotations({
      description: "Raw SDK transaction payload that the approval request refers to."
    }),
    rejectedTx: optionalOutput(SdkOpenPayload.annotations({
      description: "Raw SDK rejection transaction payload, when present."
    }))
  })
).annotations({
  title: "ApprovalRequestDetail",
  description: "Detailed generic approval Request document with opaque SDK transaction payloads."
})
export type ApprovalRequestDetail = Schema.Schema.Type<typeof ApprovalRequestDetailSchema>

export const ListApprovalRequestsResultSchema = Schema.Struct({
  requests: Schema.Array(ApprovalRequestSummarySchema),
  total: ListTotal
})
export type ListApprovalRequestsResult = Schema.Schema.Type<typeof ListApprovalRequestsResultSchema>

export const GetApprovalRequestResultSchema = ApprovalRequestDetailSchema
export type GetApprovalRequestResult = Schema.Schema.Type<typeof GetApprovalRequestResultSchema>

export const listApprovalRequestsParamsJsonSchema = JSONSchema.make(ListApprovalRequestsParamsSchema)
export const getApprovalRequestParamsJsonSchema = JSONSchema.make(GetApprovalRequestParamsSchema)

export const parseListApprovalRequestsParams = Schema.decodeUnknown(ListApprovalRequestsParamsSchema)
export const parseGetApprovalRequestParams = Schema.decodeUnknown(GetApprovalRequestParamsSchema)
