import { searchActiveListingsInputSchema } from '@/schemas/other/browse.js';
import { findCompletedItemsInputSchema } from '@/schemas/other/finding.js';
import { defineTool } from '@/tools/defineTool.js';
import type { ToolEntry } from '@/tools/registry.js';
import { Effect } from 'effect';

/**
 * Browse / Finding tools for public marketplace search data.
 *
 * Gated as family `browse` via `EBAY_MCP_TOOLS=browse`.
 */
export const browseEntries: ToolEntry[] = [
  defineTool({
    name: 'ebay_find_completed_items',
    description:
      'Search eBay sold/completed listings for pricing research (sold comps). Uses the Finding API findCompletedItems operation with app credentials (SECURITY-APPNAME / EBAY_CLIENT_ID). Returns cleaned sold items: itemId, title, price, shippingCost, soldDate, condition, and listingUrl. Useful for market price research before listing or repricing. App credentials are sufficient for this public search data when OAuth is available.\n\nKNOWN BROKEN: eBay retired the Finding API (including this operation) in Feb 2025 and this call now always fails. There is no direct drop-in replacement — true sold-item history requires the separately-gated Marketplace Insights API, which most developer accounts are not approved for. Use ebay_search_active_listings instead for a working (if weaker) pricing signal: current asking prices on live listings rather than sold history.',
    inputSchema: findCompletedItemsInputSchema.shape,
    annotations: { readOnlyHint: true },
    handler: (api, args) => Effect.runPromise(api.finding.findCompletedItems(args)),
  }),
  defineTool({
    name: 'ebay_search_active_listings',
    description:
      'Search live, active eBay listings across all sellers for market/pricing research. Uses the Buy Browse API (item_summary/search) with a standard OAuth token — no special scope or eBay approval needed. Returns cleaned items (itemId, title, price, condition, seller, shippingCost, itemWebUrl) plus priceStats (count/min/max/average/median) computed over the returned page.\n\nThis is NOT sold-item history — it only ever returns currently-active asking prices, never completed sales (eBay retired that data source; see ebay_find_completed_items). Treat results as "what similar items are asking right now," not confirmed sold comps.',
    inputSchema: searchActiveListingsInputSchema.shape,
    annotations: { readOnlyHint: true },
    handler: (api, args) => Effect.runPromise(api.browse.searchActiveListings(args)),
  }),
];
