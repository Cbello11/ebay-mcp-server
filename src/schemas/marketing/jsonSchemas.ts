/**
 * Marketing JSON Schema conversion helpers (MCP / tooling).
 */

import { z } from '@/utils/effectSchema.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  amountSchema,
  errorSchema,
  findListingRecommendationsInputSchema,
  listingRecommendationSchema,
  pagedListingRecommendationCollectionSchema,
} from './common.js';
import {
  campaignPagedCollectionResponseSchema,
  campaignSchema,
  cloneCampaignRequestSchema,
  createCampaignRequestSchema,
  quickSetupRequestSchema,
  suggestBudgetResponseSchema,
  suggestMaxCpcRequestSchema,
  suggestMaxCpcResponseSchema,
  suggestedBidsSchema,
  suggestedKeywordsSchema,
  updateBidPercentageRequestSchema,
  updateCampaignBudgetRequestSchema,
  updateCampaignRequestSchema,
} from './campaigns.js';
import {
  adGroupPagedCollectionResponseSchema,
  adGroupSchema,
  adPagedCollectionResponseSchema,
  adResponseSchema,
  adSchema,
  bulkAdResponseSchema,
  bulkCreateAdRequestSchema,
  bulkCreateKeywordRequestSchema,
  bulkCreateKeywordResponseSchema,
  bulkCreateNegativeKeywordRequestSchema,
  bulkCreateNegativeKeywordResponseSchema,
  bulkDeleteAdRequestSchema,
  bulkUpdateAdStatusRequestSchema,
  bulkUpdateKeywordRequestSchema,
  createAdGroupRequestSchema,
  createAdRequestSchema,
  createAdsByInventoryReferenceRequestSchema,
  createAdsByInventoryReferenceResponseSchema,
  createKeywordRequestSchema,
  createNegativeKeywordRequestSchema,
  keywordPagedCollectionResponseSchema,
  keywordResponseSchema,
  keywordSchema,
  negativeKeywordPagedCollectionResponseSchema,
  negativeKeywordResponseSchema,
  negativeKeywordSchema,
  updateAdGroupRequestSchema,
  updateAdStatusRequestSchema,
  updateKeywordRequestSchema,
  updateNegativeKeywordRequestSchema,
} from './ads.js';
import {
  createReportTaskSchema,
  reportMetadatasSchema,
  reportTaskPagedCollectionSchema,
  reportTaskSchema,
  summaryReportResponseSchema,
} from './reports.js';
import {
  createEmailCampaignRequestSchema,
  createEmailCampaignResponseSchema,
  getEmailCampaignAudiencesResponseSchema,
  getEmailCampaignResponseSchema,
  getEmailCampaignsResponseSchema,
  getEmailPreviewResponseSchema,
  getEmailReportResponseSchema,
  itemPriceMarkdownSchema,
  itemPromotionResponseSchema,
  itemPromotionSchema,
  itemsPagedCollectionSchema,
  promotionsPagedCollectionSchema,
  promotionsReportPagedCollectionSchema,
} from './promotions.js';

/**
 * Converts Marketing API Effect-backed schemas to JSON Schema format for MCP tools.
 *
 * @returns Marketing API JSON schemas keyed by endpoint or shared model name.
 * @example
 * ```ts
 * const schemas = getMarketingJsonSchemas();
 * ```
 */
export const getMarketingJsonSchemas = () => {
  return {
    // Campaign Management
    getCampaignsOutput: zodToJsonSchema(
      campaignPagedCollectionResponseSchema,
      'getCampaignsOutput',
    ),
    getCampaignDetails: zodToJsonSchema(campaignSchema, 'getCampaignDetails'),
    createCampaignInput: zodToJsonSchema(createCampaignRequestSchema, 'createCampaignInput'),
    createCampaignOutput: zodToJsonSchema(
      z.object({
        campaignId: z.string().optional(),
        warnings: z.array(errorSchema).optional(),
      }),
      'createCampaignOutput',
    ),
    cloneCampaignInput: zodToJsonSchema(cloneCampaignRequestSchema, 'cloneCampaignInput'),
    updateCampaignInput: zodToJsonSchema(updateCampaignRequestSchema, 'updateCampaignInput'),
    updateCampaignBudgetInput: zodToJsonSchema(
      updateCampaignBudgetRequestSchema,
      'updateCampaignBudgetInput',
    ),
    updateBidPercentageInput: zodToJsonSchema(
      updateBidPercentageRequestSchema,
      'updateBidPercentageInput',
    ),

    // Ad Group Management
    getAdGroupsOutput: zodToJsonSchema(adGroupPagedCollectionResponseSchema, 'getAdGroupsOutput'),
    getAdGroupDetails: zodToJsonSchema(adGroupSchema, 'getAdGroupDetails'),
    createAdGroupInput: zodToJsonSchema(createAdGroupRequestSchema, 'createAdGroupInput'),
    updateAdGroupInput: zodToJsonSchema(updateAdGroupRequestSchema, 'updateAdGroupInput'),

    // Ad Operations
    getAdsOutput: zodToJsonSchema(adPagedCollectionResponseSchema, 'getAdsOutput'),
    getAdDetails: zodToJsonSchema(adSchema, 'getAdDetails'),
    createAdInput: zodToJsonSchema(createAdRequestSchema, 'createAdInput'),
    createAdOutput: zodToJsonSchema(adResponseSchema, 'createAdOutput'),
    createAdsByInventoryReferenceInput: zodToJsonSchema(
      createAdsByInventoryReferenceRequestSchema,
      'createAdsByInventoryReferenceInput',
    ),
    createAdsByInventoryReferenceOutput: zodToJsonSchema(
      createAdsByInventoryReferenceResponseSchema,
      'createAdsByInventoryReferenceOutput',
    ),
    updateAdStatusInput: zodToJsonSchema(updateAdStatusRequestSchema, 'updateAdStatusInput'),
    bulkCreateAdsInput: zodToJsonSchema(bulkCreateAdRequestSchema, 'bulkCreateAdsInput'),
    bulkCreateAdsOutput: zodToJsonSchema(bulkAdResponseSchema, 'bulkCreateAdsOutput'),
    bulkUpdateAdStatusInput: zodToJsonSchema(
      bulkUpdateAdStatusRequestSchema,
      'bulkUpdateAdStatusInput',
    ),
    bulkDeleteAdsInput: zodToJsonSchema(bulkDeleteAdRequestSchema, 'bulkDeleteAdsInput'),

    // Keyword Management
    getKeywordsOutput: zodToJsonSchema(keywordPagedCollectionResponseSchema, 'getKeywordsOutput'),
    getKeywordDetails: zodToJsonSchema(keywordSchema, 'getKeywordDetails'),
    createKeywordInput: zodToJsonSchema(createKeywordRequestSchema, 'createKeywordInput'),
    createKeywordOutput: zodToJsonSchema(keywordResponseSchema, 'createKeywordOutput'),
    updateKeywordInput: zodToJsonSchema(updateKeywordRequestSchema, 'updateKeywordInput'),
    bulkCreateKeywordsInput: zodToJsonSchema(
      bulkCreateKeywordRequestSchema,
      'bulkCreateKeywordsInput',
    ),
    bulkCreateKeywordsOutput: zodToJsonSchema(
      bulkCreateKeywordResponseSchema,
      'bulkCreateKeywordsOutput',
    ),
    bulkUpdateKeywordsInput: zodToJsonSchema(
      bulkUpdateKeywordRequestSchema,
      'bulkUpdateKeywordsInput',
    ),

    // Negative Keyword Management
    getNegativeKeywordsOutput: zodToJsonSchema(
      negativeKeywordPagedCollectionResponseSchema,
      'getNegativeKeywordsOutput',
    ),
    getNegativeKeywordDetails: zodToJsonSchema(negativeKeywordSchema, 'getNegativeKeywordDetails'),
    createNegativeKeywordInput: zodToJsonSchema(
      createNegativeKeywordRequestSchema,
      'createNegativeKeywordInput',
    ),
    createNegativeKeywordOutput: zodToJsonSchema(
      negativeKeywordResponseSchema,
      'createNegativeKeywordOutput',
    ),
    updateNegativeKeywordInput: zodToJsonSchema(
      updateNegativeKeywordRequestSchema,
      'updateNegativeKeywordInput',
    ),
    bulkCreateNegativeKeywordsInput: zodToJsonSchema(
      bulkCreateNegativeKeywordRequestSchema,
      'bulkCreateNegativeKeywordsInput',
    ),
    bulkCreateNegativeKeywordsOutput: zodToJsonSchema(
      bulkCreateNegativeKeywordResponseSchema,
      'bulkCreateNegativeKeywordsOutput',
    ),

    // Suggestions
    suggestBidsOutput: zodToJsonSchema(
      z.object({
        suggestedBids: z.array(suggestedBidsSchema).optional(),
      }),
      'suggestBidsOutput',
    ),
    suggestKeywordsOutput: zodToJsonSchema(
      z.object({
        suggestedKeywords: z.array(suggestedKeywordsSchema).optional(),
      }),
      'suggestKeywordsOutput',
    ),
    suggestBudgetOutput: zodToJsonSchema(suggestBudgetResponseSchema, 'suggestBudgetOutput'),
    suggestMaxCpcInput: zodToJsonSchema(suggestMaxCpcRequestSchema, 'suggestMaxCpcInput'),
    suggestMaxCpcOutput: zodToJsonSchema(suggestMaxCpcResponseSchema, 'suggestMaxCpcOutput'),

    // Reporting
    getReportMetadataOutput: zodToJsonSchema(reportMetadatasSchema, 'getReportMetadataOutput'),
    createReportTaskInput: zodToJsonSchema(createReportTaskSchema, 'createReportTaskInput'),
    createReportTaskOutput: zodToJsonSchema(
      z.object({
        reportTaskId: z.string().optional(),
        href: z.string().optional(),
      }),
      'createReportTaskOutput',
    ),
    getReportTasksOutput: zodToJsonSchema(reportTaskPagedCollectionSchema, 'getReportTasksOutput'),
    getReportTaskDetails: zodToJsonSchema(reportTaskSchema, 'getReportTaskDetails'),
    getSummaryReportOutput: zodToJsonSchema(summaryReportResponseSchema, 'getSummaryReportOutput'),

    // Item Promotions (Discounts)
    getPromotionsOutput: zodToJsonSchema(promotionsPagedCollectionSchema, 'getPromotionsOutput'),
    getPromotionDetails: zodToJsonSchema(itemPromotionResponseSchema, 'getPromotionDetails'),
    createItemPromotionInput: zodToJsonSchema(itemPromotionSchema, 'createItemPromotionInput'),
    createItemPromotionOutput: zodToJsonSchema(
      z.object({
        promotionId: z.string().optional(),
        href: z.string().optional(),
      }),
      'createItemPromotionOutput',
    ),
    updateItemPromotionInput: zodToJsonSchema(itemPromotionSchema, 'updateItemPromotionInput'),
    getPromotionListingsOutput: zodToJsonSchema(
      itemsPagedCollectionSchema,
      'getPromotionListingsOutput',
    ),
    getPromotionReportsOutput: zodToJsonSchema(
      promotionsReportPagedCollectionSchema,
      'getPromotionReportsOutput',
    ),
    createItemPriceMarkdownInput: zodToJsonSchema(
      itemPriceMarkdownSchema,
      'createItemPriceMarkdownInput',
    ),

    // Email Campaigns
    createEmailCampaignInput: zodToJsonSchema(
      createEmailCampaignRequestSchema,
      'createEmailCampaignInput',
    ),
    createEmailCampaignOutput: zodToJsonSchema(
      createEmailCampaignResponseSchema,
      'createEmailCampaignOutput',
    ),
    getEmailCampaignsOutput: zodToJsonSchema(
      getEmailCampaignsResponseSchema,
      'getEmailCampaignsOutput',
    ),
    getEmailCampaignDetails: zodToJsonSchema(
      getEmailCampaignResponseSchema,
      'getEmailCampaignDetails',
    ),
    getEmailCampaignAudiencesOutput: zodToJsonSchema(
      getEmailCampaignAudiencesResponseSchema,
      'getEmailCampaignAudiencesOutput',
    ),
    getEmailPreviewOutput: zodToJsonSchema(getEmailPreviewResponseSchema, 'getEmailPreviewOutput'),
    getEmailReportOutput: zodToJsonSchema(getEmailReportResponseSchema, 'getEmailReportOutput'),

    // Recommendations
    findListingRecommendationsInput: zodToJsonSchema(
      findListingRecommendationsInputSchema,
      'findListingRecommendationsInput',
    ),
    findListingRecommendationsOutput: zodToJsonSchema(
      pagedListingRecommendationCollectionSchema,
      'findListingRecommendationsOutput',
    ),
    listingRecommendationDetails: zodToJsonSchema(
      listingRecommendationSchema,
      'listingRecommendationDetails',
    ),

    // Quick Setup
    quickSetupInput: zodToJsonSchema(quickSetupRequestSchema, 'quickSetupInput'),

    // Common schemas
    error: zodToJsonSchema(errorSchema, 'error'),
    amount: zodToJsonSchema(amountSchema, 'amount'),
  };
};
