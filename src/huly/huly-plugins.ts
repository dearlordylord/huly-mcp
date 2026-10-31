// Centralized CJS require() interop for Huly platform plugins.
// Literal requires let esbuild bundle the upstream CommonJS exports without installing their UI dependencies.
// The assertions restore the exact published default-export types at this interop boundary.

import settingModule from "@hcengineering/setting"

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports, no-restricted-syntax -- CJS interop boundary: require().default needs `as typeof import(…).default` */

export const activity = require("@hcengineering/activity").default as typeof import("@hcengineering/activity").default
export const attachment = require("@hcengineering/attachment")
  .default as typeof import("@hcengineering/attachment").default
export const board = require("@hcengineering/board").default as typeof import("@hcengineering/board").default
export const calendar = require("@hcengineering/calendar").default as typeof import("@hcengineering/calendar").default
export const cardPlugin = require("@hcengineering/card").default as typeof import("@hcengineering/card").default
export const chunter = require("@hcengineering/chunter").default as typeof import("@hcengineering/chunter").default
export const contact = require("@hcengineering/contact").default as typeof import("@hcengineering/contact").default
export const core = require("@hcengineering/core").default as typeof import("@hcengineering/core").default
export const documentPlugin = require("@hcengineering/document")
  .default as typeof import("@hcengineering/document").default
// The Gmail package is CommonJS-only at runtime. The assertion restores the exact published module shape;
// focused compatibility tests verify the default plugin's Message class reference.
const gmailModule = require("@hcengineering/gmail") as typeof import("@hcengineering/gmail")
export const gmail: typeof import("@hcengineering/gmail").default = gmailModule.default
// @hcengineering/hr is CommonJS at runtime while its declarations expose the plugin as a default export.
// `require` returns `any`, and neither a generic nor a type guard can recover a type from a dynamic module specifier.
// The package declaration guarantees this module shape; HR operation tests exercise Department and Staff refs.
const hrModule = require("@hcengineering/hr") as typeof import("@hcengineering/hr")
export const hr: typeof import("@hcengineering/hr").default = hrModule.default
export const inventory = require("@hcengineering/inventory")
  .default as typeof import("@hcengineering/inventory").default
export const love = require("@hcengineering/love").default as typeof import("@hcengineering/love").default
export const mail = require("@hcengineering/mail").default as typeof import("@hcengineering/mail").default
export const notification = require("@hcengineering/notification")
  .default as typeof import("@hcengineering/notification").default
export const preference = require("@hcengineering/preference")
  .default as typeof import("@hcengineering/preference").default
export const request = require("@hcengineering/request").default as typeof import("@hcengineering/request").default
// Bundle this plugin instead of loading it from the consumer installation. The
// 0.7.382 package supplies the native OfficeSettings contract, but its published
// manifest contains workspace: dependency ranges that external installs cannot
// resolve. A static import lets esbuild retain the official plugin implementation
// without exposing that broken manifest as a runtime dependency.
export const isSettingPlugin = (value: unknown): value is typeof import("@hcengineering/setting").default =>
  typeof value === "object" &&
  value !== null &&
  "class" in value &&
  typeof value.class === "object" &&
  value.class !== null &&
  "OfficeSettings" in value.class &&
  value.class.OfficeSettings === "setting:class:OfficeSettings"

export const resolveSettingPlugin = (
  candidate: unknown = settingModule
): typeof import("@hcengineering/setting").default => {
  const direct: unknown = candidate
  if (isSettingPlugin(direct)) return direct
  if (typeof direct === "object" && direct !== null && "default" in direct && isSettingPlugin(direct.default)) {
    return direct.default
  }
  throw new Error("@hcengineering/setting did not expose its declared default plugin")
}

export const setting = resolveSettingPlugin()
export const support = require("@hcengineering/support").default as typeof import("@hcengineering/support").default
export const tags = require("@hcengineering/tags").default as typeof import("@hcengineering/tags").default
export const task = require("@hcengineering/task").default as typeof import("@hcengineering/task").default
export const templates = require("@hcengineering/templates")
  .default as typeof import("@hcengineering/templates").default
export const telegram = require("@hcengineering/telegram").default as typeof import("@hcengineering/telegram").default
export const time = require("@hcengineering/time").default as typeof import("@hcengineering/time").default
export const tracker = require("@hcengineering/tracker").default as typeof import("@hcengineering/tracker").default
export const view = require("@hcengineering/view").default as typeof import("@hcengineering/view").default
export const workbench = require("@hcengineering/workbench")
  .default as typeof import("@hcengineering/workbench").default

/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports, no-restricted-syntax */
