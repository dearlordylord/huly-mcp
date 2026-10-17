import { subscribe } from "node:diagnostics_channel"

subscribe("huly.resident-response-ownership", (observation) => {
  process.send?.(observation)
})
