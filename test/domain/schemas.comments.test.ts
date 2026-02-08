import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { expect } from "vitest"
import {
  type AddCommentParams,
  addCommentParamsJsonSchema,
  type Comment,
  type DeleteCommentParams,
  deleteCommentParamsJsonSchema,
  type ListCommentsParams,
  listCommentsParamsJsonSchema,
  parseAddCommentParams,
  parseComment,
  parseDeleteCommentParams,
  parseListCommentsParams,
  parseUpdateCommentParams,
  type UpdateCommentParams,
  updateCommentParamsJsonSchema
} from "../../src/domain/schemas.js"

type JsonSchemaObject = {
  $schema?: string
  type?: string
  required?: Array<string>
  properties?: Record<string, { description?: string }>
}

describe("Comment Schemas", () => {
  describe("CommentSchema", () => {
    // test-revizorro: approved
    it.effect("parses minimal comment", () =>
      Effect.gen(function*() {
        const result = yield* parseComment({
          id: "comment-123",
          body: "This is a comment"
        })
        expect(result.id).toBe("comment-123")
        expect(result.body).toBe("This is a comment")
        expect(result.author).toBeUndefined()
        expect(result.authorId).toBeUndefined()
        expect(result.createdOn).toBeUndefined()
      }))

    // test-revizorro: approved
    it.effect("parses full comment with all fields", () =>
      Effect.gen(function*() {
        const result = yield* parseComment({
          id: "comment-456",
          body: "Full comment with **markdown**",
          author: "John Doe",
          authorId: "person-123",
          createdOn: 1706500000000,
          modifiedOn: 1706600000000,
          editedOn: 1706550000000
        })
        expect(result.id).toBe("comment-456")
        expect(result.body).toBe("Full comment with **markdown**")
        expect(result.author).toBe("John Doe")
        expect(result.authorId).toBe("person-123")
        expect(result.createdOn).toBe(1706500000000)
        expect(result.modifiedOn).toBe(1706600000000)
        expect(result.editedOn).toBe(1706550000000)
      }))

    // test-revizorro: approved
    it.effect("handles null editedOn", () =>
      Effect.gen(function*() {
        const result = yield* parseComment({
          id: "comment-789",
          body: "Never edited",
          editedOn: null
        })
        expect(result.editedOn).toBeNull()
      }))

    // test-revizorro: approved
    it.effect("accepts empty body", () =>
      Effect.gen(function*() {
        const result = yield* parseComment({
          id: "comment-empty",
          body: ""
        })
        expect(result.body).toBe("")
      }))

    // test-revizorro: approved
    it.effect("rejects missing id", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseComment({ body: "Comment without id" })
        )
        expect(error._tag).toBe("ParseError")
      }))

    // test-revizorro: approved
    it.effect("rejects empty id", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseComment({ id: "  ", body: "Comment" })
        )
        expect(error._tag).toBe("ParseError")
      }))

    // test-revizorro: scheduled
    it.effect("trims id whitespace", () =>
      Effect.gen(function*() {
        const result = yield* parseComment({
          id: "  comment-trimmed  ",
          body: "Trimmed ID"
        })
        expect(result.id).toBe("comment-trimmed")
      }))
  })

  describe("ListCommentsParamsSchema", () => {
    // test-revizorro: approved
    it.effect("parses minimal params", () =>
      Effect.gen(function*() {
        const result = yield* parseListCommentsParams({
          project: "HULY",
          issueIdentifier: "HULY-123"
        })
        expect(result.project).toBe("HULY")
        expect(result.issueIdentifier).toBe("HULY-123")
        expect(result.limit).toBeUndefined()
      }))

    // test-revizorro: approved
    it.effect("parses with limit", () =>
      Effect.gen(function*() {
        const result = yield* parseListCommentsParams({
          project: "TEST",
          issueIdentifier: "TEST-42",
          limit: 25
        })
        expect(result.project).toBe("TEST")
        expect(result.issueIdentifier).toBe("TEST-42")
        expect(result.limit).toBe(25)
      }))

    // test-revizorro: suspect | Only checks issueIdentifier, doesn't verify project or limit - incomplete validation
    it.effect("parses with numeric issue identifier", () =>
      Effect.gen(function*() {
        const result = yield* parseListCommentsParams({
          project: "PROJ",
          issueIdentifier: "456"
        })
        expect(result.issueIdentifier).toBe("456")
      }))

    // test-revizorro: approved
    it.effect("rejects empty project", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseListCommentsParams({
            project: "  ",
            issueIdentifier: "HULY-1"
          })
        )
        expect(error._tag).toBe("ParseError")
      }))

    // test-revizorro: approved
    it.effect("rejects empty issueIdentifier", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseListCommentsParams({
            project: "HULY",
            issueIdentifier: "   "
          })
        )
        expect(error._tag).toBe("ParseError")
      }))

    // test-revizorro: approved
    it.effect("rejects negative limit", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseListCommentsParams({
            project: "HULY",
            issueIdentifier: "HULY-1",
            limit: -1
          })
        )
        expect(error._tag).toBe("ParseError")
      }))

    // test-revizorro: scheduled
    it.effect("rejects non-integer limit", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseListCommentsParams({
            project: "HULY",
            issueIdentifier: "HULY-1",
            limit: 10.5
          })
        )
        expect(error._tag).toBe("ParseError")
      }))

    // test-revizorro: approved
    it.effect("rejects zero limit", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseListCommentsParams({
            project: "HULY",
            issueIdentifier: "HULY-1",
            limit: 0
          })
        )
        expect(error._tag).toBe("ParseError")
      }))

    // test-revizorro: approved
    it.effect("rejects limit over 200", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseListCommentsParams({
            project: "HULY",
            issueIdentifier: "HULY-1",
            limit: 201
          })
        )
        expect(error._tag).toBe("ParseError")
      }))

    // test-revizorro: approved
    it.effect("trims project whitespace", () =>
      Effect.gen(function*() {
        const result = yield* parseListCommentsParams({
          project: "  HULY  ",
          issueIdentifier: "HULY-1"
        })
        expect(result.project).toBe("HULY")
      }))
  })

  describe("AddCommentParamsSchema", () => {
    // test-revizorro: approved
    it.effect("parses valid params", () =>
      Effect.gen(function*() {
        const result = yield* parseAddCommentParams({
          project: "HULY",
          issueIdentifier: "HULY-123",
          body: "This is a new comment"
        })
        expect(result.project).toBe("HULY")
        expect(result.issueIdentifier).toBe("HULY-123")
        expect(result.body).toBe("This is a new comment")
      }))

    // test-revizorro: suspect | Only validates body substring, missing project/issueIdentifier assertions - incomplete test
    it.effect("parses with markdown body", () =>
      Effect.gen(function*() {
        const result = yield* parseAddCommentParams({
          project: "TEST",
          issueIdentifier: "TEST-1",
          body: "# Heading\n\n- Item 1\n- Item 2\n\n```js\nconsole.log('hello');\n```"
        })
        expect(result.body).toContain("# Heading")
        expect(result.body).toContain("console.log")
      }))

    // test-revizorro: approved
    it.effect("rejects empty body", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseAddCommentParams({
            project: "HULY",
            issueIdentifier: "HULY-1",
            body: "   "
          })
        )
        expect(error._tag).toBe("ParseError")
      }))

    // test-revizorro: approved
    it.effect("rejects missing body", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseAddCommentParams({
            project: "HULY",
            issueIdentifier: "HULY-1"
          })
        )
        expect(error._tag).toBe("ParseError")
      }))

    // test-revizorro: approved
    it.effect("rejects empty project", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseAddCommentParams({
            project: "  ",
            issueIdentifier: "HULY-1",
            body: "Comment"
          })
        )
        expect(error._tag).toBe("ParseError")
      }))

    // test-revizorro: approved
    it.effect("trims body whitespace", () =>
      Effect.gen(function*() {
        const result = yield* parseAddCommentParams({
          project: "HULY",
          issueIdentifier: "HULY-1",
          body: "  Comment with whitespace  "
        })
        expect(result.body).toBe("Comment with whitespace")
      }))
  })

  describe("UpdateCommentParamsSchema", () => {
    // test-revizorro: approved
    it.effect("parses valid params", () =>
      Effect.gen(function*() {
        const result = yield* parseUpdateCommentParams({
          project: "HULY",
          issueIdentifier: "HULY-123",
          commentId: "comment-456",
          body: "Updated comment body"
        })
        expect(result.project).toBe("HULY")
        expect(result.issueIdentifier).toBe("HULY-123")
        expect(result.commentId).toBe("comment-456")
        expect(result.body).toBe("Updated comment body")
      }))

    // test-revizorro: scheduled
    it.effect("rejects empty commentId", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseUpdateCommentParams({
            project: "HULY",
            issueIdentifier: "HULY-1",
            commentId: "   ",
            body: "Updated"
          })
        )
        expect(error._tag).toBe("ParseError")
      }))

    // test-revizorro: approved
    it.effect("rejects missing commentId", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseUpdateCommentParams({
            project: "HULY",
            issueIdentifier: "HULY-1",
            body: "Updated"
          })
        )
        expect(error._tag).toBe("ParseError")
      }))

    // test-revizorro: approved
    it.effect("rejects empty body", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseUpdateCommentParams({
            project: "HULY",
            issueIdentifier: "HULY-1",
            commentId: "comment-1",
            body: "  "
          })
        )
        expect(error._tag).toBe("ParseError")
      }))

    // test-revizorro: approved
    it.effect("trims all string fields", () =>
      Effect.gen(function*() {
        const result = yield* parseUpdateCommentParams({
          project: "  HULY  ",
          issueIdentifier: "  HULY-1  ",
          commentId: "  comment-123  ",
          body: "  Updated body  "
        })
        expect(result.project).toBe("HULY")
        expect(result.issueIdentifier).toBe("HULY-1")
        expect(result.commentId).toBe("comment-123")
        expect(result.body).toBe("Updated body")
      }))
  })

  describe("DeleteCommentParamsSchema", () => {
    // test-revizorro: approved
    it.effect("parses valid params", () =>
      Effect.gen(function*() {
        const result = yield* parseDeleteCommentParams({
          project: "HULY",
          issueIdentifier: "HULY-123",
          commentId: "comment-789"
        })
        expect(result.project).toBe("HULY")
        expect(result.issueIdentifier).toBe("HULY-123")
        expect(result.commentId).toBe("comment-789")
      }))

    // test-revizorro: approved
    it.effect("rejects missing commentId", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseDeleteCommentParams({
            project: "HULY",
            issueIdentifier: "HULY-1"
          })
        )
        expect(error._tag).toBe("ParseError")
      }))

    // test-revizorro: approved
    it.effect("rejects empty commentId", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseDeleteCommentParams({
            project: "HULY",
            issueIdentifier: "HULY-1",
            commentId: "   "
          })
        )
        expect(error._tag).toBe("ParseError")
      }))

    // test-revizorro: scheduled
    it.effect("trims all string fields", () =>
      Effect.gen(function*() {
        const result = yield* parseDeleteCommentParams({
          project: "  PROJ  ",
          issueIdentifier: "  PROJ-42  ",
          commentId: "  comment-xyz  "
        })
        expect(result.project).toBe("PROJ")
        expect(result.issueIdentifier).toBe("PROJ-42")
        expect(result.commentId).toBe("comment-xyz")
      }))
  })

  describe("JSON Schema Generation", () => {
    // test-revizorro: approved
    it.effect("generates JSON Schema for ListCommentsParams", () =>
      Effect.gen(function*() {
        const schema = listCommentsParamsJsonSchema as JsonSchemaObject
        expect(schema.$schema).toBe("http://json-schema.org/draft-07/schema#")
        expect(schema.type).toBe("object")
        expect(schema.required).toContain("project")
        expect(schema.required).toContain("issueIdentifier")
        expect(schema.properties).toHaveProperty("limit")
      }))

    // test-revizorro: approved
    it.effect("generates JSON Schema for AddCommentParams", () =>
      Effect.gen(function*() {
        const schema = addCommentParamsJsonSchema as JsonSchemaObject
        expect(schema.type).toBe("object")
        expect(schema.required).toContain("project")
        expect(schema.required).toContain("issueIdentifier")
        expect(schema.required).toContain("body")
      }))

    // test-revizorro: approved
    it.effect("generates JSON Schema for UpdateCommentParams", () =>
      Effect.gen(function*() {
        const schema = updateCommentParamsJsonSchema as JsonSchemaObject
        expect(schema.type).toBe("object")
        expect(schema.required).toContain("project")
        expect(schema.required).toContain("issueIdentifier")
        expect(schema.required).toContain("commentId")
        expect(schema.required).toContain("body")
      }))

    // test-revizorro: approved
    it.effect("generates JSON Schema for DeleteCommentParams", () =>
      Effect.gen(function*() {
        const schema = deleteCommentParamsJsonSchema as JsonSchemaObject
        expect(schema.type).toBe("object")
        expect(schema.required).toContain("project")
        expect(schema.required).toContain("issueIdentifier")
        expect(schema.required).toContain("commentId")
      }))

    // test-revizorro: approved
    it.effect("schemas have additionalProperties: false", () =>
      Effect.gen(function*() {
        const schemas = [
          listCommentsParamsJsonSchema,
          addCommentParamsJsonSchema,
          updateCommentParamsJsonSchema,
          deleteCommentParamsJsonSchema
        ] as Array<Record<string, unknown>>

        for (const schema of schemas) {
          expect(schema.additionalProperties).toBe(false)
        }
      }))

    // test-revizorro: approved
    it.effect("ListCommentsParams has property descriptions", () =>
      Effect.gen(function*() {
        const schema = listCommentsParamsJsonSchema as JsonSchemaObject
        expect(schema.properties.project.description).toBeDefined()
        expect(schema.properties.issueIdentifier.description).toBeDefined()
        expect(schema.properties.limit.description).toBeDefined()
      }))
  })

  describe("Type Extraction", () => {
    // test-revizorro: suspect | doesn't call parseComment, just tests TypeScript assignment; should validate schema parsing with parseComment() like line 31
    it.effect("Comment type is correctly extracted", () =>
      Effect.gen(function*() {
        const comment: Comment = {
          id: "comment-1",
          body: "Test comment"
        }
        expect(comment.id).toBe("comment-1")
      }))

    // test-revizorro: suspect | Doesn't call parser - just type checks and asserts trivial object property, no schema validation
    it.effect("ListCommentsParams type is correctly extracted", () =>
      Effect.gen(function*() {
        const params: ListCommentsParams = {
          project: "TEST",
          issueIdentifier: "TEST-1",
          limit: 50
        }
        expect(params.project).toBe("TEST")
      }))

    // test-revizorro: suspect | only tests TypeScript type assignment, doesn't validate schema parsing with parseAddCommentParams(); should call parseAddCommentParams() like line 31
    it.effect("AddCommentParams type is correctly extracted", () =>
      Effect.gen(function*() {
        const params: AddCommentParams = {
          project: "TEST",
          issueIdentifier: "TEST-1",
          body: "New comment"
        }
        expect(params.body).toBe("New comment")
      }))

    // test-revizorro: suspect | Only validates one field of type; should call parseUpdateCommentParams() and test all fields like line 316
    it.effect("UpdateCommentParams type is correctly extracted", () =>
      Effect.gen(function*() {
        const params: UpdateCommentParams = {
          project: "TEST",
          issueIdentifier: "TEST-1",
          commentId: "comment-1",
          body: "Updated"
        }
        expect(params.commentId).toBe("comment-1")
      }))

    // test-revizorro: suspect | Doesn't call parser - just type checks and asserts trivial object property, no schema validation
    it.effect("DeleteCommentParams type is correctly extracted", () =>
      Effect.gen(function*() {
        const params: DeleteCommentParams = {
          project: "TEST",
          issueIdentifier: "TEST-1",
          commentId: "comment-1"
        }
        expect(params.commentId).toBe("comment-1")
      }))
  })
})
