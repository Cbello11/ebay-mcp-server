/**
 * Search tools — Browse API (public, app token) + Trading category lookup.
 */

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { browseGet, tradingRequest, xmlAll, xmlVal, checkTradingAck, getConfig, formatError } from '../services/ebay-client.js';
import { CHARACTER_LIMIT, DEFAULT_LIMIT, MAX_LIMIT, CONDITION_NAMES } from '../constants.js';
import type { SearchItem, PaginatedResult } from '../types.js';

// ─── Browse API response shapes ───────────────────────────────────────────────

interface BrowseItemSummary {
  itemId:           string;
  title:            string;
  price?:           { value: string; currency: string };
  condition?:       string;
  seller?:          { username: string };
  itemLocation?:    { city: string; country: string };
  itemWebUrl?:      string;
}

interface BrowseSearchResponse {
  total?:        number;
  itemSummaries?: BrowseItemSummary[];
}

// ─── Register ─────────────────────────────────────────────────────────────────

export function registerSearchTools(server: McpServer): void {

  // ── ebay_search_items ──────────────────────────────────────────────────────
  server.registerTool(
    'ebay_search_items',
    {
      title:       'Search eBay Items',
      description: 'Search eBay catalog using keywords. Returns matching listings with price, condition, and seller info. Supports filtering by condition and price range, and pagination.',
      inputSchema: z.object({
        query:          z.string().min(1).max(200).describe('Search keywords, e.g. "vintage camera" or "iPhone 15 Pro"'),
        limit:          z.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT).describe('Number of results per page (default 20, max 200)'),
        offset:         z.number().int().min(0).default(0).describe('Pagination offset (default 0)'),
        min_price:      z.number().min(0).optional().describe('Minimum price in USD'),
        max_price:      z.number().min(0).optional().describe('Maximum price in USD'),
        condition_ids:  z.array(z.enum(['1000','1500','2000','2500','3000','7000'])).optional()
                         .describe('Filter by condition IDs: 1000=New, 1500=New Other, 2000=Mfr Refurb, 2500=Seller Refurb, 3000=Used, 7000=For Parts'),
        sort:           z.enum(['price','price_desc','newlyListed','endingSoonest']).optional()
                         .describe('Sort order: price (low→high), price_desc (high→low), newlyListed, endingSoonest'),
        format:         z.enum(['markdown','json']).default('markdown').describe('Output format'),
      }).strict(),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) => {
      try {
        const cfg = getConfig();

        const params: Record<string, string> = {
          q:      args.query,
          limit:  String(args.limit),
          offset: String(args.offset),
        };

        if (args.sort) {
          const sortMap: Record<string, string> = {
            price:         'price',
            price_desc:    '-price',
            newlyListed:   'newlyListed',
            endingSoonest: 'endingSoonest',
          };
          params.sort = sortMap[args.sort];
        }

        const filters: string[] = [];
        if (args.condition_ids?.length) {
          filters.push(`conditionIds:{${args.condition_ids.join('|')}}`);
        }
        if (args.min_price !== undefined || args.max_price !== undefined) {
          const lo = args.min_price ?? '';
          const hi = args.max_price ?? '';
          filters.push(`price:[${lo}..${hi}]`);
          params['fieldgroups'] = 'EXTENDED';
        }
        if (filters.length) params.filter = filters.join(',');

        const data = await browseGet<BrowseSearchResponse>(
          cfg,
          '/buy/browse/v1/item_summary/search',
          params,
        );

        const total  = data.total  ?? 0;
        const items  = data.itemSummaries ?? [];
        const hasMore = args.offset + items.length < total;

        const mapped: SearchItem[] = items.map(i => ({
          itemId:    i.itemId,
          title:     i.title,
          price:     i.price ? `${i.price.currency} ${i.price.value}` : 'N/A',
          condition: i.condition ?? 'Unknown',
          seller:    i.seller?.username ?? 'Unknown',
          location:  i.itemLocation ? `${i.itemLocation.city ?? ''}, ${i.itemLocation.country ?? ''}`.replace(/^, |, $/, '') : 'Unknown',
          url:       i.itemWebUrl ?? '',
        }));

        const result: PaginatedResult<SearchItem> = {
          total,
          count:       mapped.length,
          offset:      args.offset,
          has_more:    hasMore,
          next_offset: hasMore ? args.offset + mapped.length : undefined,
          items:       mapped,
        };

        if (args.format === 'json') {
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2).slice(0, CHARACTER_LIMIT) }] };
        }

        // Markdown
        let md = `## eBay Search: "${args.query}"\n`;
        md += `Showing ${result.count} of ${result.total} results (offset ${result.offset})\n\n`;

        for (const it of mapped) {
          md += `### ${it.title}\n`;
          md += `- **Price:** ${it.price}\n`;
          md += `- **Condition:** ${it.condition}\n`;
          md += `- **Seller:** ${it.seller}  |  **Location:** ${it.location}\n`;
          md += `- **ID:** \`${it.itemId}\`\n`;
          md += `- [View on eBay](${it.url})\n\n`;
        }

        if (result.has_more) {
          md += `\n*More results available. Use offset=${result.next_offset} to get the next page.*\n`;
        }

        return { content: [{ type: 'text', text: md.slice(0, CHARACTER_LIMIT) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: formatError(e) }], isError: true };
      }
    }
  );

  // ── ebay_get_categories ────────────────────────────────────────────────────
  server.registerTool(
    'ebay_get_categories',
    {
      title:       'Get eBay Category Suggestions',
      description: 'Get eBay category suggestions for a product name. Use this before creating a listing to find the correct category ID.',
      inputSchema: z.object({
        query:  z.string().min(1).max(200).describe('Product name or keywords, e.g. "vintage Leica camera"'),
        limit:  z.number().int().min(1).max(10).default(5).describe('Number of suggestions (default 5, max 10)'),
      }).strict(),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) => {
      try {
        const cfg = getConfig();
        const xml = await tradingRequest(cfg, 'GetSuggestedCategories', `<Query>${args.query}</Query>`);
        checkTradingAck(xml);

        // Parse <SuggestedCategoryArray><SuggestedCategory>...</SuggestedCategory>...
        const catBlocks = xmlAll(xml, 'SuggestedCategory');
        const results: Array<{ id: string; name: string; path: string; score: string }> = [];

        for (const block of catBlocks.slice(0, args.limit)) {
          results.push({
            id:    xmlVal(block, 'CategoryID'),
            name:  xmlVal(block, 'CategoryName'),
            path:  xmlVal(block, 'CategoryParentName'),
            score: xmlVal(block, 'PercentItemFound'),
          });
        }

        let md = `## Category Suggestions for "${args.query}"\n\n`;
        for (const c of results) {
          md += `- **${c.name}** (ID: \`${c.id}\`)\n`;
          if (c.path) md += `  Path: ${c.path}\n`;
          if (c.score) md += `  Match: ${c.score}% of items\n`;
          md += '\n';
        }

        if (!results.length) md += '_No suggestions found. Try broader keywords._\n';

        return { content: [{ type: 'text', text: md.slice(0, CHARACTER_LIMIT) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: formatError(e) }], isError: true };
      }
    }
  );
}
