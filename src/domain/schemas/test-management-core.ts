import { JSONSchema, Schema } from "effect"

import {
  assertUpdateFields,
  atLeastOneUpdateFieldMessage,
  DEFAULT_LIMIT,
  enumValuesDescription,
  hasAtLeastOneDefined,
  LimitParam,
  ListTotal,
  NonEmptyString,
  TestCaseId,
  TestCaseIdentifier,
  TestProjectId,
  TestProjectIdentifier,
  TestSuiteId,
  TestSuiteIdentifier,
  withAtLeastOneRequired
} from "./shared.js"

// --- Enum value arrays and schemas ---

export const TestCaseTypeValues = ["functional", "performance", "regression", "security", "smoke", "usability"] as const
export type TestCaseTypeStr = (typeof TestCaseTypeValues)[number]
export const DEFAULT_TEST_CASE_TYPE: TestCaseTypeStr = "functional"
export const TestCaseTypeSchema = Schema.Literal(...TestCaseTypeValues).annotations({
  description: `Test case type: ${enumValuesDescription(TestCaseTypeValues)}`
})

export const TestCasePriorityValues = ["low", "medium", "high", "urgent"] as const
export type TestCasePriorityStr = (typeof TestCasePriorityValues)[number]
export const DEFAULT_TEST_CASE_PRIORITY: TestCasePriorityStr = "medium"
export const TestCasePrioritySchema = Schema.Literal(...TestCasePriorityValues).annotations({
  description: `Test case priority: ${enumValuesDescription(TestCasePriorityValues)}`
})

export const TestCaseStatusValues = [
  "draft",
  "ready-for-review",
  "fix-review-comments",
  "approved",
  "rejected"
] as const
export type TestCaseStatusStr = (typeof TestCaseStatusValues)[number]
export const DEFAULT_TEST_CASE_STATUS: TestCaseStatusStr = "draft"
export const TestCaseStatusSchema = Schema.Literal(...TestCaseStatusValues).annotations({
  description: `Test case status: ${enumValuesDescription(TestCaseStatusValues)}`
})

export const TestRunStatusValues = ["untested", "blocked", "passed", "failed"] as const
export type TestRunStatusStr = (typeof TestRunStatusValues)[number]
export const TestRunStatusSchema = Schema.Literal(...TestRunStatusValues).annotations({
  description: `Test run result status: ${enumValuesDescription(TestRunStatusValues)}`
})
export const TestProjectSummarySchema = Schema.Struct({
  id: TestProjectId,
  name: Schema.String,
  description: Schema.optional(Schema.String),
  archived: Schema.Boolean
})
export type TestProjectSummary = Schema.Schema.Type<typeof TestProjectSummarySchema>
export const TestSuiteSummarySchema = Schema.Struct({
  id: TestSuiteId,
  name: Schema.String,
  description: Schema.optional(Schema.String),
  parent: Schema.optional(Schema.String)
})
export type TestSuiteSummary = Schema.Schema.Type<typeof TestSuiteSummarySchema>
export const TestCaseSummarySchema = Schema.Struct({
  id: TestCaseId,
  name: Schema.String,
  type: TestCaseTypeSchema,
  priority: TestCasePrioritySchema,
  status: TestCaseStatusSchema,
  assignee: Schema.optional(Schema.String)
})
export type TestCaseSummary = Schema.Schema.Type<typeof TestCaseSummarySchema>

// --- Params schemas ---

export const ListTestProjectsParamsSchema = Schema.Struct({
  limit: Schema.optional(
    LimitParam.annotations({
      description: `Maximum number of projects to return (default: ${DEFAULT_LIMIT})`
    })
  )
}).annotations({
  title: "ListTestProjectsParams",
  description: "Parameters for listing test management projects"
})

export type ListTestProjectsParams = Schema.Schema.Type<typeof ListTestProjectsParamsSchema>

export const ListTestSuitesParamsSchema = Schema.Struct({
  project: TestProjectIdentifier.annotations({
    description: "Test project ID or name"
  }),
  parent: Schema.optional(
    TestSuiteIdentifier.annotations({
      description: "Filter by parent suite ID or name. Only returns direct children of this suite."
    })
  ),
  limit: Schema.optional(
    LimitParam.annotations({
      description: `Maximum number of suites to return (default: ${DEFAULT_LIMIT})`
    })
  )
}).annotations({
  title: "ListTestSuitesParams",
  description: "Parameters for listing test suites in a project"
})

export type ListTestSuitesParams = Schema.Schema.Type<typeof ListTestSuitesParamsSchema>

export const GetTestSuiteParamsSchema = Schema.Struct({
  project: TestProjectIdentifier.annotations({
    description: "Test project ID or name"
  }),
  suite: TestSuiteIdentifier.annotations({
    description: "Test suite ID or name"
  })
}).annotations({
  title: "GetTestSuiteParams",
  description: "Parameters for getting a single test suite"
})

export type GetTestSuiteParams = Schema.Schema.Type<typeof GetTestSuiteParamsSchema>

export const CreateTestSuiteParamsSchema = Schema.Struct({
  project: TestProjectIdentifier.annotations({
    description: "Test project ID or name"
  }),
  name: NonEmptyString.annotations({
    description: "Suite name"
  }),
  description: Schema.optional(
    Schema.String.annotations({
      description: "Suite description"
    })
  ),
  parent: Schema.optional(
    TestSuiteIdentifier.annotations({
      description: "Parent suite ID or name for nesting"
    })
  )
}).annotations({
  title: "CreateTestSuiteParams",
  description:
    "Parameters for creating a test suite. Idempotent: returns existing suite if one with the same name exists in the project (created=false)."
})

export type CreateTestSuiteParams = Schema.Schema.Type<typeof CreateTestSuiteParamsSchema>

export const UPDATE_TEST_SUITE_FIELDS = ["name", "description"] as const satisfies ReadonlyArray<
  "name" | "description"
>

export const UpdateTestSuiteParamsSchema = Schema.Struct({
  project: TestProjectIdentifier.annotations({
    description: "Test project ID or name"
  }),
  suite: TestSuiteIdentifier.annotations({
    description: "Test suite ID or name to update"
  }),
  name: Schema.optional(
    NonEmptyString.annotations({
      description: "New suite name"
    })
  ),
  description: Schema.optional(
    Schema.NullOr(Schema.String).annotations({
      description: "New suite description (null to clear)"
    })
  )
}).pipe(
  Schema.filter((params) =>
    hasAtLeastOneDefined(params, UPDATE_TEST_SUITE_FIELDS)
      ? undefined
      : atLeastOneUpdateFieldMessage(UPDATE_TEST_SUITE_FIELDS)
  )
).annotations({
  title: "UpdateTestSuiteParams",
  description: `Parameters for updating a test suite. Only provided fields are modified. ${
    atLeastOneUpdateFieldMessage(UPDATE_TEST_SUITE_FIELDS)
  }`
})

export type UpdateTestSuiteParams = Schema.Schema.Type<typeof UpdateTestSuiteParamsSchema>
assertUpdateFields<UpdateTestSuiteParams>()(["project", "suite"], UPDATE_TEST_SUITE_FIELDS)

export const DeleteTestSuiteParamsSchema = Schema.Struct({
  project: TestProjectIdentifier.annotations({
    description: "Test project ID or name"
  }),
  suite: TestSuiteIdentifier.annotations({
    description: "Test suite ID or name to delete"
  })
}).annotations({
  title: "DeleteTestSuiteParams",
  description: "Parameters for deleting a test suite"
})

export type DeleteTestSuiteParams = Schema.Schema.Type<typeof DeleteTestSuiteParamsSchema>

export const ListTestCasesParamsSchema = Schema.Struct({
  project: TestProjectIdentifier.annotations({
    description: "Test project ID or name"
  }),
  suite: Schema.optional(
    TestSuiteIdentifier.annotations({
      description: "Filter by suite ID or name"
    })
  ),
  assignee: Schema.optional(
    NonEmptyString.annotations({
      description: "Filter by assignee name or email"
    })
  ),
  limit: Schema.optional(
    LimitParam.annotations({
      description: `Maximum number of test cases to return (default: ${DEFAULT_LIMIT})`
    })
  )
}).annotations({
  title: "ListTestCasesParams",
  description: "Parameters for listing test cases in a project"
})

export type ListTestCasesParams = Schema.Schema.Type<typeof ListTestCasesParamsSchema>

export const GetTestCaseParamsSchema = Schema.Struct({
  project: TestProjectIdentifier.annotations({
    description: "Test project ID or name"
  }),
  testCase: TestCaseIdentifier.annotations({
    description: "Test case ID or name"
  })
}).annotations({
  title: "GetTestCaseParams",
  description: "Parameters for getting a single test case"
})

export type GetTestCaseParams = Schema.Schema.Type<typeof GetTestCaseParamsSchema>

export const CreateTestCaseParamsSchema = Schema.Struct({
  project: TestProjectIdentifier.annotations({
    description: "Test project ID or name"
  }),
  suite: TestSuiteIdentifier.annotations({
    description: "Suite ID or name to attach the test case to"
  }),
  name: NonEmptyString.annotations({
    description: "Test case name"
  }),
  description: Schema.optional(
    Schema.String.annotations({
      description: "Test case description"
    })
  ),
  type: Schema.optional(
    TestCaseTypeSchema.annotations({
      description: `Test case type (default: ${DEFAULT_TEST_CASE_TYPE})`
    })
  ),
  priority: Schema.optional(
    TestCasePrioritySchema.annotations({
      description: `Test case priority (default: ${DEFAULT_TEST_CASE_PRIORITY})`
    })
  ),
  status: Schema.optional(
    TestCaseStatusSchema.annotations({
      description: `Test case status (default: ${DEFAULT_TEST_CASE_STATUS})`
    })
  ),
  assignee: Schema.optional(
    NonEmptyString.annotations({
      description: "Assignee name or email"
    })
  )
}).annotations({
  title: "CreateTestCaseParams",
  description: "Parameters for creating a test case attached to a suite"
})

export type CreateTestCaseParams = Schema.Schema.Type<typeof CreateTestCaseParamsSchema>

export const UPDATE_TEST_CASE_FIELDS = [
  "name",
  "description",
  "type",
  "priority",
  "status",
  "assignee"
] as const satisfies ReadonlyArray<"name" | "description" | "type" | "priority" | "status" | "assignee">

export const UpdateTestCaseParamsSchema = Schema.Struct({
  project: TestProjectIdentifier.annotations({
    description: "Test project ID or name"
  }),
  testCase: TestCaseIdentifier.annotations({
    description: "Test case ID or name to update"
  }),
  name: Schema.optional(
    NonEmptyString.annotations({
      description: "New test case name"
    })
  ),
  description: Schema.optional(
    Schema.NullOr(Schema.String).annotations({
      description: "New description (null to clear)"
    })
  ),
  type: Schema.optional(
    TestCaseTypeSchema.annotations({
      description: "New test case type"
    })
  ),
  priority: Schema.optional(
    TestCasePrioritySchema.annotations({
      description: "New priority"
    })
  ),
  status: Schema.optional(
    TestCaseStatusSchema.annotations({
      description: "New status"
    })
  ),
  assignee: Schema.optional(
    Schema.NullOr(NonEmptyString).annotations({
      description: "New assignee name or email (null to unassign)"
    })
  )
}).pipe(
  Schema.filter((params) =>
    hasAtLeastOneDefined(params, UPDATE_TEST_CASE_FIELDS)
      ? undefined
      : atLeastOneUpdateFieldMessage(UPDATE_TEST_CASE_FIELDS)
  )
).annotations({
  title: "UpdateTestCaseParams",
  description: `Parameters for updating a test case. Only provided fields are modified. ${
    atLeastOneUpdateFieldMessage(UPDATE_TEST_CASE_FIELDS)
  }`
})

export type UpdateTestCaseParams = Schema.Schema.Type<typeof UpdateTestCaseParamsSchema>
assertUpdateFields<UpdateTestCaseParams>()(["project", "testCase"], UPDATE_TEST_CASE_FIELDS)

export const DeleteTestCaseParamsSchema = Schema.Struct({
  project: TestProjectIdentifier.annotations({
    description: "Test project ID or name"
  }),
  testCase: TestCaseIdentifier.annotations({
    description: "Test case ID or name to delete"
  })
}).annotations({
  title: "DeleteTestCaseParams",
  description: "Parameters for deleting a test case"
})

export type DeleteTestCaseParams = Schema.Schema.Type<typeof DeleteTestCaseParamsSchema>

// --- JSON schemas ---

export const listTestProjectsParamsJsonSchema = JSONSchema.make(ListTestProjectsParamsSchema)
export const listTestSuitesParamsJsonSchema = JSONSchema.make(ListTestSuitesParamsSchema)
export const getTestSuiteParamsJsonSchema = JSONSchema.make(GetTestSuiteParamsSchema)
export const createTestSuiteParamsJsonSchema = JSONSchema.make(CreateTestSuiteParamsSchema)
export const updateTestSuiteParamsJsonSchema = withAtLeastOneRequired(
  JSONSchema.make(UpdateTestSuiteParamsSchema),
  UPDATE_TEST_SUITE_FIELDS
)
export const deleteTestSuiteParamsJsonSchema = JSONSchema.make(DeleteTestSuiteParamsSchema)
export const listTestCasesParamsJsonSchema = JSONSchema.make(ListTestCasesParamsSchema)
export const getTestCaseParamsJsonSchema = JSONSchema.make(GetTestCaseParamsSchema)
export const createTestCaseParamsJsonSchema = JSONSchema.make(CreateTestCaseParamsSchema)
export const updateTestCaseParamsJsonSchema = withAtLeastOneRequired(
  JSONSchema.make(UpdateTestCaseParamsSchema),
  UPDATE_TEST_CASE_FIELDS
)
export const deleteTestCaseParamsJsonSchema = JSONSchema.make(DeleteTestCaseParamsSchema)

// --- Parse functions ---

export const parseListTestProjectsParams = Schema.decodeUnknown(ListTestProjectsParamsSchema)
export const parseListTestSuitesParams = Schema.decodeUnknown(ListTestSuitesParamsSchema)
export const parseGetTestSuiteParams = Schema.decodeUnknown(GetTestSuiteParamsSchema)
export const parseCreateTestSuiteParams = Schema.decodeUnknown(CreateTestSuiteParamsSchema)
export const parseUpdateTestSuiteParams = Schema.decodeUnknown(UpdateTestSuiteParamsSchema)
export const parseDeleteTestSuiteParams = Schema.decodeUnknown(DeleteTestSuiteParamsSchema)
export const parseListTestCasesParams = Schema.decodeUnknown(ListTestCasesParamsSchema)
export const parseGetTestCaseParams = Schema.decodeUnknown(GetTestCaseParamsSchema)
export const parseCreateTestCaseParams = Schema.decodeUnknown(CreateTestCaseParamsSchema)
export const parseUpdateTestCaseParams = Schema.decodeUnknown(UpdateTestCaseParamsSchema)
export const parseDeleteTestCaseParams = Schema.decodeUnknown(DeleteTestCaseParamsSchema)
export const ListTestProjectsResultSchema = Schema.Struct({
  projects: Schema.Array(TestProjectSummarySchema),
  total: ListTotal
})
export type ListTestProjectsResult = Schema.Schema.Type<typeof ListTestProjectsResultSchema>
export const ListTestSuitesResultSchema = Schema.Struct({
  suites: Schema.Array(TestSuiteSummarySchema),
  total: ListTotal
})
export type ListTestSuitesResult = Schema.Schema.Type<typeof ListTestSuitesResultSchema>
export const GetTestSuiteResultSchema = Schema.Struct({
  ...TestSuiteSummarySchema.fields,
  testCases: ListTotal
})
export type GetTestSuiteResult = Schema.Schema.Type<typeof GetTestSuiteResultSchema>
export const CreateTestSuiteResultSchema = Schema.Struct({
  id: TestSuiteId,
  name: Schema.String,
  created: Schema.Boolean
})
export type CreateTestSuiteResult = Schema.Schema.Type<typeof CreateTestSuiteResultSchema>
export const UpdateTestSuiteResultSchema = Schema.Struct({
  id: TestSuiteId,
  updated: Schema.Boolean
})
export type UpdateTestSuiteResult = Schema.Schema.Type<typeof UpdateTestSuiteResultSchema>
export const DeleteTestSuiteResultSchema = Schema.Struct({
  id: TestSuiteId,
  deleted: Schema.Boolean
})
export type DeleteTestSuiteResult = Schema.Schema.Type<typeof DeleteTestSuiteResultSchema>
export const ListTestCasesResultSchema = Schema.Struct({
  testCases: Schema.Array(TestCaseSummarySchema),
  total: ListTotal
})
export type ListTestCasesResult = Schema.Schema.Type<typeof ListTestCasesResultSchema>
export const GetTestCaseResultSchema = Schema.Struct({
  ...TestCaseSummarySchema.fields,
  description: Schema.optional(Schema.String),
  suite: Schema.optional(Schema.String)
})
export type GetTestCaseResult = Schema.Schema.Type<typeof GetTestCaseResultSchema>
export const CreateTestCaseResultSchema = Schema.Struct({
  id: TestCaseId,
  name: Schema.String,
  created: Schema.Boolean
})
export type CreateTestCaseResult = Schema.Schema.Type<typeof CreateTestCaseResultSchema>
export const UpdateTestCaseResultSchema = Schema.Struct({
  id: TestCaseId,
  updated: Schema.Boolean
})
export type UpdateTestCaseResult = Schema.Schema.Type<typeof UpdateTestCaseResultSchema>
export const DeleteTestCaseResultSchema = Schema.Struct({
  id: TestCaseId,
  deleted: Schema.Boolean
})
export type DeleteTestCaseResult = Schema.Schema.Type<typeof DeleteTestCaseResultSchema>
