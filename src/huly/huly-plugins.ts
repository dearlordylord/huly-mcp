// Centralized CJS require() interop for Huly platform plugins.
// These packages only expose CommonJS default exports; import() doesn't work at runtime.
// All requires are collected here so consumers import typed values without eslint suppression.

import { createRequire } from "node:module"

/* eslint-disable @typescript-eslint/consistent-type-imports, no-restricted-syntax -- CJS interop boundary: require().default needs `as typeof import(…).default` */

declare const require: NodeJS.Require | undefined

const load = typeof require === "function" ? require : createRequire(`${process.cwd()}/package.json`)

export const activity = load("@hcengineering/activity").default as typeof import("@hcengineering/activity").default
export const attachment = load("@hcengineering/attachment")
  .default as typeof import("@hcengineering/attachment").default
export const board = load("@hcengineering/board").default as typeof import("@hcengineering/board").default
export const calendar = load("@hcengineering/calendar")
  .default as typeof import("@hcengineering/calendar").default
export const cardPlugin = load("@hcengineering/card")
  .default as typeof import("@hcengineering/card").default
export const chunter = load("@hcengineering/chunter").default as typeof import("@hcengineering/chunter").default
export const contact = load("@hcengineering/contact").default as typeof import("@hcengineering/contact").default
export const core = load("@hcengineering/core").default as typeof import("@hcengineering/core").default
export const documentPlugin = load("@hcengineering/document")
  .default as typeof import("@hcengineering/document").default
export const inventory = load("@hcengineering/inventory")
  .default as typeof import("@hcengineering/inventory").default
export const love = load("@hcengineering/love").default as typeof import("@hcengineering/love").default
export const notification = load("@hcengineering/notification")
  .default as typeof import("@hcengineering/notification").default
export const preference = load("@hcengineering/preference")
  .default as typeof import("@hcengineering/preference").default
export const request = load("@hcengineering/request").default as typeof import("@hcengineering/request").default
export const tags = load("@hcengineering/tags").default as typeof import("@hcengineering/tags").default
export const task = load("@hcengineering/task").default as typeof import("@hcengineering/task").default
export const templates = load("@hcengineering/templates")
  .default as typeof import("@hcengineering/templates").default
export const time = load("@hcengineering/time").default as typeof import("@hcengineering/time").default
export const tracker = load("@hcengineering/tracker").default as typeof import("@hcengineering/tracker").default
export const view = load("@hcengineering/view").default as typeof import("@hcengineering/view").default

/* eslint-enable @typescript-eslint/consistent-type-imports, no-restricted-syntax */
