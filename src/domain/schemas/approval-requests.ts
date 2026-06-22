import { JSONSchema, Schema } from "effect"

import { optionalOutput } from "./output-helpers.js"
import {
  Count,
  DEFAULT_LIMIT,
  DocId,
  Email,
  LimitParam,
  ListTotal,
  MessageId,
  NonEmptyString,
  ObjectClassName,
  PersonId,
  PersonName,
  PositiveInteger,
  SpaceId,
  Timestamp,
  UrlString
} from "./shared.js"

const SdkOpenPayload = Schema.Unknown.annotations({
  description: "Raw SDK-owned approval transaction payload passed through without inventing a closed MCP-side schema."
})

const ApprovalRequestPersonIdentifier = NonEmptyString.annotations({
  description:
    "Person identifier for an approval participant. Prefer a raw Huly contact Person _id from read tools; exact email or exact display name are also accepted."
})

const ApprovalRequestBody = NonEmptyString.annotations({
  description: "Approval request comment body. Markdown is accepted and converted to Huly markup."
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

export const AddApprovalRequestParamsSchema = Schema.Struct({
  attachedTo: DocId.annotations({
    description: "Raw Huly target document _id that the approval request attaches to."
  }),
  attachedToClass: ObjectClassName.annotations({
    description: "Raw Huly target document class id, for example tracker:class:Issue."
  }),
  space: Schema.optional(SpaceId.annotations({
    description: "Raw Huly space id for the target document. Omit it to resolve the target document and use its space."
  })),
  collection: Schema.optional(ApprovalRequestCollection.annotations({
    description: "Parent collection name for the attached request. Defaults to requests."
  })),
  requested: Schema.Array(ApprovalRequestPersonIdentifier).pipe(Schema.minItems(1)).annotations({
    description: "People who must decide the approval. Duplicates are collapsed after resolution."
  }),
  requiredApprovesCount: Schema.optional(PositiveInteger.annotations({
    description: "Number of approvals required to complete the request. Defaults to the unique requested person count."
  })),
  tx: SdkOpenPayload.annotations({
    description:
      "Opaque Huly SDK transaction applied by Huly when the approval request completes. Pass a real SDK tx payload."
  }),
  rejectedTx: Schema.optional(SdkOpenPayload.annotations({
    description: "Optional opaque Huly SDK transaction applied by Huly when the approval request is rejected."
  }))
}).annotations({
  title: "AddApprovalRequestParams",
  description:
    "Create a generic @hcengineering/request Request attached to any Huly document. This tool intentionally accepts raw target ids because approval requests are cross-module."
})
export type AddApprovalRequestParams = Schema.Schema.Type<typeof AddApprovalRequestParamsSchema>

export const AddApprovalRequestCommentParamsSchema = Schema.Struct({
  request: ApprovalRequestId.annotations({
    description: "Approval Request document _id."
  }),
  body: ApprovalRequestBody
}).annotations({
  title: "AddApprovalRequestCommentParams",
  description: "Add a plain comment to an approval request."
})
export type AddApprovalRequestCommentParams = Schema.Schema.Type<typeof AddApprovalRequestCommentParamsSchema>

export const ApproveApprovalRequestParamsSchema = Schema.Struct({
  request: ApprovalRequestId.annotations({
    description: "Approval Request document _id."
  }),
  comment: Schema.optional(ApprovalRequestBody.annotations({
    description: "Optional decision comment to attach before approving."
  }))
}).annotations({
  title: "ApproveApprovalRequestParams",
  description: "Approve an active approval request as the current Huly actor."
})
export type ApproveApprovalRequestParams = Schema.Schema.Type<typeof ApproveApprovalRequestParamsSchema>

export const RejectApprovalRequestParamsSchema = Schema.Struct({
  request: ApprovalRequestId.annotations({
    description: "Approval Request document _id."
  }),
  comment: ApprovalRequestBody.annotations({
    description: "Required rejection decision comment."
  })
}).annotations({
  title: "RejectApprovalRequestParams",
  description: "Reject an active approval request as the current Huly actor."
})
export type RejectApprovalRequestParams = Schema.Schema.Type<typeof RejectApprovalRequestParamsSchema>

export const CancelApprovalRequestParamsSchema = Schema.Struct({
  request: ApprovalRequestId.annotations({
    description: "Approval Request document _id."
  })
}).annotations({
  title: "CancelApprovalRequestParams",
  description: "Cancel an active approval request created by the current Huly actor."
})
export type CancelApprovalRequestParams = Schema.Schema.Type<typeof CancelApprovalRequestParamsSchema>

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

export const ApprovalRequestMutationActionSchema = Schema.Literal(
  "created",
  "comment_added",
  "approved",
  "rejected",
  "cancelled"
).annotations({
  title: "ApprovalRequestMutationAction",
  description: "Lifecycle action performed by an approval request write tool."
})
export type ApprovalRequestMutationAction = Schema.Schema.Type<typeof ApprovalRequestMutationActionSchema>

const CreatedApprovalRequestMutationResultSchema = Schema.Struct({
  request: ApprovalRequestId,
  action: Schema.Literal("created"),
  changed: Schema.Literal(true),
  status: Schema.Literal("Active")
})

const CommentAddedApprovalRequestMutationResultSchema = Schema.Struct({
  request: ApprovalRequestId,
  action: Schema.Literal("comment_added"),
  changed: Schema.Literal(true),
  comment: MessageId
})

const ApprovedApprovalRequestMutationResultSchema = Schema.Union(
  Schema.Struct({
    request: ApprovalRequestId,
    action: Schema.Literal("approved"),
    changed: Schema.Literal(true),
    comment: optionalOutput(MessageId.annotations({
      description: "ChatMessage id when the approval call created an optional decision comment."
    }))
  }),
  Schema.Struct({
    request: ApprovalRequestId,
    action: Schema.Literal("approved"),
    changed: Schema.Literal(false),
    status: Schema.Literal("Active")
  })
)

const RejectedApprovalRequestMutationResultSchema = Schema.Struct({
  request: ApprovalRequestId,
  action: Schema.Literal("rejected"),
  changed: Schema.Literal(true),
  status: Schema.Literal("Rejected"),
  comment: MessageId
})

const CancelledApprovalRequestMutationResultSchema = Schema.Struct({
  request: ApprovalRequestId,
  action: Schema.Literal("cancelled"),
  changed: Schema.Literal(true),
  status: Schema.Literal("Cancelled")
})

export const ApprovalRequestMutationResultSchema = Schema.Union(
  CreatedApprovalRequestMutationResultSchema,
  CommentAddedApprovalRequestMutationResultSchema,
  ApprovedApprovalRequestMutationResultSchema,
  RejectedApprovalRequestMutationResultSchema,
  CancelledApprovalRequestMutationResultSchema
).annotations({
  title: "ApprovalRequestMutationResult",
  description:
    "Discriminated result from an approval request write. Call get_approval_request after Huly indexes the write when you need the fully refreshed document."
})
export type ApprovalRequestMutationResult = Schema.Schema.Type<typeof ApprovalRequestMutationResultSchema>

export const listApprovalRequestsParamsJsonSchema = JSONSchema.make(ListApprovalRequestsParamsSchema)
export const getApprovalRequestParamsJsonSchema = JSONSchema.make(GetApprovalRequestParamsSchema)
export const addApprovalRequestParamsJsonSchema = JSONSchema.make(AddApprovalRequestParamsSchema)
export const addApprovalRequestCommentParamsJsonSchema = JSONSchema.make(AddApprovalRequestCommentParamsSchema)
export const approveApprovalRequestParamsJsonSchema = JSONSchema.make(ApproveApprovalRequestParamsSchema)
export const rejectApprovalRequestParamsJsonSchema = JSONSchema.make(RejectApprovalRequestParamsSchema)
export const cancelApprovalRequestParamsJsonSchema = JSONSchema.make(CancelApprovalRequestParamsSchema)

export const parseListApprovalRequestsParams = Schema.decodeUnknown(ListApprovalRequestsParamsSchema)
export const parseGetApprovalRequestParams = Schema.decodeUnknown(GetApprovalRequestParamsSchema)
export const parseAddApprovalRequestParams = Schema.decodeUnknown(AddApprovalRequestParamsSchema)
export const parseAddApprovalRequestCommentParams = Schema.decodeUnknown(AddApprovalRequestCommentParamsSchema)
export const parseApproveApprovalRequestParams = Schema.decodeUnknown(ApproveApprovalRequestParamsSchema)
export const parseRejectApprovalRequestParams = Schema.decodeUnknown(RejectApprovalRequestParamsSchema)
export const parseCancelApprovalRequestParams = Schema.decodeUnknown(CancelApprovalRequestParamsSchema)
