/**
 * Buyer Communication tools — 2 tools
 *
 * 16. ebay_get_messages     — retrieve buyer messages
 * 17. ebay_reply_to_message — send a reply to a buyer message
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ebayGet, ebayPost, getUserToken } from '../services/ebay-client.js';

export function registerMessageTools(server: McpServer): void {

  // ── 16. Get messages ──────────────────────────────────────────────────────
  server.registerTool(
    'ebay_get_messages',
    {
      title: 'Get eBay Buyer Messages',
      description: `Retrieves buyer messages from the seller's eBay inbox using the Post-Order API.

Args:
  - item_id (string, optional): Filter messages by listing item ID
  - status (string, optional): UNANSWERED | ANSWERED | ALL (default ALL)
  - limit (number, optional): Results per page, 1–200 (default 50)
  - offset (number, optional): Pagination offset

Returns: Array of messages with buyer username, item, subject, body, and timestamp.`,
      inputSchema: z.object({
        item_id: z.string().optional().describe('Filter by listing item ID'),
        status:  z.enum(['UNANSWERED','ANSWERED','ALL']).default('ALL'),
        limit:   z.number().int().min(1).max(200).default(50),
        offset:  z.number().int().min(0).default(0),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ item_id, status, limit, offset }) => {
      try {
        const token  = getUserToken();
        const params: Record<string, string | number | undefined> = { limit, offset };
        if (item_id)         params['item_id'] = item_id;
        if (status !== 'ALL') params['status']  = status;

        const data = await ebayGet<Record<string, unknown>>(
          '/post-order/v2/inquiry', params, token
        );
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { isError: true, content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }] };
      }
    }
  );

  // ── 17. Reply to message ──────────────────────────────────────────────────
  server.registerTool(
    'ebay_reply_to_message',
    {
      title: 'Reply to eBay Buyer Message',
      description: `Sends a reply to a buyer message or inquiry using the Post-Order API.

Args:
  - message_id (string): The message or inquiry ID to reply to
  - reply_text (string): The reply body text (plain text, no HTML)

Returns: Confirmation with message ID and sent timestamp.`,
      inputSchema: z.object({
        message_id: z.string().min(1).describe('Message or inquiry ID'),
        reply_text: z.string().min(1).max(4000).describe('Reply text, max 4000 chars'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ message_id, reply_text }) => {
      try {
        const token = getUserToken();
        const data  = await ebayPost<Record<string, unknown>>(
          `/post-order/v2/inquiry/${message_id}/respond`,
          { response: { text: reply_text } },
          token
        );
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: true, message_id, sent_at: new Date().toISOString(), ...data }, null, 2),
          }],
        };
      } catch (err) {
        return { isError: true, content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }] };
      }
    }
  );
}
