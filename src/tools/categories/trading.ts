import { defineTool } from '@/tools/defineTool.js';
import type { ToolEntry } from '@/tools/registry.js';
import {
  createListingSchema,
  endListingSchema,
  getActiveListingsSchema,
  getListingSchema,
  getStoreCategoriesSchema,
  relistItemSchema,
  reviseListingSchema,
  uploadPictureSchema,
} from '@/utils/trading/trading.js';
import { Effect } from 'effect';

/** Trading API tools for fixed-price listing operations. */
export const tradingEntries: ToolEntry[] = [
  defineTool({
    name: 'ebay_get_active_listings',
    description:
      'Get all active fixed-price listings with SKU, quantity, price, and watch count.\n\nUses the Trading API (GetMyeBaySelling). Returns listings created via any method (UI, Trading API, or REST API).\n\nRequired: User OAuth token.',
    inputSchema: getActiveListingsSchema.shape,
    annotations: { readOnlyHint: true },
    handler: (api, args) => Effect.runPromise(api.trading.getActiveListings(args)),
  }),
  defineTool({
    name: 'ebay_get_listing',
    description:
      'Get full details for a single listing by item ID.\n\nUses the Trading API (GetItem). Returns all listing fields including description, specifics, shipping, and images.\n\nRequired: User OAuth token.',
    inputSchema: getListingSchema.shape,
    annotations: { readOnlyHint: true },
    handler: (api, args) => Effect.runPromise(api.trading.getListing(args)),
  }),
  defineTool({
    name: 'ebay_create_listing',
    description:
      'Create a new fixed-price listing.\n\nUses the Trading API (AddFixedPriceItem). Requires complete item details.\n\nBUSINESS POLICIES (required for this seller account): Do NOT use legacy fields ShippingDetails, PaymentMethods, or ReturnPolicy. Instead pass policy IDs under SellerProfiles:\n- SellerProfiles.SellerShippingProfile.ShippingProfileID\n- SellerProfiles.SellerPaymentProfile.PaymentProfileID\n- SellerProfiles.SellerReturnProfile.ReturnProfileID\n\nRetrieve your policy IDs via the ebay_get_fulfillment_policies, ebay_get_payment_policies, and ebay_get_return_policies tools.\n\nRequired: User OAuth token.',
    inputSchema: createListingSchema.shape,
    annotations: { readOnlyHint: false },
    handler: (api, args) => Effect.runPromise(api.trading.createListing(args)),
  }),
  defineTool({
    name: 'ebay_revise_listing',
    description:
      'Revise an existing fixed-price listing. Update quantity, price, title, description, or any other field.\n\nUses the Trading API (ReviseItem). Only send the fields you want to change.\n\nExamples:\n- Update quantity: { "Quantity": 10 }\n- Update price: { "StartPrice": 14.99 }\n- Update title: { "Title": "New Title" }\n- Multiple fields: { "Quantity": 10, "StartPrice": 14.99 }\n\nBUSINESS POLICIES (required for this seller account): Do NOT use legacy fields ShippingDetails, PaymentMethods, or ReturnPolicy. eBay will reject them with error 21919456. To update shipping/payment/return policies pass policy IDs under SellerProfiles:\n- SellerProfiles.SellerShippingProfile.ShippingProfileID\n- SellerProfiles.SellerPaymentProfile.PaymentProfileID\n- SellerProfiles.SellerReturnProfile.ReturnProfileID\n\nRetrieve your policy IDs via the ebay_get_fulfillment_policies, ebay_get_payment_policies, and ebay_get_return_policies tools.\n\nRequired: User OAuth token.',
    inputSchema: reviseListingSchema.shape,
    annotations: { readOnlyHint: false },
    handler: (api, args) => Effect.runPromise(api.trading.reviseListing(args)),
  }),
  defineTool({
    name: 'ebay_end_listing',
    description:
      'End/remove an active fixed-price listing.\n\nUses the Trading API (EndFixedPriceItem).\n\nRequired: User OAuth token.',
    inputSchema: endListingSchema.shape,
    annotations: { readOnlyHint: false, destructiveHint: true },
    handler: (api, args) => Effect.runPromise(api.trading.endListing(args)),
  }),
  defineTool({
    name: 'ebay_relist_item',
    description:
      'Relist an ended fixed-price listing, optionally with modifications.\n\nUses the Trading API (RelistFixedPriceItem).\n\nRequired: User OAuth token.',
    inputSchema: relistItemSchema.shape,
    annotations: { readOnlyHint: false },
    handler: (api, args) => Effect.runPromise(api.trading.relistItem(args)),
  }),
  defineTool({
    name: 'ebay_upload_site_hosted_picture',
    description:
      'Upload an image to eBay Picture Services (EPS) and get back a permanent https://i.ebayimg.com URL.\n\nUses the Trading API (UploadSiteHostedPictures) with a multipart image upload. Use the returned URL in PictureDetails.PictureURL on ebay_create_listing / ebay_revise_listing so eBay hosts the image itself instead of linking to a third-party host, which can go missing later.\n\nRequired: User OAuth token.',
    inputSchema: uploadPictureSchema.shape,
    annotations: { readOnlyHint: false },
    handler: (api, args) => Effect.runPromise(api.trading.uploadPicture(args)),
  }),
  defineTool({
    name: 'ebay_get_store_categories',
    description:
      'Get the seller\'s eBay Store custom category tree (the folders offered under "Store category" when creating/revising a listing).\n\nUses the Trading API (GetStore, CategoryStructureOnly). Returns Store.CustomCategories.CustomCategory, each with CategoryID, Name, and optional nested ChildCategory entries. Use a CategoryID here as Storefront.StoreCategoryID in ebay_create_listing / ebay_revise_listing.\n\nRequired: User OAuth token.',
    inputSchema: getStoreCategoriesSchema.shape,
    annotations: { readOnlyHint: true },
    handler: (api) => Effect.runPromise(api.trading.getStoreCategories()),
  }),
];
