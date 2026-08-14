/**
 * Listing tools — Trading API (XML) for full seller control.
 */

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  tradingRequest, xmlVal, xmlAll, checkTradingAck,
  getConfig, formatError,
} from '../services/ebay-client.js';
import { CHARACTER_LIMIT, DEFAULT_LIMIT, CONDITION_NAMES } from '../constants.js';
import type { ListingSummary, PaginatedResult } from '../types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function conditionName(id: string): string {
  return CONDITION_NAMES[id] ?? `Condition ${id}`;
}

// ─── Register ─────────────────────────────────────────────────────────────────

export function registerListingTools(server: McpServer): void {

  // ── ebay_get_my_listings ───────────────────────────────────────────────────
  server.registerTool(
    'ebay_get_my_listings',
    {
      title:       'Get My eBay Listings',
      description: 'List your active eBay listings with price, quantity, watchers, and time remaining.',
      inputSchema: z.object({
        limit:    z.number().int().min(1).max(200).default(DEFAULT_LIMIT).describe('Results per page (default 20, max 200)'),
        page:     z.number().int().min(1).default(1).describe('Page number (default 1)'),
        format:   z.enum(['markdown','json']).default('markdown').describe('Output format'),
      }).strict(),
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      try {
        const cfg = getConfig();
        const xml = await tradingRequest(cfg, 'GetMyeBaySelling', `
  <ActiveList>
    <Include>true</Include>
    <Pagination>
      <EntriesPerPage>${args.limit}</EntriesPerPage>
      <PageNumber>${args.page}</PageNumber>
    </Pagination>
    <Sort>TimeLeft</Sort>
  </ActiveList>
`);
        checkTradingAck(xml);

        const totalEntries = parseInt(xmlVal(xml, 'TotalNumberOfEntries') || '0', 10);
        const totalPages   = parseInt(xmlVal(xml, 'TotalNumberOfPages')   || '1', 10);

        // Each <ItemType> block under <ActiveList>
        const itemBlocks = xmlAll(xml, 'ItemType');
        const listings: ListingSummary[] = itemBlocks.map(block => ({
          itemId:   xmlVal(block, 'ItemID'),
          title:    xmlVal(block, 'Title'),
          price:    xmlVal(block, 'CurrentPrice') || xmlVal(block, 'StartPrice'),
          quantity: xmlVal(block, 'QuantityAvailable') || xmlVal(block, 'Quantity'),
          watchers: xmlVal(block, 'WatchCount'),
          timeLeft: xmlVal(block, 'TimeLeft').replace('PT', '').replace('H', 'h ').replace('M', 'm').trim(),
        }));

        const result: PaginatedResult<ListingSummary> = {
          total:       totalEntries,
          count:       listings.length,
          offset:      (args.page - 1) * args.limit,
          has_more:    args.page < totalPages,
          next_offset: args.page < totalPages ? args.page + 1 : undefined,
          items:       listings,
        };

        if (args.format === 'json') {
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2).slice(0, CHARACTER_LIMIT) }] };
        }

        let md = `## My Active Listings (page ${args.page} of ${totalPages})\n`;
        md += `Total: ${totalEntries} listings\n\n`;

        for (const l of listings) {
          md += `### ${l.title}\n`;
          md += `- **Item ID:** \`${l.itemId}\`\n`;
          md += `- **Price:** $${l.price}  |  **Qty:** ${l.quantity}  |  **Watchers:** ${l.watchers || '0'}\n`;
          md += `- **Time Left:** ${l.timeLeft || 'N/A'}\n\n`;
        }

        if (result.has_more) md += `\n_More pages available. Use page=${Number(result.next_offset)} to continue._\n`;

        return { content: [{ type: 'text', text: md.slice(0, CHARACTER_LIMIT) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: formatError(e) }], isError: true };
      }
    }
  );

  // ── ebay_get_listing ───────────────────────────────────────────────────────
  server.registerTool(
    'ebay_get_listing',
    {
      title:       'Get eBay Listing Details',
      description: 'Fetch full details for a specific eBay listing by item ID.',
      inputSchema: z.object({
        item_id: z.string().min(1).describe('eBay item ID (e.g. "123456789012")'),
        format:  z.enum(['markdown','json']).default('markdown').describe('Output format'),
      }).strict(),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) => {
      try {
        const cfg = getConfig();
        const xml = await tradingRequest(cfg, 'GetItem', `
  <ItemID>${args.item_id}</ItemID>
  <DetailLevel>ReturnAll</DetailLevel>
`);
        checkTradingAck(xml);

        const item = {
          itemId:       xmlVal(xml, 'ItemID'),
          title:        xmlVal(xml, 'Title'),
          description:  xmlVal(xml, 'Description').slice(0, 1000),
          price:        xmlVal(xml, 'CurrentPrice') || xmlVal(xml, 'StartPrice'),
          currency:     xmlVal(xml, 'CurrencyID'),
          quantity:     xmlVal(xml, 'Quantity'),
          quantityAvail:xmlVal(xml, 'QuantityAvailable'),
          conditionId:  xmlVal(xml, 'ConditionID'),
          conditionName:xmlVal(xml, 'ConditionDisplayName'),
          categoryId:   xmlVal(xml, 'CategoryID'),
          categoryName: xmlVal(xml, 'CategoryName'),
          listingType:  xmlVal(xml, 'ListingType'),
          status:       xmlVal(xml, 'ListingStatus'),
          startTime:    xmlVal(xml, 'StartTime'),
          endTime:      xmlVal(xml, 'EndTime'),
          viewUrl:      xmlVal(xml, 'ViewItemURL'),
          watchers:     xmlVal(xml, 'WatchCount'),
          hits:         xmlVal(xml, 'HitCount'),
          sellerNote:   xmlVal(xml, 'SellerInventoryID'),
          location:     xmlVal(xml, 'Location'),
          shippingType: xmlVal(xml, 'ShippingType'),
        };

        if (args.format === 'json') {
          return { content: [{ type: 'text', text: JSON.stringify(item, null, 2).slice(0, CHARACTER_LIMIT) }] };
        }

        let md = `## ${item.title}\n\n`;
        md += `- **Item ID:** \`${item.itemId}\`\n`;
        md += `- **Status:** ${item.status}  |  **Type:** ${item.listingType}\n`;
        md += `- **Price:** ${item.currency} ${item.price}\n`;
        md += `- **Quantity:** ${item.quantity} listed, ${item.quantityAvail} available\n`;
        md += `- **Condition:** ${item.conditionName || conditionName(item.conditionId)} (${item.conditionId})\n`;
        md += `- **Category:** ${item.categoryName} (${item.categoryId})\n`;
        md += `- **Location:** ${item.location}\n`;
        md += `- **Shipping:** ${item.shippingType}\n`;
        md += `- **Start:** ${item.startTime}  |  **End:** ${item.endTime}\n`;
        md += `- **Watchers:** ${item.watchers || '0'}  |  **Views:** ${item.hits || '0'}\n`;
        if (item.viewUrl) md += `- [View Listing](${item.viewUrl})\n`;
        if (item.description) {
          md += `\n### Description (preview)\n${item.description.slice(0, 500)}${item.description.length > 500 ? '…' : ''}\n`;
        }

        return { content: [{ type: 'text', text: md.slice(0, CHARACTER_LIMIT) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: formatError(e) }], isError: true };
      }
    }
  );

  // ── ebay_create_listing ────────────────────────────────────────────────────
  server.registerTool(
    'ebay_create_listing',
    {
      title:       'Create eBay Listing',
      description: 'Create a new eBay listing (Fixed Price or Auction). Use ebay_get_categories first to find the correct category ID.',
      inputSchema: z.object({
        title:               z.string().min(1).max(80).describe('Listing title (max 80 chars)'),
        description:         z.string().min(1).describe('Item description (HTML allowed)'),
        category_id:         z.string().min(1).describe('eBay category ID — use ebay_get_categories to find it'),
        start_price:         z.number().positive().describe('Starting price in USD (for auctions) or fixed price'),
        buy_it_now_price:    z.number().positive().optional().describe('Buy It Now price for auction listings (optional)'),
        condition_id:        z.enum(['1000','1500','2000','2500','3000','7000']).describe('Condition: 1000=New, 1500=New Other, 2000=Mfr Refurb, 2500=Seller Refurb, 3000=Used, 7000=For Parts'),
        quantity:            z.number().int().positive().default(1).describe('Quantity available (default 1)'),
        listing_type:        z.enum(['FixedPriceItem','Chinese']).default('FixedPriceItem').describe('FixedPriceItem (Buy It Now) or Chinese (auction)'),
        listing_duration:    z.enum(['Days_3','Days_5','Days_7','Days_10','Days_30','GTC']).default('GTC').describe('Listing duration. GTC = Good Till Cancelled (FixedPrice only)'),
        shipping_service:    z.string().default('USPSMedia').describe('Shipping service code (e.g. USPSFirstClass, UPSGround, FedExHomeDelivery)'),
        shipping_cost:       z.number().min(0).default(0).describe('Shipping cost in USD (0 = free shipping)'),
        location:            z.string().default('United States').describe('Item location description'),
        postal_code:         z.string().optional().describe('Postal code for item location (recommended)'),
        payment_methods:     z.array(z.string()).default(['PayPal']).describe('Payment methods (default: PayPal)'),
        paypal_email:        z.string().email().optional().describe('PayPal email address (required if PayPal is payment method)'),
        returns_accepted:    z.boolean().default(true).describe('Accept returns (default true)'),
        return_period:       z.enum(['Days_14','Days_30','Days_60']).default('Days_30').describe('Return period (default 30 days)'),
        return_shipping_paid_by: z.enum(['Buyer','Seller']).default('Buyer').describe('Who pays return shipping'),
        picture_urls:        z.array(z.string().url()).max(12).optional().describe('Up to 12 image URLs'),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async (args) => {
      try {
        const cfg = getConfig();

        const pictures = args.picture_urls?.length
          ? `<PictureDetails>${args.picture_urls.map(u => `<PictureURL>${u}</PictureURL>`).join('')}</PictureDetails>`
          : '';

        const paymentXml = args.payment_methods.map(m => `<PaymentMethods>${m}</PaymentMethods>`).join('');
        const paypalXml  = args.paypal_email ? `<PayPalEmailAddress>${args.paypal_email}</PayPalEmailAddress>` : '';

        const buyNowXml = (args.listing_type === 'Chinese' && args.buy_it_now_price)
          ? `<BuyItNowPrice currencyID="USD">${args.buy_it_now_price.toFixed(2)}</BuyItNowPrice>`
          : '';

        const returnsXml = `
  <ReturnPolicy>
    <ReturnsAcceptedOption>${args.returns_accepted ? 'ReturnsAccepted' : 'ReturnsNotAccepted'}</ReturnsAcceptedOption>
    ${args.returns_accepted ? `<ReturnsWithinOption>${args.return_period}</ReturnsWithinOption><ShippingCostPaidByOption>${args.return_shipping_paid_by}</ShippingCostPaidByOption>` : ''}
  </ReturnPolicy>`;

        const postalXml = args.postal_code ? `<PostalCode>${args.postal_code}</PostalCode>` : '';

        const body = `
  <Item>
    <Title>${args.title}</Title>
    <Description><![CDATA[${args.description}]]></Description>
    <PrimaryCategory><CategoryID>${args.category_id}</CategoryID></PrimaryCategory>
    <StartPrice currencyID="USD">${args.start_price.toFixed(2)}</StartPrice>
    ${buyNowXml}
    <ConditionID>${args.condition_id}</ConditionID>
    <Country>US</Country>
    <Currency>USD</Currency>
    <DispatchTimeMax>3</DispatchTimeMax>
    <ListingDuration>${args.listing_duration}</ListingDuration>
    <ListingType>${args.listing_type}</ListingType>
    <Location>${args.location}</Location>
    ${postalXml}
    <Quantity>${args.quantity}</Quantity>
    ${paymentXml}
    ${paypalXml}
    <ShippingDetails>
      <ShippingServiceOptions>
        <ShippingServicePriority>1</ShippingServicePriority>
        <ShippingService>${args.shipping_service}</ShippingService>
        <ShippingServiceCost currencyID="USD">${args.shipping_cost.toFixed(2)}</ShippingServiceCost>
      </ShippingServiceOptions>
    </ShippingDetails>
    ${returnsXml}
    ${pictures}
  </Item>
`;

        const xml = await tradingRequest(cfg, 'AddItem', body);
        checkTradingAck(xml);

        const itemId   = xmlVal(xml, 'ItemID');
        const startTime = xmlVal(xml, 'StartTime');
        const endTime   = xmlVal(xml, 'EndTime');
        const fees      = xmlVal(xml, 'Amount');

        let md = `## ✅ Listing Created Successfully!\n\n`;
        md += `- **Item ID:** \`${itemId}\`\n`;
        md += `- **Title:** ${args.title}\n`;
        md += `- **Price:** $${args.start_price.toFixed(2)}\n`;
        md += `- **Start:** ${startTime}\n`;
        md += `- **End:** ${endTime}\n`;
        if (fees) md += `- **eBay Fee:** $${fees}\n`;
        md += `\n[View Listing on eBay](https://www.ebay.com/itm/${itemId})\n`;

        return { content: [{ type: 'text', text: md }] };
      } catch (e) {
        return { content: [{ type: 'text', text: formatError(e) }], isError: true };
      }
    }
  );

  // ── ebay_revise_listing ────────────────────────────────────────────────────
  server.registerTool(
    'ebay_revise_listing',
    {
      title:       'Revise eBay Listing',
      description: 'Update an existing eBay listing. Only provided fields are changed.',
      inputSchema: z.object({
        item_id:          z.string().min(1).describe('eBay item ID to revise'),
        title:            z.string().min(1).max(80).optional().describe('New title (max 80 chars)'),
        description:      z.string().optional().describe('New description (HTML allowed)'),
        price:            z.number().positive().optional().describe('New price in USD'),
        quantity:         z.number().int().positive().optional().describe('New quantity'),
        shipping_cost:    z.number().min(0).optional().describe('New shipping cost in USD'),
        picture_urls:     z.array(z.string().url()).max(12).optional().describe('Replace all pictures with these URLs (up to 12)'),
      }).strict(),
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async (args) => {
      try {
        const cfg = getConfig();

        const parts: string[] = [`<ItemID>${args.item_id}</ItemID>`];
        if (args.title)       parts.push(`<Title>${args.title}</Title>`);
        if (args.description) parts.push(`<Description><![CDATA[${args.description}]]></Description>`);
        if (args.price)       parts.push(`<StartPrice currencyID="USD">${args.price.toFixed(2)}</StartPrice>`);
        if (args.quantity)    parts.push(`<Quantity>${args.quantity}</Quantity>`);
        if (args.shipping_cost !== undefined) {
          parts.push(`
<ShippingDetails>
  <ShippingServiceOptions>
    <ShippingServicePriority>1</ShippingServicePriority>
    <ShippingServiceCost currencyID="USD">${args.shipping_cost.toFixed(2)}</ShippingServiceCost>
  </ShippingServiceOptions>
</ShippingDetails>`);
        }
        if (args.picture_urls?.length) {
          parts.push(`<PictureDetails>${args.picture_urls.map(u => `<PictureURL>${u}</PictureURL>`).join('')}</PictureDetails>`);
        }

        const xml = await tradingRequest(cfg, 'ReviseItem', `<Item>${parts.join('\n')}</Item>`);
        checkTradingAck(xml);

        const itemId = xmlVal(xml, 'ItemID');
        const endTime = xmlVal(xml, 'EndTime');

        let md = `## ✅ Listing Revised\n\n`;
        md += `- **Item ID:** \`${itemId}\`\n`;
        if (endTime) md += `- **Ends:** ${endTime}\n`;
        md += `\n[View Updated Listing](https://www.ebay.com/itm/${itemId})\n`;

        return { content: [{ type: 'text', text: md }] };
      } catch (e) {
        return { content: [{ type: 'text', text: formatError(e) }], isError: true };
      }
    }
  );

  // ── ebay_end_listing ───────────────────────────────────────────────────────
  server.registerTool(
    'ebay_end_listing',
    {
      title:       'End eBay Listing',
      description: 'End an active eBay listing early. Requires a reason.',
      inputSchema: z.object({
        item_id: z.string().min(1).describe('eBay item ID to end'),
        reason:  z.enum([
          'Sold',
          'LostOrBroken',
          'NotAvailableAnymore',
          'OtherListingError',
          'CustomCode',
        ]).describe('Reason for ending: Sold, LostOrBroken, NotAvailableAnymore, OtherListingError'),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async (args) => {
      try {
        const cfg = getConfig();
        const xml = await tradingRequest(cfg, 'EndItem', `
  <ItemID>${args.item_id}</ItemID>
  <EndingReason>${args.reason}</EndingReason>
`);
        checkTradingAck(xml);

        const endTime = xmlVal(xml, 'EndTime');

        let md = `## ✅ Listing Ended\n\n`;
        md += `- **Item ID:** \`${args.item_id}\`\n`;
        md += `- **Reason:** ${args.reason}\n`;
        if (endTime) md += `- **Ended at:** ${endTime}\n`;

        return { content: [{ type: 'text', text: md }] };
      } catch (e) {
        return { content: [{ type: 'text', text: formatError(e) }], isError: true };
      }
    }
  );
}
