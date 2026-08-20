/**
 * Feedback & Seller Health tools — 2 tools
 *
 * 20. ebay_get_feedback       — recent buyer feedback
 * 21. ebay_get_seller_standards — seller level, defect rate, late shipment rate
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ebayGet, getUserToken } from '../services/ebay-client.js';

export function registerFeedbackTools(server: McpServer): void {

  // ── 20. Get feedback ──────────────────────────────────────────────────────
  server.registerTool(
    'ebay_get_feedback',
    {
      title: 'Get eBay Seller Feedback',
      description: `Returns recent buyer feedback received by the seller.

Args:
  - limit (number, optional): Results per page, 1–200 (default 50)
  - offset (number, optional): Pagination offset
  - type (string, optional): POSITIVE | NEGATIVE | NEUTRAL | ALL (default ALL)

Returns: Array of feedback entries with score, comment, buyer username, and item.`,
      inputSchema: z.object({
        limit:  z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).default(0),
        type:   z.enum(['POSITIVE','NEGATIVE','NEUTRAL','ALL']).default('ALL'),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ limit, offset, type }) => {
      try {
        const token  = getUserToken();
        const params: Record<string, string | number | undefined> = { limit, offset };
        if (type !== 'ALL') params['feedback_type'] = type;

        const data = await ebayGet<Record<string, unknown>>(
          '/sell/feedback/v1/feedback', params, token
        );
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { isError: true, content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }] };
      }
    }
  );

  // ── 21. Get seller standards ──────────────────────────────────────────────
  server.registerTool(
    'ebay_get_seller_standards',
    {
      title: 'Get Seller Standards & Health',
      description: `Returns the seller's performance standards profile: seller level (Top Rated,
Above Standard, Below Standard), transaction defect rate, late shipment rate,
cases closed without seller resolution rate, and tracking upload rate.

No parameters required.

Returns: Seller level, all defect metrics, and evaluation period.`,
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
        return { isError: true, content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }] };
      }
    }
  );
}
