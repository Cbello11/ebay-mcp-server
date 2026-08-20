/**
 * Listing management tools — 7 tools
 *
 *  6. ebay_get_my_listings       — seller's active listings
 *  7. ebay_get_listing           — full detail on one listing
 *  8. ebay_create_listing        — create a new fixed-price listing (Inventory API)
 *  9. ebay_revise_listing        — update title/price/specifics/photos
 * 10. ebay_end_listing           — end a listing early
 * 11. ebay_get_promoted_listings — view Promoted Listings campaigns
 * 12. ebay_update_promoted_listing — adjust ad rate on a listing
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ebayGet, ebayPost, ebayPut, ebayDelete, getUserToken } from '../services/ebay-client.js';

export function registerListingTools(server: McpServer): void {

  // ── 6. Get my listings ────────────────────────────────────────────────────
  server.registerTool(
    'ebay_get_my_listings',
    {
      title: "Get My eBay Listings",
      description: `Returns the authenticated seller's active listings.

Args:
  - limit (number, optional): Results per page, 1–200 (default 50)
  - offset (number, optional): Pagination offset (default 0)
  - sku (string, optional): Filter by SKU

Returns: Array of active listings with title, SKU, price, quantity, and item ID.`,
      inputSchema: z.object({
        limit:  z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).default(0),
        sku:    z.string().optional().describe('Filter by SKU'),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ limit, offset, sku }) => {
      try {
        const token  = getUserToken();
        const params: Record<string, string | number | undefined> = { limit, offset };
        if (sku) params['sku'] = sku;

        const data = await ebayGet<Record<string, unknown>>(
          '/sell/inventory/v1/inventory_item', params, token
        );

        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { isError: true, content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }] };
      }
    }
  );

  // ── 7. Get one listing ────────────────────────────────────────────────────
  server.registerTool(
    'ebay_get_listing',
    {
      title: 'Get eBay Listing Detail',
      description: `Returns full details of a single eBay listing by item ID.

Includes title, description, price, category, item specifics, photos,
shipping options, and current bid/offer status.

Args:
  - item_id (string): The eBay item ID (e.g. "123456789012")

Returns: Complete listing data including all item specifics and photos.`,
      inputSchema: z.object({
        item_id: z.string().min(1).describe('eBay item ID'),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ item_id }) => {
      try {
        const data = await ebayGet<Record<string, unknown>>(
          `/buy/browse/v1/item/${item_id}`
        );
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { isError: true, content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }] };
      }
    }
  );

  // ── 8. Create listing ─────────────────────────────────────────────────────
  server.registerTool(
    'ebay_create_listing',
    {
      title: 'Create eBay Listing',
      description: `Creates a new fixed-price listing using the eBay Inventory API.

Three-step process: createOrReplaceInventoryItem → createOffer → publishOffer.
Requires seller user token and pre-configured business policies (payment,
fulfillment, return) plus an inventory location key.

Args:
  - sku (string): Your unique SKU, e.g. "VIN-20240818-001"
  - title (string): Listing title, max 80 characters (Cassini hard limit)
  - description (string): Full item description (HTML allowed)
  - category_id (string): eBay leaf category ID
  - price (number): Buy It Now price in USD
  - quantity (number): Available quantity (default 1)
  - condition (string): NEW | LIKE_NEW | EXCELLENT | VERY_GOOD | GOOD | ACCEPTABLE | FOR_PARTS_OR_NOT_WORKING
  - image_urls (string[]): Array of image URLs (first is primary)
  - item_specifics (object): Key-value pairs for item specifics, e.g. {"Brand": "Lodge", "Material": "Cast Iron"}
  - fulfillment_policy_id (string): eBay business policy ID for shipping
  - payment_policy_id (string): eBay business policy ID for payment
  - return_policy_id (string): eBay business policy ID for returns
  - merchant_location_key (string): Inventory location key from ebay_get_inventory_locations
  - best_offer (boolean, optional): Enable Best Offer (default false)

Returns: Published listing ID and URL.`,
      inputSchema: z.object({
        sku:                    z.string().min(1).describe('Your unique SKU'),
        title:                  z.string().min(1).max(80).describe('Title, max 80 chars'),
        description:            z.string().min(1).describe('Item description'),
        category_id:            z.string().min(1).describe('eBay leaf category ID'),
        price:                  z.number().positive().describe('Price in USD'),
        quantity:               z.number().int().min(1).default(1),
        condition:              z.enum(['NEW','LIKE_NEW','EXCELLENT','VERY_GOOD','GOOD','ACCEPTABLE','FOR_PARTS_OR_NOT_WORKING']),
        image_urls:             z.array(z.string().url()).min(1).describe('Image URLs, first is primary'),
        item_specifics:         z.record(z.string()).optional().describe('Item specifics key-value pairs'),
        fulfillment_policy_id:  z.string().min(1),
        payment_policy_id:      z.string().min(1),
        return_policy_id:       z.string().min(1),
        merchant_location_key:  z.string().min(1),
        best_offer:             z.boolean().default(false),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ sku, title, description, category_id, price, quantity, condition,
             image_urls, item_specifics, fulfillment_policy_id, payment_policy_id,
             return_policy_id, merchant_location_key, best_offer }) => {
      try {
        const token = getUserToken();

        // Step 1: Create/replace inventory item
        await ebayPut(
          `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`,
          {
            availability: { shipToLocationAvailability: { quantity } },
            condition,
            product: {
              title,
              description,
              imageUrls: image_urls,
              aspects: item_specifics
                ? Object.fromEntries(
                    Object.entries(item_specifics).map(([k, v]) => [k, [v]])
                  )
                : undefined,
            },
          },
          token
        );

        // Step 2: Create offer
        const offerBody: Record<string, unknown> = {
          sku,
          marketplaceId:       'EBAY_US',
          format:              'FIXED_PRICE',
          categoryId:          category_id,
          listingDescription:  description,
          availableQuantity:   quantity,
          pricingSummary: {
            price: { value: price.toFixed(2), currency: 'USD' },
          },
          listingPolicies: {
            fulfillmentPolicyId: fulfillment_policy_id,
            paymentPolicyId:     payment_policy_id,
            returnPolicyId:      return_policy_id,
          },
          merchantLocationKey: merchant_location_key,
        };

        if (best_offer) {
          offerBody['listingPolicies'] = {
            ...(offerBody['listingPolicies'] as object),
            bestOfferTerms: { bestOfferEnabled: true },
          };
        }

        const offerResp = await ebayPost<Record<string, unknown>>(
          '/sell/inventory/v1/offer', offerBody, token
        );
        const offerId = offerResp['offerId'] as string;

        // Step 3: Publish offer
        const pubResp = await ebayPost<Record<string, unknown>>(
          `/sell/inventory/v1/offer/${offerId}/publish`, {}, token
        );

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success:    true,
              listing_id: pubResp['listingId'],
              offer_id:   offerId,
              sku,
              url:        `https://www.ebay.com/itm/${pubResp['listingId']}`,
            }, null, 2),
          }],
        };
      } catch (err) {
        return { isError: true, content: [{ type: 'text' as const, text: `Error creating listing: ${(err as Error).message}` }] };
      }
    }
  );

  // ── 9. Revise listing ─────────────────────────────────────────────────────
  server.registerTool(
    'ebay_revise_listing',
    {
      title: 'Revise eBay Listing',
      description: `Updates an existing eBay listing via the Inventory API.
Updates the inventory item record (title, description, images, specifics)
and/or the offer record (price, quantity).

Args:
  - sku (string): The SKU of the listing to revise
  - title (string, optional): New title, max 80 chars
  - description (string, optional): New description
  - price (number, optional): New price in USD
  - quantity (number, optional): New available quantity
  - image_urls (string[], optional): New image URLs (replaces all current images)
  - item_specifics (object, optional): Updated item specifics key-value pairs
  - offer_id (string, optional): Offer ID (required for price/quantity updates)

Returns: Confirmation of fields updated.`,
      inputSchema: z.object({
        sku:            z.string().min(1),
        title:          z.string().max(80).optional(),
        description:    z.string().optional(),
        price:          z.number().positive().optional(),
        quantity:       z.number().int().min(0).optional(),
        image_urls:     z.array(z.string().url()).optional(),
        item_specifics: z.record(z.string()).optional(),
        offer_id:       z.string().optional().describe('Required for price or quantity updates'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ sku, title, description, price, quantity, image_urls, item_specifics, offer_id }) => {
      try {
        const token   = getUserToken();
        const updated: string[] = [];

        // Update inventory item if product fields changed
        if (title || description || image_urls || item_specifics) {
          const current = await ebayGet<Record<string, unknown>>(
            `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, {}, token
          );
          const product = (current['product'] as Record<string, unknown>) ?? {};

          await ebayPut(
            `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`,
            {
              ...current,
              product: {
                ...product,
                ...(title       ? { title }                                           : {}),
                ...(description ? { description }                                    : {}),
                ...(image_urls  ? { imageUrls: image_urls }                          : {}),
                ...(item_specifics
                  ? { aspects: Object.fromEntries(Object.entries(item_specifics).map(([k, v]) => [k, [v]])) }
                  : {}),
              },
            },
            token
          );
          if (title)          updated.push('title');
          if (description)    updated.push('description');
          if (image_urls)     updated.push('images');
          if (item_specifics) updated.push('item_specifics');
        }

        // Update offer if price or quantity changed
        if ((price !== undefined || quantity !== undefined) && offer_id) {
          const currentOffer = await ebayGet<Record<string, unknown>>(
            `/sell/inventory/v1/offer/${offer_id}`, {}, token
          );
          const pricingSummary = (currentOffer['pricingSummary'] as Record<string, unknown>) ?? {};

          await ebayPut(
            `/sell/inventory/v1/offer/${offer_id}`,
            {
              ...currentOffer,
              ...(price !== undefined
                ? { pricingSummary: { ...pricingSummary, price: { value: price.toFixed(2), currency: 'USD' } } }
                : {}),
              ...(quantity !== undefined ? { availableQuantity: quantity } : {}),
            },
            token
          );
          if (price !== undefined)    updated.push('price');
          if (quantity !== undefined) updated.push('quantity');
        }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: true, sku, updated_fields: updated }, null, 2),
          }],
        };
      } catch (err) {
        return { isError: true, content: [{ type: 'text' as const, text: `Error revising listing: ${(err as Error).message}` }] };
      }
    }
  );

  // ── 10. End listing ───────────────────────────────────────────────────────
  server.registerTool(
    'ebay_end_listing',
    {
      title: 'End eBay Listing Early',
      description: `Ends an active eBay listing before its natural expiry using the Inventory API.
This removes the listing from eBay search immediately.

Args:
  - offer_id (string): The offer ID to end (get from ebay_get_my_listings)
  - reason (string): Reason for ending — OUT_OF_STOCK | ITEM_SOLD | INCORRECT_PRICE | ITEM_LOST_OR_BROKEN

Returns: Confirmation with offer ID and reason.`,
      inputSchema: z.object({
        offer_id: z.string().min(1).describe('Offer ID to end'),
        reason:   z.enum(['OUT_OF_STOCK','ITEM_SOLD','INCORRECT_PRICE','ITEM_LOST_OR_BROKEN'])
                   .describe('Reason for ending the listing'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ offer_id, reason }) => {
      try {
        const token = getUserToken();
        await ebayDelete(`/sell/inventory/v1/offer/${offer_id}`, token);
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: true, offer_id, reason, message: 'Listing ended.' }, null, 2),
          }],
        };
      } catch (err) {
        return { isError: true, content: [{ type: 'text' as const, text: `Error ending listing: ${(err as Error).message}` }] };
      }
    }
  );

  // ── 11. Get promoted listings ─────────────────────────────────────────────
  server.registerTool(
    'ebay_get_promoted_listings',
    {
      title: 'Get Promoted Listings Campaigns',
      description: `Returns all Promoted Listings Standard campaigns for the seller account.

Shows campaign names, status (RUNNING/PAUSED/ENDED), ad rates, and budget.
Use this to audit current promotion spend and identify unlisted items.

Args:
  - limit (number, optional): Results per page, 1–200 (default 50)
  - offset (number, optional): Pagination offset

Returns: Array of campaigns with status, ad rate, and start/end dates.`,
      inputSchema: z.object({
        limit:  z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).default(0),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ limit, offset }) => {
      try {
        const token = getUserToken();
        const data  = await ebayGet<Record<string, unknown>>(
          '/sell/marketing/v1/ad_campaign',
          { limit, offset },
          token
        );
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { isError: true, content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }] };
      }
    }
  );

  // ── 12. Update promoted listing ad rate ───────────────────────────────────
  server.registerTool(
    'ebay_update_promoted_listing',
    {
      title: 'Update Promoted Listing Ad Rate',
      description: `Updates the ad rate (bid percentage) for a specific listing within a
Promoted Listings Standard campaign.

Args:
  - campaign_id (string): Campaign ID (from ebay_get_promoted_listings)
  - ad_id (string): The ad ID for the specific listing within the campaign
  - bid_percentage (number): New bid percentage, 1–20 (e.g. 13 = 13%)

Returns: Confirmation with updated ad rate.`,
      inputSchema: z.object({
        campaign_id:    z.string().min(1),
        ad_id:          z.string().min(1),
        bid_percentage: z.number().min(1).max(20).describe('Ad rate percentage, e.g. 13 for 13%'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ campaign_id, ad_id, bid_percentage }) => {
      try {
        const token = getUserToken();
        await ebayPut(
          `/sell/marketing/v1/ad_campaign/${campaign_id}/ad/${ad_id}`,
          { bidPercentage: bid_percentage.toString() },
          token
        );
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: true, campaign_id, ad_id, new_bid_percentage: bid_percentage }, null, 2),
          }],
        };
      } catch (err) {
        return { isError: true, content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }] };
      }
    }
  );
}
