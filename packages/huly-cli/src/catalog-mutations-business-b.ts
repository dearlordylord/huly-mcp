import type { McpToolName } from "../../../src/mcp/tools/index.js"
import type { CliCommandSpec } from "./catalog-types.js"

export const businessMutationCliCommandCatalogB = {
  delete_test_plan: {
    path: ["tests", "plan", "delete"],
    positional: ["project", "plan"],
    description: "Delete Test Plan",
    behavior: {
      confirmation: {
        type: "requires-yes",
        message: "tests plan delete requires --yes."
      }
    }
  },
  delete_test_result: {
    path: ["tests", "result", "delete"],
    positional: ["project", "result"],
    description: "Delete Test Result",
    behavior: {
      confirmation: {
        type: "requires-yes",
        message: "tests result delete requires --yes."
      }
    }
  },
  delete_test_run: {
    path: ["tests", "run", "delete"],
    positional: ["project", "run"],
    description: "Delete Test Run",
    behavior: {
      confirmation: {
        type: "requires-yes",
        message: "tests run delete requires --yes."
      }
    }
  },
  delete_test_suite: {
    path: ["tests", "suite", "delete"],
    positional: ["project", "suite"],
    description: "Delete Test Suite",
    behavior: {
      confirmation: {
        type: "requires-yes",
        message: "tests suite delete requires --yes."
      }
    }
  },
  delete_todo: {
    path: ["planner", "todos", "delete"],
    positional: ["locator"],
    description: "Delete Todo",
    behavior: {
      confirmation: {
        type: "requires-yes",
        message: "planner todos delete requires --yes."
      }
    }
  },
  move_drive_item: {
    path: ["drive", "items", "move"],
    positional: ["drive", "targetFolderPath"],
    description: "Move Drive Item"
  },
  remove_recruiting_candidate_skill: {
    path: ["recruiting", "candidate", "skill", "remove"],
    positional: ["candidate", "skill"],
    description: "Remove Recruiting Candidate Skill",
    behavior: {
      confirmation: {
        type: "requires-yes",
        message: "recruiting candidate skill remove requires --yes."
      }
    }
  },
  remove_recruiting_related_issue: {
    path: ["recruiting", "related", "issue", "remove"],
    positional: ["target", "issue"],
    description: "Remove Recruiting Related Issue",
    behavior: {
      confirmation: {
        type: "requires-yes",
        message: "recruiting related issue remove requires --yes."
      }
    }
  },
  remove_test_plan_item: {
    path: ["tests", "plan", "item", "remove"],
    positional: ["project", "plan", "item"],
    description: "Remove Test Plan Item",
    behavior: {
      confirmation: {
        type: "requires-yes",
        message: "tests plan item remove requires --yes."
      }
    }
  },
  rename_drive_item: {
    path: ["drive", "items", "rename"],
    positional: ["drive", "title"],
    description: "Rename Drive Item"
  },
  reopen_todo: {
    path: ["planner", "todos", "reopen"],
    positional: ["locator"],
    description: "Reopen Todo"
  },
  restore_drive_file_version: {
    path: ["drive", "files", "versions", "restore"],
    positional: ["drive", "file", "version"],
    description: "Restore Drive File Version"
  },
  run_test_plan: {
    path: ["tests", "plan", "run"],
    positional: ["project", "plan"],
    description: "Run Test Plan"
  },
  schedule_todo: {
    path: ["planner", "todos", "schedule"],
    positional: ["locator", "date", "dueDate"],
    description: "Schedule Todo"
  },
  set_recruiting_candidate_profile: {
    path: ["recruiting", "candidate", "profile", "set"],
    positional: ["candidate"],
    description: "Set Recruiting Candidate Profile"
  },
  unarchive_recruiting_vacancy: {
    path: ["recruiting", "vacancy", "unarchive"],
    positional: ["vacancy"],
    description: "Unarchive Recruiting Vacancy"
  },
  unschedule_todo: {
    path: ["planner", "todos", "unschedule"],
    positional: [],
    description: "Unschedule Todo"
  },
  update_card: {
    path: ["cards", "update"],
    positional: ["cardSpace", "card"],
    description: "Update Card",
    behavior: {
      fileInput: { fields: ["content"] }
    }
  },
  update_drive: {
    path: ["drive", "update"],
    positional: ["drive"],
    description: "Update Drive",
    behavior: {
      fileInput: { fields: ["description"] }
    }
  },
  update_drive_file_comment: {
    path: ["drive", "files", "comments", "update"],
    positional: ["drive", "commentId", "body"],
    description: "Update Drive File Comment",
    behavior: {
      fileInput: { fields: ["body"] }
    }
  },
  update_inventory_category: {
    path: ["inventory", "category", "update"],
    positional: ["category"],
    description: "Update Inventory Category"
  },
  update_inventory_product: {
    path: ["inventory", "product", "update"],
    positional: ["product"],
    description: "Update Inventory Product"
  },
  update_inventory_product_attachment: {
    path: ["inventory", "product", "attachment", "update"],
    positional: ["product", "attachmentId"],
    description: "Update Inventory Product Attachment",
    behavior: {
      fileInput: { fields: ["description"] }
    }
  },
  update_inventory_product_comment: {
    path: ["inventory", "product", "comment", "update"],
    positional: ["product", "commentId", "body"],
    description: "Update Inventory Product Comment",
    behavior: {
      fileInput: { fields: ["body"] }
    }
  },
  update_inventory_product_photo: {
    path: ["inventory", "product", "photo", "update"],
    positional: ["product", "photoId"],
    description: "Update Inventory Product Photo",
    behavior: {
      fileInput: { fields: ["description"] }
    }
  },
  update_inventory_variant: {
    path: ["inventory", "variant", "update"],
    positional: ["variant"],
    description: "Update Inventory Variant"
  },
  update_recruiting_applicant: {
    path: ["recruiting", "applicant", "update"],
    positional: ["applicant"],
    description: "Update Recruiting Applicant"
  },
  update_recruiting_attachment: {
    path: ["recruiting", "attachment", "update"],
    positional: ["target", "attachmentId"],
    description: "Update Recruiting Attachment",
    behavior: {
      fileInput: { fields: ["description"] }
    }
  },
  update_recruiting_comment: {
    path: ["recruiting", "comment", "update"],
    positional: ["target", "commentId", "body"],
    description: "Update Recruiting Comment",
    behavior: {
      fileInput: { fields: ["body"] }
    }
  },
  update_recruiting_opinion: {
    path: ["recruiting", "opinion", "update"],
    positional: ["opinion"],
    description: "Update Recruiting Opinion",
    behavior: {
      fileInput: { fields: ["description"] }
    }
  },
  update_recruiting_review: {
    path: ["recruiting", "review", "update"],
    positional: ["review"],
    description: "Update Recruiting Review",
    behavior: {
      fileInput: { fields: ["description"] }
    }
  },
  update_recruiting_vacancy: {
    path: ["recruiting", "vacancy", "update"],
    positional: ["vacancy"],
    description: "Update Recruiting Vacancy",
    behavior: {
      fileInput: { fields: ["shortDescription", "fullDescription"] }
    }
  },
  update_test_case: {
    path: ["tests", "case", "update"],
    positional: ["project", "testCase"],
    description: "Update Test Case",
    behavior: {
      fileInput: { fields: ["description"] }
    }
  },
  update_test_plan: {
    path: ["tests", "plan", "update"],
    positional: ["project", "plan"],
    description: "Update Test Plan",
    behavior: {
      fileInput: { fields: ["description"] }
    }
  },
  update_test_result: {
    path: ["tests", "result", "update"],
    positional: ["project", "result"],
    description: "Update Test Result",
    behavior: {
      fileInput: { fields: ["description"] }
    }
  },
  update_test_run: {
    path: ["tests", "run", "update"],
    positional: ["project", "run"],
    description: "Update Test Run",
    behavior: {
      fileInput: { fields: ["description"] }
    }
  },
  update_test_suite: {
    path: ["tests", "suite", "update"],
    positional: ["project", "suite"],
    description: "Update Test Suite",
    behavior: {
      fileInput: { fields: ["description"] }
    }
  },
  update_todo: {
    path: ["planner", "todos", "update"],
    positional: ["locator"],
    description: "Update Todo",
    behavior: {
      fileInput: { fields: ["description"] }
    }
  }
} as const satisfies Partial<Record<McpToolName, CliCommandSpec>>
