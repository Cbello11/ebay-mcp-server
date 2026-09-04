import { z } from '@/utils/effectSchema.js';

/**
 * Buy Browse API Schemas
 *
 * Effect-backed input schema for active-listing market/pricing search.
 */

/**
 * Validates input for ebay_search_active_listings (Buy Browse API item_summary/search).
 */
export const searchActiveListingsInputSchema = z.object({
  query: z.string().min(1).describe('Search keywords, e.g. "Crosley Harco reproduction radio"'),
  categoryId: z.string().optional().describe('Optional eBay category ID to restrict results to'),
  maxResults: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Maximum items to return (1-200). Defaults to 20.'),
  sort: z
    .string()
    .optional()
    .describe('Optional sort order, e.g. "price", "-price", "newlyListed", "endingSoonest"'),
});
