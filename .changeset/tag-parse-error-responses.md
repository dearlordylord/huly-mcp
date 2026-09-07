---
"@firfi/huly-mcp": patch
---

Tag schema parse failures and parse-path defects in error telemetry. `mapParseErrorToMcp` now reports `ParseError` and `mapParseCauseToMcp` reports `UnexpectedError` for defects, matching the classification `mapDomainCauseToMcp` already applied. Interrupted operations stay untagged.
