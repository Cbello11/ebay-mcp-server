/**
 * Orders & Fulfillment tools — 3 tools
 *
 * 13. ebay_get_orders  — all recent orders
 * 14. ebay_get_order   — one order in detail
 * 15. ebay_ship_order  — mark a line item shipped with tracking
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ebayGet, ebayPost, getUserToken } from '../services/ebay-client.js';

export function registerOrderTools(server: McpServer): void {

  // ── 13. Get orders ────────────────────────────────────────────────────────
  server.registerTool(
    'ebay_get_orders',
    {
      title: 'Get eBay Orders',
      description: `Returns recent orders from the seller's account using the Fulfillment API.

Args:
  - limit (number, optional): Orders per page, 1–200 (default 50)
  - offset (number, optional): Pagination offset (default 0)
  - filter (string, optional): Filter orders — AWAITING_SHIPMENT | SHIPPED | CANCELLED | ALL (default ALL)
  - created_after (string, optional): ISO 8601 date, e.g. "2024-01-01T00:00:00Z"

Returns: Array of orders with buyer info, items, amounts, and shipping status.`,
      inputSchema: z.object({
        limit:         z.number().int().min(1).max(200).default(50),
        offset:        z.number().int().min(0).default(0),
        filter:        z.enum(['AWAITING_SHIPMENT','SHIPPED','CANCELLED','ALL']).default('ALL'),
        created_after: z.string().optional().describe('ISO 8601 date filter'),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ limit, offset, filter, created_after }) => {
      try {
        const token  = getUserToken();
        const params: Record<string, string | number | undefined> = { limit, offset };

        const filters: string[] = [];
        if (filter !== 'ALL') filters.push(`orderfulfillmentstatus:{${filter}}`);
        if (created_after)    filters.push(`creationdate:[${created_after}]`);
        if (filters.length)   params['filter'] = filters.join(',');

        const data = await ebayGet<Record<string, unknown>>(
          '/sell/fulfillment/v1/order', params, token
        );
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { isError: true, content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }] };
      }
    }
  );

  // ── 14. Get one order ─────────────────────────────────────────────────────
  server.registerTool(
    'ebay_get_order',
    {
      title: 'Get eBay Order Detail',
      description: `Returns full details of a single order including buyer info, line items,
shipping address, payment status, and fulfillment status.

Args:
  - order_id (string): The eBay order ID

Returns: Complete order details including buyer, items, shipping, and payment.`,
      inputSchema: z.object({
        order_id: z.string().min(1).describe('eBay order ID'),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ order_id }) => {
      try {
        const token = getUserToken();
        const data  = await ebayGet<Record<string, unknown>>(
          `/sell/fulfillment/v1/order/${order_id}`, {}, token
        );
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { isError: true, content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }] };
      }
    }
  );

  // ── 15. Ship order ────────────────────────────────────────────────────────
  server.registerTool(
    'ebay_ship_order',
    {
      title: 'Mark eBay Order Shipped',
      description: `Marks a fulfillment line item as shipped and uploads tracking information.
This triggers the buyer notification and starts the feedback eligibility window.

Args:
  - order_id (string): The eBay order ID
  - line_item_id (string): The line item ID within the order
  - carrier_code (string): Carrier code — USPS | UPS | FEDEX | DHL | ONTRAC | OTHER
  - tracking_number (string): Shipment tracking number
  - shipping_date (string, optional): ISO 8601 ship date, defaults to now

Returns: Confirmation with shipment details.`,
      inputSchema: z.object({
        order_id:       z.string().min(1),
        line_item_id:   z.string().min(1),
        carrier_code:   z.enum(['USPS','UPS','FEDEX','DHL','ONTRAC','OTHER']),
        tracking_number: z.string().min(1),
        shipping_date:  z.string().optional().describe('ISO 8601, defaults to now'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ order_id, line_item_id, carrier_code, tracking_number, shipping_date }) => {
      try {
        const token = getUserToken();
        const body  = {
          lineItemFulfillmentInstructions: [{
            lineItemId:     line_item_id,
            shippedDate:    shipping_date ?? new Date().toISOString(),
          }],
          trackingNumber:  tracking_number,
          shippingCarrierCode: carrier_code,
        };

        await ebayPost(
          `/sell/fulfillment/v1/order/${order_id}/shipping_fulfillment`,
          body,
          token
        );

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success:          true,
              order_id,
              line_item_id,
              carrier:          carrier_code,
              tracking_number,
              shipped_date:     shipping_date ?? new Date().toISOString(),
            }, null, 2),
          }],
        };
      } catch (err) {
        return { isError: true, content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }] };
      }
    }
  );
}
