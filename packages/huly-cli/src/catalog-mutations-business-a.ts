import type { McpToolName } from "../../../src/mcp/tools/index.js"
import type { CliCommandSpec } from "./catalog-types.js"

export const businessMutationCliCommandCatalogA = {
  add_drive_file_comment: {
    path: ["drive", "files", "comments", "add"],
    positional: ["drive", "body"],
    description: "Add Drive File Comment",
    behavior: {
      fileInput: { fields: ["body"] }
    }
  },
  add_inventory_product_comment: {
    path: ["inventory", "product", "comment", "add"],
    positional: ["product", "body"],
    description: "Add Inventory Product Comment",
    behavior: {
      fileInput: { fields: ["body"] }
    }
  },
  add_recruiting_candidate_skill: {
    path: ["recruiting", "candidate", "skill", "add"],
    positional: ["candidate", "skill"],
    description: "Add Recruiting Candidate Skill"
  },
  add_recruiting_comment: {
    path: ["recruiting", "comment", "add"],
    positional: ["target", "body"],
    description: "Add Recruiting Comment",
    behavior: {
      fileInput: { fields: ["body"] }
    }
  },
  add_recruiting_related_issue: {
    path: ["recruiting", "related", "issue", "add"],
    positional: ["target", "issue"],
    description: "Add Recruiting Related Issue"
  },
  add_test_plan_item: {
    path: ["tests", "plan", "item", "add"],
    positional: ["project", "plan", "testCase"],
    description: "Add Test Plan Item"
  },
  archive_recruiting_vacancy: {
    path: ["recruiting", "vacancy", "archive"],
    positional: ["vacancy"],
    description: "Archive Recruiting Vacancy"
  },
  complete_todo: {
    path: ["planner", "todos", "complete"],
    positional: ["locator"],
    description: "Complete Todo"
  },
  create_card: {
    path: ["cards", "create"],
    positional: ["cardSpace", "type", "title"],
    description: "Create Card",
    behavior: {
      fileInput: { fields: ["content"] }
    }
  },
  create_drive: {
    path: ["drive", "create"],
    positional: ["name"],
    description: "Create Drive",
    behavior: {
      fileInput: { fields: ["description"] }
    }
  },
  create_drive_folder: {
    path: ["drive", "folders", "create"],
    positional: ["drive", "path"],
    description: "Create Drive Folder"
  },
  create_inventory_category: {
    path: ["inventory", "category", "create"],
    positional: ["name"],
    description: "Create Inventory Category"
  },
  create_inventory_product: {
    path: ["inventory", "product", "create"],
    positional: ["name", "category"],
    description: "Create Inventory Product"
  },
  create_inventory_variant: {
    path: ["inventory", "variant", "create"],
    positional: ["product", "name", "sku"],
    description: "Create Inventory Variant"
  },
  create_recruiting_applicant: {
    path: ["recruiting", "applicant", "create"],
    positional: ["vacancy", "candidate"],
    description: "Create Recruiting Applicant"
  },
  create_recruiting_opinion: {
    path: ["recruiting", "opinion", "create"],
    positional: ["review", "value"],
    description: "Create Recruiting Opinion",
    behavior: {
      fileInput: { fields: ["description"] }
    }
  },
  create_recruiting_review: {
    path: ["recruiting", "review", "create"],
    positional: ["candidate", "title", "date"],
    description: "Create Recruiting Review",
    behavior: {
      fileInput: { fields: ["description"] }
    }
  },
  create_recruiting_vacancy: {
    path: ["recruiting", "vacancy", "create"],
    positional: ["name"],
    description: "Create Recruiting Vacancy",
    behavior: {
      fileInput: { fields: ["shortDescription", "fullDescription"] }
    }
  },
  create_test_case: {
    path: ["tests", "case", "create"],
    positional: ["project", "suite", "name"],
    description: "Create Test Case",
    behavior: {
      fileInput: { fields: ["description"] }
    }
  },
  create_test_plan: {
    path: ["tests", "plan", "create"],
    positional: ["project", "name"],
    description: "Create Test Plan",
    behavior: {
      fileInput: { fields: ["description"] }
    }
  },
  create_test_result: {
    path: ["tests", "result", "create"],
    positional: ["project", "run", "testCase"],
    description: "Create Test Result"
  },
  create_test_run: {
    path: ["tests", "run", "create"],
    positional: ["project", "name"],
    description: "Create Test Run",
    behavior: {
      fileInput: { fields: ["description"] }
    }
  },
  create_test_suite: {
    path: ["tests", "suite", "create"],
    positional: ["project", "name"],
    description: "Create Test Suite",
    behavior: {
      fileInput: { fields: ["description"] }
    }
  },
  create_todo: {
    path: ["planner", "todos", "create"],
    positional: ["title"],
    description: "Create Todo",
    behavior: {
      fileInput: { fields: ["description"] }
    }
  },
  delete_card: {
    path: ["cards", "delete"],
    positional: ["cardSpace", "card"],
    description: "Delete Card",
    behavior: {
      confirmation: {
        type: "requires-yes",
        message: "cards delete requires --yes."
      }
    }
  },
  delete_drive: {
    path: ["drive", "delete"],
    positional: ["drive"],
    description: "Delete Drive",
    behavior: {
      confirmation: {
        type: "requires-yes",
        message: "drive delete requires --yes."
      }
    }
  },
  delete_drive_file_comment: {
    path: ["drive", "files", "comments", "delete"],
    positional: ["drive", "commentId"],
    description: "Delete Drive File Comment",
    behavior: {
      confirmation: {
        type: "requires-yes",
        message: "drive files comments delete requires --yes."
      }
    }
  },
  delete_drive_item: {
    path: ["drive", "items", "delete"],
    positional: ["drive"],
    description: "Delete Drive Item",
    behavior: {
      confirmation: {
        type: "requires-yes",
        message: "drive items delete requires --yes."
      }
    }
  },
  delete_event: {
    path: ["calendar", "events", "delete"],
    positional: ["eventId"],
    description: "Delete Event",
    behavior: {
      confirmation: {
        type: "requires-yes",
        message: "calendar events delete requires --yes."
      }
    }
  },
  delete_inventory_category: {
    path: ["inventory", "category", "delete"],
    positional: ["category"],
    description: "Delete Inventory Category",
    behavior: {
      confirmation: {
        type: "requires-yes",
        message: "inventory category delete requires --yes."
      }
    }
  },
  delete_inventory_product: {
    path: ["inventory", "product", "delete"],
    positional: ["product"],
    description: "Delete Inventory Product",
    behavior: {
      confirmation: {
        type: "requires-yes",
        message: "inventory product delete requires --yes."
      }
    }
  },
  delete_inventory_product_attachment: {
    path: ["inventory", "product", "attachment", "delete"],
    positional: ["product", "attachmentId"],
    description: "Delete Inventory Product Attachment",
    behavior: {
      confirmation: {
        type: "requires-yes",
        message: "inventory product attachment delete requires --yes."
      }
    }
  },
  delete_inventory_product_comment: {
    path: ["inventory", "product", "comment", "delete"],
    positional: ["product", "commentId"],
    description: "Delete Inventory Product Comment",
    behavior: {
      confirmation: {
        type: "requires-yes",
        message: "inventory product comment delete requires --yes."
      }
    }
  },
  delete_inventory_product_photo: {
    path: ["inventory", "product", "photo", "delete"],
    positional: ["product", "photoId"],
    description: "Delete Inventory Product Photo",
    behavior: {
      confirmation: {
        type: "requires-yes",
        message: "inventory product photo delete requires --yes."
      }
    }
  },
  delete_inventory_variant: {
    path: ["inventory", "variant", "delete"],
    positional: ["variant"],
    description: "Delete Inventory Variant",
    behavior: {
      confirmation: {
        type: "requires-yes",
        message: "inventory variant delete requires --yes."
      }
    }
  },
  delete_recruiting_applicant: {
    path: ["recruiting", "applicant", "delete"],
    positional: ["applicant"],
    description: "Delete Recruiting Applicant",
    behavior: {
      confirmation: {
        type: "requires-yes",
        message: "recruiting applicant delete requires --yes."
      }
    }
  },
  delete_recruiting_attachment: {
    path: ["recruiting", "attachment", "delete"],
    positional: ["target", "attachmentId"],
    description: "Delete Recruiting Attachment",
    behavior: {
      confirmation: {
        type: "requires-yes",
        message: "recruiting attachment delete requires --yes."
      }
    }
  },
  delete_recruiting_comment: {
    path: ["recruiting", "comment", "delete"],
    positional: ["target", "commentId"],
    description: "Delete Recruiting Comment",
    behavior: {
      confirmation: {
        type: "requires-yes",
        message: "recruiting comment delete requires --yes."
      }
    }
  },
  delete_recruiting_opinion: {
    path: ["recruiting", "opinion", "delete"],
    positional: ["opinion"],
    description: "Delete Recruiting Opinion",
    behavior: {
      confirmation: {
        type: "requires-yes",
        message: "recruiting opinion delete requires --yes."
      }
    }
  },
  delete_recruiting_review: {
    path: ["recruiting", "review", "delete"],
    positional: ["review"],
    description: "Delete Recruiting Review",
    behavior: {
      confirmation: {
        type: "requires-yes",
        message: "recruiting review delete requires --yes."
      }
    }
  },
  delete_schedule: {
    path: ["calendar", "schedules", "delete"],
    positional: ["scheduleId"],
    description: "Delete Schedule",
    behavior: {
      confirmation: {
        type: "requires-yes",
        message: "calendar schedules delete requires --yes."
      }
    }
  },
  delete_test_case: {
    path: ["tests", "case", "delete"],
    positional: ["project", "testCase"],
    description: "Delete Test Case",
    behavior: {
      confirmation: {
        type: "requires-yes",
        message: "tests case delete requires --yes."
      }
    }
  }
} as const satisfies Partial<Record<McpToolName, CliCommandSpec>>
