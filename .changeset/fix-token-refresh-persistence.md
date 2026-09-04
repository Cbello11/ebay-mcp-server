---
"ebay-mcp": patch
---

Persist refreshed OAuth credentials to the same package-root `.env` file used at startup, and retain valid in-memory access tokens when only the persistence step fails.
