---
"@firfi/huly-mcp": patch
---

Fix HTTP/Docker registry inspection by preserving typed Huly configuration failures in HTTP client resolution, allowing unauthenticated no-config `resources/list` calls to return an empty resource list. Add HTTP and Docker smoke coverage for the no-config inspection path.
