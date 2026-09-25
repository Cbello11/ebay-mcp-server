import { z } from '@/utils/effectSchema.js';

/** Input accepted by getActiveListings. */
export const getActiveListingsSchema = z.object({
  page: z.number().optional().describe('Page number, defaulting to 1'),
  entriesPerPage: z.number().optional().describe('Items per page, defaulting to 50'),
});

/** Input accepted by getListing. */
export const getListingSchema = z.object({
  itemId: z.string().describe('The eBay item ID to retrieve'),
});

/** Input accepted by createListing. */
export const createListingSchema = z.object({
  item: z.record(z.unknown()).describe('Trading API Item payload for AddFixedPriceItem'),
});

/** Input accepted by reviseListing. */
export const reviseListingSchema = z.object({
  itemId: z.string().describe('The eBay item ID to revise'),
  fields: z.record(z.unknown()).describe('Trading API Item fields to update'),
});

/** Input accepted by endListing. */
export const endListingSchema = z.object({
  itemId: z.string().describe('The eBay item ID to end'),
  reason: z
    .enum(['NotAvailable', 'Incorrect', 'LostOrBroken', 'OtherListingError', 'SellToHighBidder'])
    .optional()
    .describe('Trading API ending reason, defaulting to NotAvailable'),
});

/** Input accepted by relistItem. */
export const relistItemSchema = z.object({
  itemId: z.string().describe('The eBay item ID to relist'),
  modifications: z
    .record(z.unknown())
    .optional()
    .describe('Optional Trading API Item fields to change while relisting'),
});

/** Input accepted by uploadPicture. */
export const uploadPictureSchema = z.object({
  imagePath: z
    .string()
    .optional()
    .describe(
      'Absolute or relative path to an image file on the MCP server host. Only usable when the server shares a filesystem with you (local stdio). Supply exactly one of imagePath or imageUrl. Never send image data or Base64 through MCP.',
    ),
  imageUrl: z
    .string()
    .optional()
    .describe(
      'Public HTTPS URL of the image. The server downloads it directly, so this is the option that works against a remote/hosted MCP server. Supply exactly one of imagePath or imageUrl.',
    ),
  filename: z
    .string()
    .optional()
    .describe('Optional file name override. Defaults to the image file name.'),
  contentType: z
    .string()
    .optional()
    .describe('Optional image MIME type. Defaults from the file extension.'),
});

/** Input accepted by getStoreCategories. */
export const getStoreCategoriesSchema = z.object({});
