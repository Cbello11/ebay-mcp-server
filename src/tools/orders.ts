/**
 * Order tools — Fulfillment API (REST, user token) + Trading API fallback.
 */

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { sellRequest, tradingRequest, xmlVal, xmlAll, checkTradingAck, getConfig, formatError } from '../services/ebay-client.js';
import { CHARACTER_LIMIT, DEFAULT_LIMIT } from '../constants.js';
import type { OrderSummary, PaginatedResult } from '../types.js';

// ─── Fulfillment API response shapes ─────────────────────────────────────────

interface FulfillmentLineItem {
  lineItemId:    string;
  title:         string;
  quantity:      number;
}

interface FulfillmentOrder {
  orderId:          string;
  creationDate:     string;
  buyer?:           { username: string };
  pricingSummary?:  { total?: { value: string; currency: string } };
  paymentStatus?:   string;
  fulfillmentStartInstructions?: Array<{ fulfillmentInstructionsType: string }>;
  lineItems:        FulfillmentLineItem[];
}

interface FulfillmentOrdersResponse {
  total?:  number;
  orders?: FulfillmentOrder[];
}

// ─── Register ─────────────────────────────────────────────────────────────────

export function registerOrderTools(server: McpServer): void {

  // ── ebay_get_orders ────────────────────────────────────────────────────────
  server.registerTool(
    'ebay_get_orders',
    {
      title:       'Get My eBay Orders',
      description: 'List recent eBay orders. Returns buyer info, total, payment status, and fulfillment status.',
      inputSchema: z.object({
        limit:        z.number().int().min(1).max(200).default(DEFAULT_LIMIT).describe('Results per page (default 20, max 200)'),
        offset:       z.number().int().min(0).default(0).describe('Pagination offset'),
        order_status: z.enum(['ACTIVE','AUTHENTICATED','CANCELLED','FULLY_REFUNDED','IN_CHECKOUT','INVALID','PENDING_SELLER_CONFIRMATION','SHIPPED','ALL']).default('ALL').describe('Filter by order status'),
        days_back:    z.number().int().min(1).max(90).default(30).describe('Orders from the last N days (max 90)'),
        format:       z.enum(['markdown','json']).default('markdown').describe('Output format'),
      }).strict(),
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      try {
        const cfg = getConfig();

        const params: Record<string, string> = {
          limit:  String(args.limit),
          offset: String(args.offset),
        };

        if (args.order_status !== 'ALL') params.ordersFulfillmentStatus = args.order_status;

        // Date filter: ISO 8601
        const fromDate = new Date(Date.now() - args.days_back * 86_400_000).toISOString();
        params.filter = `creationdate:[${fromDate}..]`;

        const data = await sellRequest<FulfillmentOrdersResponse>(
          cfg, 'GET',
          '/sell/fulfillment/v1/order',
          undefined,
          params,
        );

        const total  = data.total  ?? 0;
        const orders = data.orders ?? [];
        const hasMore = args.offset + orders.length < total;

        const mapped: OrderSummary[] = orders.map(o => ({
          orderId:     o.orderId,
          date:        o.creationDate,
          buyer:       o.buyer?.username ?? 'Unknown',
          total:       o.pricingSummary?.total ? `${o.pricingSummary.total.currency} ${o.pricingSummary.total.value}` : 'N/A',
          payment:     o.paymentStatus ?? 'Unknown',
          fulfillment: o.fulfillmentStartInstructions?.[0]?.fulfillmentInstructionsType ?? 'Unknown',
          items:       o.lineItems.map(li => ({
            lineItemId: li.lineItemId,
            title:      li.title,
            qty:        String(li.quantity),
          })),
        }));

        const result: PaginatedResult<OrderSummary> = {
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

        let md = `## My eBay Orders (last ${args.days_back} days)\n`;
        md += `Showing ${result.count} of ${result.total} orders\n\n`;

        for (const o of mapped) {
          md += `### Order \`${o.orderId}\`\n`;
          md += `- **Date:** ${o.date}\n`;
          md += `- **Buyer:** ${o.buyer}  |  **Total:** ${o.total}\n`;
          md += `- **Payment:** ${o.payment}  |  **Fulfillment:** ${o.fulfillment}\n`;
          md += `- **Items:**\n`;
          for (const it of o.items) {
            md += `  - ${it.title} × ${it.qty} (Line: \`${it.lineItemId}\`)\n`;
          }
          md += '\n';
        }

        if (result.has_more) md += `\n_More orders available. Use offset=${result.next_offset} to continue._\n`;

        return { content: [{ type: 'text', text: md.slice(0, CHARACTER_LIMIT) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: formatError(e) }], isError: true };
      }
    }
  );

  // ── ebay_get_order ─────────────────────────────────────────────────────────
  server.registerTool(
    'ebay_get_order',
    {
      title:       'Get eBay Order Details',
      description: 'Fetch full details of a single eBay order by order ID, including shipping address and line items.',
      inputSchema: z.object({
        order_id: z.string().min(1).describe('eBay order ID (from ebay_get_orders)'),
        format:   z.enum(['markdown','json']).default('markdown').describe('Output format'),
      }).strict(),
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      try {
        const cfg = getConfig();
        const data = await sellRequest<FulfillmentOrder>(
          cfg, 'GET',
          `/sell/fulfillment/v1/order/${encodeURIComponent(args.order_id)}`,
        );

        if (args.format === 'json') {
          return { content: [{ type: 'text', text: JSON.stringify(data, null, 2).slice(0, CHARACTER_LIMIT) }] };
        }

        // Type-cast to access raw JSON fields
        const raw = data as unknown as Record<string, unknown>;

        let md = `## Order \`${data.orderId}\`\n\n`;
        md += `- **Created:** ${data.creationDate}\n`;
        md += `- **Buyer:** ${data.buyer?.username ?? 'N/A'}\n`;

        if (data.pricingSummary?.total) {
          md += `- **Total:** ${data.pricingSummary.total.currency} ${data.pricingSummary.total.value}\n`;
        }
        md += `- **Payment Status:** ${data.paymentStatus ?? 'N/A'}\n`;

        // Shipping address
        const addr = raw.fulfillmentStartInstructions as Array<Record<string, unknown>> | undefined;
        if (addr?.[0]) {
          const inst = addr[0];
          const ship = inst.shippingStep as Record<string, unknown> | undefined;
          if (ship) {
            const shipTo = ship.shipTo as Record<string, unknown> | undefined;
            if (shipTo) {
              const contact = shipTo.fullName as string | undefined;
              const addrLine = (shipTo.primaryPhone as Record<string, unknown>)?.phoneNumber ?? '';
              const postal = shipTo.contactAddress as Record<string, unknown> | undefined;
              md += `\n### Ship To\n`;
              if (contact) md += `${contact}\n`;
              if (postal) {
                md += `${postal.addressLine1 ?? ''}\n`;
                if (postal.addressLine2) md += `${postal.addressLine2}\n`;
                md += `${postal.city ?? ''}, ${postal.stateOrProvince ?? ''} ${postal.postalCode ?? ''}\n`;
                md += `${postal.countryCode ?? ''}\n`;
              }
            }
          }
        }

        md += `\n### Line Items\n`;
        for (const li of data.lineItems) {
          md += `- **${li.title}** × ${li.quantity} (Line ID: \`${li.lineItemId}\`)\n`;
        }

        return { content: [{ type: 'text', text: md.slice(0, CHARACTER_LIMIT) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: formatError(e) }], isError: true };
      }
    }
  );

  // ── ebay_ship_order ────────────────────────────────────────────────────────
  server.registerTool(
    'ebay_ship_order',
    {
      title:       'Mark eBay Order as Shipped',
      description: 'Mark a line item as shipped with a tracking number. This notifies the buyer and marks the order fulfilled.',
      inputSchema: z.object({
        order_id:         z.string().min(1).describe('eBay order ID'),
        line_item_id:     z.string().min(1).describe('Line item ID within the order (from ebay_get_order)'),
        tracking_number:  z.string().min(1).describe('Carrier tracking number'),
        carrier_code:     z.enum([
          'USPS','UPS','FedEx','DHL','OnTrac','LaserShip','SEKO','Lasership',
          'DHL_EXPRESS_US','USPS_FCM','Other',
        ]).describe('Shipping carrier code'),
        shipped_date:     z.string().optional().describe('ISO 8601 ship date (default: now). E.g. "2024-01-15T10:00:00.000Z"'),
      }).strict(),
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async (args) => {
      try {
        const cfg = getConfig();

        const shippedDate = args.shipped_date ?? new Date().toISOString();

        const body = {
          lineItems: [{
            lineItemId: args.line_item_id,
            quantity:   1,
          }],
          shippingCarrierCode: args.carrier_code,
          trackingNumber:      args.tracking_number,
          shippedDate,
        };

        await sellRequest(
          cfg, 'POST',
          `/sell/fulfillment/v1/order/${encodeURIComponent(args.order_id)}/shipping_fulfillment`,
          body,
        );

        const md = `## ✅ Order Marked as Shipped\n\n`
          + `- **Order ID:** \`${args.order_id}\`\n`
          + `- **Tracking:** ${args.tracking_number}\n`
          + `- **Carrier:** ${args.carrier_code}\n`
          + `- **Shipped Date:** ${shippedDate}\n\n`
          + `The buyer has been notified automatically.`;

        return { content: [{ type: 'text', text: md }] };
      } catch (e) {
        return { content: [{ type: 'text', text: formatError(e) }], isError: true };
      }
    }
  );

  // ── ebay_get_seller_summary ────────────────────────────────────────────────
  server.registerTool(
    'ebay_get_seller_summary',
    {
      title:       'Get Seller Summary',
      description: 'Get a high-level summary of your eBay seller account: active listings count, sold items, total watchers.',
      inputSchema: z.object({}).strict(),
      annotations: { readOnlyHint: true },
    },
    async (_args) => {
      try {
        const cfg = getConfig();
        const xml = await tradingRequest(cfg, 'GetMyeBaySelling', `
  <ActiveList>
    <Include>true</Include>
    <Pagination><EntriesPerPage>1</EntriesPerPage><PageNumber>1</PageNumber></Pagination>
  </ActiveList>
  <SoldList>
    <Include>true</Include>
    <Pagination><EntriesPerPage>1</EntriesPerPage><PageNumber>1</PageNumber></Pagination>
    <DurationInDays>30</DurationInDays>
  </SoldList>
  <UnsoldList>
    <Include>true</Include>
    <Pagination><EntriesPerPage>1</EntriesPerPage><PageNumber>1</PageNumber></Pagination>
  </UnsoldList>
`);
        checkTradingAck(xml);

        const activeCount  = xmlVal(xml, 'TotalNumberOfEntries');
        const soldCountRaw = xmlAll(xml, 'TotalNumberOfEntries');
        const soldCount    = soldCountRaw[1] ?? '0';
        const unsoldCount  = soldCountRaw[2] ?? '0';

        let md = `## eBay Seller Summary\n\n`;
        md += `- **Active Listings:** ${activeCount || '0'}\n`;
        md += `- **Sold (last 30 days):** ${soldCount}\n`;
        md += `- **Unsold:** ${unsoldCount}\n`;

        return { content: [{ type: 'text', text: md }] };
      } catch (e) {
        return { content: [{ type: 'text', text: formatError(e) }], isError: true };
      }
    }
  );
}
