#!/usr/bin/env node

import "./polyfills.js"
import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import { main } from "./runtime/server-startup.js"

export {
  buildAppLayer,
  closeProcessClients,
  getHttpPort,
  getLazyEnvs,
  getMcpAuthToken,
  main
} from "./runtime/server-startup.js"

if (typeof require !== "undefined" && require.main === module) NodeRuntime.runMain(main)
