import { Effect } from 'effect';
import {
  findSellerStandardsProfilesInputSchema,
  getCustomerServiceMetricInputSchema,
  getSellerStandardsProfileInputSchema,
  getTrafficReportInputSchema,
} from '@/schemas/analytics/analytics.js';
import { defineTool } from '@/tools/defineTool.js';
import type { ToolEntry } from '@/tools/registry.js';
import {
  mapCustomerServiceMetricToChart,
  mapStandardsProfileToCard,
  mapTrafficReportToChart,
} from '@/tools/ui/maps.js';

/** Analytics API tools for seller traffic and performance reporting. */
export const analyticsEntries: ToolEntry[] = [
  defineTool({
    name: 'ebay_get_traffic_report',
    description:
      'Get a traffic report showing how your listings are performing: impressions, views, click-through rate, and transactions. Covers up to 90 days of data.\n\n' +
      'Required parameters:\n' +
      '  dimension: DAY (trend over time) or LISTING (per-item breakdown, up to 200 listings)\n' +
      '  filter: must include date_range — format: date_range:[YYYYMMDD..YYYYMMDD],marketplace_ids:{EBAY_US}\n' +
      '  metric: comma-separated list of what to measure\n\n' +
      'Common metric values:\n' +
      '  LISTING_IMPRESSION_TOTAL — how many times your listings appeared in search or store\n' +
      '  LISTING_VIEWS_TOTAL — how many times buyers clicked to view your listings\n' +
      '  CLICK_THROUGH_RATE — ratio of views to impressions\n' +
      '  SALES_CONVERSION_RATE — ratio of purchases to views\n' +
      '  TRANSACTION — number of sales\n' +
      '  LISTING_IMPRESSION_SEARCH_RESULTS_PAGE — impressions from search only\n' +
      '  LISTING_IMPRESSION_STORE — impressions from your eBay store\n' +
      '  LISTING_VIEWS_SOURCE_DIRECT — views from direct/bookmarked links\n' +
      '  LISTING_VIEWS_SOURCE_OFF_EBAY — views from external sources (Google, etc)\n\n' +
      'Example — last 30 days daily trend for US:\n' +
      '  dimension: DAY\n' +
      '  filter: date_range:[20240601..20240701],marketplace_ids:{EBAY_US}\n' +
      '  metric: LISTING_IMPRESSION_TOTAL,LISTING_VIEWS_TOTAL,TRANSACTION\n\n' +
      'Example — breakdown for specific listings:\n' +
      '  dimension: LISTING\n' +
      '  filter: date_range:[20240601..20240701],listing_ids:{123456789|987654321}\n' +
      '  metric: LISTING_VIEWS_TOTAL,CLICK_THROUGH_RATE,TRANSACTION\n\n' +
      'Notes:\n' +
      '  - marketplace_ids is required when dimension=DAY\n' +
      '  - LISTING dimension without listing_ids returns up to 200 listings\n' +
      '  - listing_ids filter accepts up to 200 IDs, pipe-separated in curly braces\n' +
      '  - Date range max is 90 days; earliest start is 730 days ago\n' +
      '  - SALES_CONVERSION_RATE cannot be used in sort; TRANSACTION sort is descending only\n\n' +
      'Required: User OAuth token with https://api.ebay.com/oauth/api_scope/sell.analytics.readonly scope.',
    inputSchema: getTrafficReportInputSchema.shape,
    outputSchema: {
      type: 'object',
      properties: {
        records: { type: 'array' },
        warnings: { type: 'array' },
      },
      description: 'Traffic report data with records per day or listing',
    },
    handler: (api, args) => Effect.runPromise(api.analytics.getTrafficReport(args)),
    ui: { archetype: 'chart', map: mapTrafficReportToChart },
  }),

  defineTool({
    name: 'ebay_find_seller_standards_profiles',
    description:
      'Retrieve all seller standards profiles for your account. Returns one profile per program/cycle combination.\n\n' +
      'A standards profile shows your seller level (TOP_RATED, ABOVE_STANDARD, or BELOW_STANDARD) and the metrics eBay used to calculate it.\n\n' +
      'Programs represent regions where you do business:\n' +
      '  PROGRAM_US — US marketplace\n' +
      '  PROGRAM_UK — UK marketplace\n' +
      '  PROGRAM_DE — German marketplace\n' +
      '  PROGRAM_GLOBAL — aggregate across all marketplaces\n\n' +
      'Cycles represent evaluation timing:\n' +
      '  CURRENT — values from the last official monthly eBay evaluation (~20th of each month)\n' +
      '  PROJECTED — real-time snapshot of where you stand right now\n\n' +
      'Use this first to discover which programs apply to your account, then call ebay_get_seller_standards_profile for detail on a specific one.\n\n' +
      'No parameters required.\n\n' +
      'Required: User OAuth token with https://api.ebay.com/oauth/api_scope/sell.analytics.readonly scope.',
    inputSchema: findSellerStandardsProfilesInputSchema.shape,
    outputSchema: {
      type: 'object',
      properties: {
        standardsProfiles: { type: 'array' },
      },
      description: 'All seller standards profiles across programs and cycles',
    },
    handler: (api, args) => Effect.runPromise(api.analytics.findSellerStandardsProfiles(args)),
  }),

  defineTool({
    name: 'ebay_get_seller_standards_profile',
    description:
      'Get your seller standards profile for a specific program and cycle. Returns your seller level and the underlying metric values eBay used to determine it.\n\n' +
      'program values:\n' +
      '  PROGRAM_US     — US marketplace standards\n' +
      '  PROGRAM_UK     — UK marketplace standards\n' +
      '  PROGRAM_DE     — German marketplace standards\n' +
      '  PROGRAM_GLOBAL — aggregate across all marketplaces\n\n' +
      'cycle values:\n' +
      '  CURRENT   — from the last official monthly eBay evaluation (~20th of each month)\n' +
      '  PROJECTED — real-time values as of now (useful for monitoring before evaluation day)\n\n' +
      'Response includes:\n' +
      '  standardsLevel: TOP_RATED | ABOVE_STANDARD | BELOW_STANDARD\n' +
      '  metrics: list of individual metrics (transaction defect rate, late shipment rate, etc.)\n' +
      '  cycle.evaluationMonth: the month this evaluation covers\n\n' +
      'Tip: If unsure which programs apply to your account, call ebay_find_seller_standards_profiles first.\n\n' +
      'Required: User OAuth token with https://api.ebay.com/oauth/api_scope/sell.analytics.readonly scope.',
    inputSchema: getSellerStandardsProfileInputSchema.shape,
    outputSchema: {
      type: 'object',
      properties: {
        program: { type: 'string' },
        cycle: { type: 'object' },
        metrics: { type: 'array' },
        standardsLevel: { type: 'string' },
      },
      description: 'Seller standards profile for the specified program and cycle',
    },
    handler: (api, args) => Effect.runPromise(api.analytics.getSellerStandardsProfile(args)),
    ui: { archetype: 'card', map: mapStandardsProfileToCard },
  }),

  defineTool({
    name: 'ebay_get_customer_service_metric',
    description:
      'Get your customer service metric performance and benchmark rating — how your INAD (Item Not As Described) or INR (Item Not Received) rate compares to peer sellers.\n\n' +
      'customerServiceMetricType values:\n' +
      '  ITEM_NOT_AS_DESCRIBED — cases where buyers claimed the item did not match the listing description\n' +
      '  ITEM_NOT_RECEIVED     — cases where buyers claimed the item never arrived\n\n' +
      'evaluationType values:\n' +
      '  CURRENT   — from the most recent official monthly eBay evaluation (~20th of each month)\n' +
      '  PROJECTED — real-time projection of where you currently stand\n\n' +
      'evaluationMarketplaceId values (this API supports a subset of eBay marketplaces):\n' +
      '  EBAY_US, EBAY_GB, EBAY_DE, EBAY_AU, EBAY_FR, EBAY_IT, EBAY_ES, EBAY_CA, EBAY_MOTORS_US\n\n' +
      'Response includes:\n' +
      '  dimensionMetrics: your metric broken down by category (for INAD) or shipping region (for INR)\n' +
      '  metrics[].metricKey: RATE (your % rate), COUNT (your case count), TRANSACTION_COUNT (total transactions)\n' +
      '  metrics[].benchmark.rating: how your rate compares to peers — LOW means better than average\n' +
      '  evaluationCycle: the date range this evaluation covers\n\n' +
      'Example — check INR rate for US marketplace right now:\n' +
      '  customerServiceMetricType: ITEM_NOT_RECEIVED\n' +
      '  evaluationType: PROJECTED\n' +
      '  evaluationMarketplaceId: EBAY_US\n\n' +
      'Required: User OAuth token with https://api.ebay.com/oauth/api_scope/sell.analytics.readonly scope.',
    inputSchema: getCustomerServiceMetricInputSchema.shape,
    outputSchema: {
      type: 'object',
      properties: {
        dimensionMetrics: { type: 'array' },
        evaluationCycle: { type: 'object' },
        marketplaceId: { type: 'string' },
      },
      description: 'Customer service metric data with benchmark comparison',
    },
    handler: (api, args) => Effect.runPromise(api.analytics.getCustomerServiceMetric(args)),
    ui: { archetype: 'chart', map: mapCustomerServiceMetricToChart },
  }),
];
