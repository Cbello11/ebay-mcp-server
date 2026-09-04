---
"ebay-mcp": patch
---

Correct the advertised tool count and pin it to the live registry.

The README (badge and prose), all eight locale READMEs, `llms.txt`, `AGENTS.md`, `CONTEXT.md`, `PROJECT.md`, and the npm package description all claimed 322 tools while `getToolDefinitions()` returned 298. Nothing derived the figure from the registry, so it drifted unnoticed.

Every literal now reads 298, and a new `tests/unit/advertisedToolCount.test.ts` guard fails CI whenever a documented count diverges from the live registry — including in the locale READMEs, which the sweep checks language-independently.
