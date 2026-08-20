/**
 * Business Policies & Inventory tools — 2 tools
 *
 * 22. ebay_get_policies           — payment/fulfillment/return policies
 * 23. ebay_get_inventory_locations — warehouse/pickup locations for listings
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ebayGet, getUserToken } from '../services/ebay-client.js';

export function registerPolicyTools(server: McpServer): void {

  // ── 22. Get business policies ─────────────────────────────────────────────
  server.registerTool(
    'ebay_get_policies',
    {
      title: 'Get eBay Business Policies',
      description: `Returns all saved business policies for the seller account: payment policies,
fulfillment (shipping) policies, and return policies.

These policy IDs are required when creating or revising listings via ebay_create_listing.
Always call this before creating a listing to get valid policy IDs.

Args:
  - type (string, optional): PAYMENT | FULFILLMENT | RETURN | ALL (default ALL)

Returns: All policies with IDs, names, and key settings.`,
      inputSchema: z.object({
        type: z.enum(['PAYMENT','FULFILLMENT','RETURN','ALL']).default('ALL'),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ type }) => {
      try {
        const token = getUserToken();
        const results: Record<string, unknown> = {};

        if (type === 'PAYMENT' || type === 'ALL') {
          try {
            results['payment_policies'] = await ebayGet(
              '/sell/account/v1/payment_policy', { marketplace_id: 'EBAY_US' }, token
            );
          } catch { results['payment_policies'] = { error: 'unavailable' }; }
        }

        if (type === 'FULFILLMENT' || type === 'ALL') {
          try {
            results['fulfillment_policies'] = await ebayGet(
              '/sell/account/v1/fulfillment_policy', { marketplace_id: 'EBAY_US' }, token
            );
          } catch { results['fulfillment_policies'] = { error: 'unavailable' }; }
        }

        if (type === 'RETURN' || type === 'ALL') {
          try {
            results['return_policies'] = await ebayGet(
              '/sell/account/v1/return_policy', { marketplace_id: 'EBAY_US' }, token
            );
          } catch { results['return_policies'] = { error: 'unavailable' }; }
        }

        return { content: [{ type: 'text' as const, text: JSON.stringify(results, null, 2) }] };
      } catch (err) {
        return { isError: true, content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }] };
      }
    }
  );

  // ── 23. Get inventory locations ───────────────────────────────────────────
  server.registerTool(
    'ebay_get_inventory_locations',
    {
      title: 'Get Inventory Locations',
      description: `Returns all inventory locations (warehouses, home address, pickup points)
configured in the seller's account.

The merchantLocationKey from this response is required when creating
listings via ebay_create_listing.

No parameters required.

Returns: Array of locations with keys, names, addresses, and types.`,
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      try {
        const token = getUserToken();
        const data  = await ebayGet<Record<string, unknown>>(
          '/sell/inventory/v1/location', {}, token
        );
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { isError: true, content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }] };
      }
    }
  );
}
