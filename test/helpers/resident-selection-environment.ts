import { testStdioEnvironment } from "./stdio-environment.js"

export const residentSelectionEnvironment = () => ({
  ...testStdioEnvironment(),
  HULY_TOOL_MODE: "auto",
  HULY_URL: "http://127.0.0.1:1",
  HULY_WORKSPACE: "fixture",
  HULY_TOKEN: "fixture-huly-token"
})
