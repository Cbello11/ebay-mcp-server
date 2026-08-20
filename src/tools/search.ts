/**
 * Search & Discovery tools — 4 tools
 *
 * 1. ebay_search_listings         — Browse API active-listing search
 * 2. ebay_get_category_suggestions — Taxonomy API: keyword → leaf categories
 * 3. ebay_get_item_aspects        — Taxonomy API: required/recommended item specifics
 * 4. ebay_search_sold_comps       — Marketplace Insights sold comps (falls back to Browse active)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ebayGet, getUserToken, MARKETPLACE } from '../services/ebay-client.js';

export function registerSearchTools(server: McpServer): void {

  // ── 1. Search active listings ──────────────────────────────────────────────
  server.registerTool(
    'ebay_search_listings',
    {
      title: 'Search eBay Listings',
      description: `Search active eBay listings by keyword, category, or filters using the Browse API.

Returns titles, prices, condition, seller, item IDs, and listing URLs.
Use this to research active market pricing, find comparable items, or check
what's currently listed in a category.

Args:
  - query (string): Search keywords (e.g. "vintage cast iron skillet")
  - category_id (string, optional): eBay leaf category ID to restrict results
  - condition (string, optional): NEW | USED | UNSPECIFIED
  - min_price (number, optional): Minimum price in USD
  - max_price (number, optional): Maximum price in USD
  - limit (number, optional): Results per page, 1–200 (default 20)
  - offset (number, optional): Pagination offset (default 0)

Returns: Array of listing summaries with prices, condition, and item URLs.`,
      inputSchema: z.object({
        query:       z.string().min(1).describe('Search keywords'),
        category_id: z.string().optional().describe('eBay leaf category ID'),
        condition:   z.enum(['NEW', 'USED', 'UNSPECIFIED']).optional().describe('Item condition filter'),
        min_price:   z.number().positive().optional().describe('Minimum price USD'),
        max_price:   z.number().positive().optional().describe('Maximum price USD'),
        limit:       z.number().int().min(1).max(200).default(20).describe('Results per page'),
        offset:      z.number().int().min(0).default(0).describe('Pagination offset'),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ query, category_id, condition, min_price, max_price, limit, offset }) => {
      try {
        const params: Record<string, string | number | boolean | undefined> = {
          q:      query,
          limit,
          offset,
        };
        if (category_id) params['category_ids'] = category_id;

        const filters: string[] = [];
        if (condition)  filters.push(`conditionIds:{${condition}}`);
        if (min_price)  filters.push(`price:[${min_price}]`);
        if (max_price)  filters.push(`price:[..${max_price}]`);
        if (min_price && max_price) {
          // override with range
          filters[filters.length - 1] = `price:[${min_price}..${max_price}]`;
          filters.splice(filters.length - 2, 1);
        }
        if (filters.length) params['filter'] = filters.join(',');

        const data = await ebayGet<Record<string, unknown>>(
          '/buy/browse/v1/item_summary/search', params
        );

        const items = (data.itemSummaries as Array<Record<string, unknown>>) ?? [];
        const total = (data.total as number) ?? 0;

        if (!items.length) {
          return { content: [{ type: 'text' as const, text: `No listings found for "${query}"` }] };
        }

        const result = {
          total,
          count:       items.length,
          offset,
          has_more:    total > offset + items.length,
          next_offset: offset + items.length,
          items: items.map((item) => ({
            item_id:    item['itemId'],
            title:      item['title'],
            price:      (item['price'] as Record<string, unknown>)?.['value'],
            currency:   (item['price'] as Record<string, unknown>)?.['currency'],
            condition:  item['condition'],
            seller:     (item['seller'] as Record<string, unknown>)?.['username'],
            url:        item['itemWebUrl'],
            image:      (item['image'] as Record<string, unknown>)?.['imageUrl'],
          })),
        };

        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { isError: true, content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }] };
      }
    }
  );

  // ── 2. Category suggestions ────────────────────────────────────────────────
  server.registerTool(
    'ebay_get_category_suggestions',
    {
      title: 'Get eBay Category Suggestions',
      description: `Given a product description, returns ranked eBay leaf categories using the Taxonomy API.

Use this to find the correct category ID before creating a listing or fetching item aspects.
Always call this first when you don't already know the category ID for an item.

Args:
  - query (string): Item description (e.g. "vintage 1970s cast iron skillet Lodge")

Returns: Ranked list of leaf categories with IDs, names, and full breadcrumb paths.`,
      inputSchema: z.object({
        query: z.string().min(2).describe('Item description to find matching categories'),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ query }) => {
      try {
        const data = await ebayGet<Record<string, unknown>>(
          '/commerce/taxonomy/v1/category_tree/0/get_category_suggestions',
          { q: query }
        );

        const suggestions = (data.categorySuggestions as Array<Record<string, unknown>>) ?? [];
        if (!suggestions.length) {
          return { content: [{ type: 'text' as const, text: `No category suggestions found for "${query}"` }] };
        }

        const result = suggestions.slice(0, 10).map((s) => {
          const cat  = s['category'] as Record<string, unknown>;
          const path = s['categoryTreeNodeAncestors'] as Array<Record<string, unknown>> ?? [];
          return {
            category_id:   cat['categoryId'],
            category_name: cat['categoryName'],
            breadcrumb:    [...path.map((p) => p['categoryName']), cat['categoryName']].join(' > '),
          };
        });

        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { isError: true, content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }] };
      }
    }
  );

  // ── 3. Item aspects for category ──────────────────────────────────────────
  server.registerTool(
    'ebay_get_item_aspects',
    {
      title: 'Get Item Aspects for Category',
      description: `Returns the full list of required and recommended item specifics (aspects) for
a given eBay leaf category ID, pulled live from the Taxonomy API.

Use this to know exactly which fields must be filled before publishing a listing.
Required aspects are mandatory — eBay will reject or bury listings missing them.
Recommended aspects are weighted by Cassini (eBay's search algorithm).

Args:
  - category_id (string): The eBay leaf category ID (get this from ebay_get_category_suggestions first)

Returns:
  - required: List of aspect names that must be filled
  - recommended: List of aspect names that improve Cassini ranking
  - optional: All other aspects
  Each aspect includes allowed values where applicable.`,
      inputSchema: z.object({
        category_id: z.string().min(1).describe('eBay leaf category ID'),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ category_id }) => {
      try {
        const data = await ebayGet<Record<string, unknown>>(
          `/commerce/taxonomy/v1/category_tree/0/get_item_aspects_for_category`,
          { category_id }
        );

        const aspects = (data.aspects as Array<Record<string, unknown>>) ?? [];
        if (!aspects.length) {
          return { content: [{ type: 'text' as const, text: `No aspects found for category ${category_id}` }] };
        }

        const required: unknown[]    = [];
        const recommended: unknown[] = [];
        const optional: unknown[]    = [];

        for (const aspect of aspects) {
          const name         = aspect['localizedAspectName'] as string;
          const constraint   = aspect['aspectConstraint'] as Record<string, unknown>;
          const usage        = (constraint?.['aspectUsage'] as string) ?? 'OPTIONAL';
          const required_flag = (constraint?.['aspectRequired'] as boolean) ?? false;
          const values       = (aspect['aspectValues'] as Array<Record<string, unknown>> ?? [])
            .slice(0, 20)
            .map((v) => v['localizedValue']);

          const entry = { name, allowed_values: values.length ? values : 'free_text' };

          if (required_flag || usage === 'REQUIRED') {
            required.push(entry);
          } else if (usage === 'RECOMMENDED') {
            recommended.push(entry);
          } else {
            optional.push(entry);
          }
        }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ category_id, required, recommended, optional }, null, 2),
          }],
        };
      } catch (err) {
        return { isError: true, content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }] };
      }
    }
  );

  // ── 4. Sold comps ─────────────────────────────────────────────────────────
  server.registerTool(
    'ebay_search_sold_comps',
    {
      title: 'Search Sold Comps (Price Research)',
      description: `Search for recently sold items for price research using the Marketplace Insights API.

NOTE: The Marketplace Insights API is a limited-release API requiring eBay business approval.
If access is denied (403), this tool automatically falls back to active Browse API listings
as a proxy for market pricing. Active comps are flagged clearly so you know the difference.

Args:
  - query (string): Item keywords (e.g. "Lodge cast iron skillet 10 inch")
  - category_id (string, optional): eBay leaf category ID to narrow results
  - limit (number, optional): Number of results, 1–100 (default 20)

Returns: Sold or active listing prices with source clearly indicated.`,
      inputSchema: z.object({
        query:       z.string().min(1).describe('Keywords to search sold comps'),
        category_id: z.string().optional().describe('eBay leaf category ID'),
        limit:       z.number().int().min(1).max(100).default(20),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ query, category_id, limit }) => {
      // Try Marketplace Insights first
      try {
        const params: Record<string, string | number | undefined> = { q: query, limit };
        if (category_id) params['category_ids'] = category_id;

        const data = await ebayGet<Record<string, unknown>>(
          '/buy/marketplace_insights/v1_beta/item_sales/search', params
        );

        const items = (data.itemSales as Array<Record<string, unknown>>) ?? [];
        const result = {
          source: 'marketplace_insights_sold',
          note:   'Real sold listings from Marketplace Insights API',
          total:  (data.total as number) ?? 0,
          items:  items.map((i) => ({
            title:     i['title'],
            sold_price: (i['lastSoldPrice'] as Record<string, unknown>)?.['value'],
            sold_date:  i['lastSoldDate'],
            condition: i['condition'],
          })),
        };
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };

      } catch (miErr) {
        // Fall back to Browse active listings
        try {
          const params: Record<string, string | number | undefined> = { q: query, limit };
          if (category_id) params['category_ids'] = category_id;

          const data = await ebayGet<Record<string, unknown>>(
            '/buy/browse/v1/item_summary/search', params
          );

          const items = (data.itemSummaries as Array<Record<string, unknown>>) ?? [];
          const result = {
            source: 'browse_api_active_fallback',
            note:   `Marketplace Insights API unavailable (${(miErr as Error).message.slice(0, 80)}). Showing ACTIVE listings as proxy — not sold prices.`,
            total:  (data.total as number) ?? 0,
            items:  items.map((i) => ({
              title:        i['title'],
              asking_price: (i['price'] as Record<string, unknown>)?.['value'],
              condition:    i['condition'],
              url:          i['itemWebUrl'],
            })),
          };
          return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };

        } catch (browseErr) {
          return {
            isError: true,
            content: [{ type: 'text' as const, text: `Both Marketplace Insights and Browse API failed: ${(browseErr as Error).message}` }],
          };
        }
      }
    }
  );

  // ── 5. Seller summary ─────────────────────────────────────────────────────
  server.registerTool(
    'ebay_get_seller_summary',
    {
      title: 'Get Seller Summary',
      description: `Returns an overview of the authenticated seller's account: feedback score,
feedback percentage, active listing count, seller level, and account status.

No parameters required. Uses the seller's user token.

Returns: Feedback score, positive percentage, active listings count, seller level.`,
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      try {
        const token = getUserToken();
        const data  = await ebayGet<Record<string, unknown>>(
          '/sell/account/v1/seller_standards_profile', {}, token
        );
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        // Fallback: try Fulfillment API seller info
        return { isError: true, content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }] };
      }
    }
  );
}
