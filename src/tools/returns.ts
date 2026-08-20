/**
 * Returns tools — 2 tools
 *
 * 18. ebay_get_returns        — list open return requests
 * 19. ebay_respond_to_return  — accept, decline, or refund a return
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ebayGet, ebayPost, getUserToken } from '../services/ebay-client.js';

export function registerReturnTools(server: McpServer): void {

  // ── 18. Get returns ───────────────────────────────────────────────────────
  server.registerTool(
    'ebay_get_returns',
    {
      title: 'Get eBay Return Requests',
      description: `Returns open and recent return requests from the Post-Order API.

Args:
  - status (string, optional): OPEN | CLOSED | ALL (default OPEN)
  - limit (number, optional): Results per page, 1–200 (default 50)
  - offset (number, optional): Pagination offset

Returns: Array of return requests with reason, item, buyer, and status.`,
      inputSchema: z.object({
        status: z.enum(['OPEN','CLOSED','ALL']).default('OPEN'),
        limit:  z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).default(0),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ status, limit, offset }) => {
      try {
        const token  = getUserToken();
        const params: Record<string, string | number | undefined> = { limit, offset };
        if (status !== 'ALL') params['status'] = status;

        const data = await ebayGet<Record<string, unknown>>(
          '/post-order/v2/return', params, token
        );
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { isError: true, content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }] };
      }
    }
  );

  // ── 19. Respond to return ─────────────────────────────────────────────────
  server.registerTool(
    'ebay_respond_to_return',
    {
      title: 'Respond to eBay Return Request',
      description: `Responds to a buyer return request: accept the return, decline it, or issue a refund.

Args:
  - return_id (string): The return request ID
  - action (string): ACCEPT | DECLINE | REFUND
  - comment (string, optional): Message to the buyer explaining the decision
  - refund_amount (number, optional): Refund amount in USD — required for REFUND action

Returns: Confirmation with return ID, action taken, and timestamp.`,
      inputSchema: z.object({
        return_id:     z.string().min(1),
        action:        z.enum(['ACCEPT','DECLINE','REFUND']),
        comment:       z.string().max(2000).optional(),
        refund_amount: z.number().positive().optional().describe('USD refund amount (required for REFUND)'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ return_id, action, comment, refund_amount }) => {
      try {
        const token = getUserToken();

        let endpoint: string;
        let body: Record<string, unknown>;

        switch (action) {
          case 'ACCEPT':
            endpoint = `/post-order/v2/return/${return_id}/decide`;
            body = { decision: 'SELLER_ACCEPT_RETURN', sellerComments: { content: comment ?? '' } };
            break;
          case 'DECLINE':
            endpoint = `/post-order/v2/return/${return_id}/decide`;
            body = { decision: 'SELLER_DECLINE_RETURN', sellerComments: { content: comment ?? '' } };
            break;
          case 'REFUND':
            if (!refund_amount) throw new Error('refund_amount is required for REFUND action');
            endpoint = `/post-order/v2/return/${return_id}/issue_refund`;
            body = {
              refundDetail: {
                refundAmount: { convertedFromValue: refund_amount.toFixed(2), currency: 'USD' },
                sellerComments: { content: comment ?? '' },
              },
            };
            break;
        }

        const data = await ebayPost<Record<string, unknown>>(endpoint!, body!, token);
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: true, return_id, action, ...data }, null, 2),
          }],
        };
      } catch (err) {
        return { isError: true, content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }] };
      }
    }
  );
}
