import { z } from '@/utils/effectSchema.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

/**
 * Analytics API Schemas
 *
 * Effect-backed schemas for the Sell Analytics API.
 * All enum values sourced from the generated OpenAPI spec at
 * src/types/sell-apps/analytics-and-report/sellAnalyticsV1Oas3.ts
 */

// ============================================================================
// Shared sub-schemas
// ============================================================================

const errorParameterSchema = z.object({
  name: z.string().optional(),
  value: z.string().optional(),
});

const errorSchema = z.object({
  category: z.string().optional(),
  domain: z.string().optional(),
  errorId: z.number().int().optional(),
  inputRefIds: z.array(z.string()).optional(),
  longMessage: z.string().optional(),
  message: z.string().optional(),
  outputRefIds: z.array(z.string()).optional(),
  parameters: z.array(errorParameterSchema).optional(),
  subdomain: z.string().optional(),
});

const valueSchema = z.object({
  applicable: z.boolean().optional(),
  value: z.record(z.never()).optional(),
});

// ============================================================================
// Customer Service Metric response schemas
// ============================================================================

const benchmarkMetadataSchema = z.object({
  average: z.string().optional(),
});

const metricBenchmarkSchema = z.object({
  adjustment: z.string().optional(),
  basis: z.string().optional(),
  metadata: benchmarkMetadataSchema.optional(),
  rating: z.string().optional(),
});

const distributionSchema = z.object({
  name: z.string().optional(),
  value: z.string().optional(),
});

const metricDistributionSchema = z.object({
  basis: z.string().optional(),
  data: z.array(distributionSchema).optional(),
});

const metricSchema = z.object({
  benchmark: metricBenchmarkSchema.optional(),
  distributions: z.array(metricDistributionSchema).optional(),
  metricKey: z.string().optional(),
  value: z.string().optional(),
});

const dimensionSchema = z.object({
  dimensionKey: z.string().optional(),
  name: z.string().optional(),
  value: z.string().optional(),
});

const dimensionMetricSchema = z.object({
  dimension: dimensionSchema.optional(),
  metrics: z.array(metricSchema).optional(),
});

const evaluationCycleSchema = z.object({
  endDate: z.string().optional(),
  evaluationDate: z.string().optional(),
  evaluationType: z.string().optional(),
  startDate: z.string().optional(),
});

const getCustomerServiceMetricResponseSchema = z.object({
  dimensionMetrics: z.array(dimensionMetricSchema).optional(),
  evaluationCycle: evaluationCycleSchema.optional(),
  marketplaceId: z.string().optional(),
});

// ============================================================================
// Seller Standards Profile response schemas
// ============================================================================

const cycleSchema = z.object({
  cycleType: z.string().optional(),
  evaluationDate: z.string().optional(),
  evaluationMonth: z.string().optional(),
});

const standardsProfileSchema = z.object({
  cycle: cycleSchema.optional(),
  defaultProgram: z.boolean().optional(),
  evaluationReason: z.string().optional(),
  metrics: z.array(metricSchema).optional(),
  program: z.string().optional(),
  standardsLevel: z.string().optional(),
});

const findSellerStandardsProfilesResponseSchema = z.object({
  standardsProfiles: z.array(standardsProfileSchema).optional(),
});

// ============================================================================
// Traffic Report response schemas
// ============================================================================

const definitionSchema = z.object({
  dataType: z.string().optional(),
  key: z.string().optional(),
  localizedName: z.string().optional(),
});

const headerSchema = z.object({
  dimensionKeys: z.array(definitionSchema).optional(),
  metrics: z.array(definitionSchema).optional(),
});

const recordSchema = z.object({
  dimensionValues: z.array(valueSchema).optional(),
  metricValues: z.array(valueSchema).optional(),
});

const metadataHeaderSchema = z.object({
  key: z.string().optional(),
  metadataKeys: z.array(definitionSchema).optional(),
});

const metadataRecordSchema = z.object({
  metadataValues: z.array(valueSchema).optional(),
  value: valueSchema.optional(),
});

const metadataSchema = z.object({
  metadataHeader: metadataHeaderSchema.optional(),
  metadataRecords: z.array(metadataRecordSchema).optional(),
});

const reportSchema = z.object({
  dimensionMetadata: z.array(metadataSchema).optional(),
  endDate: z.string().optional(),
  header: headerSchema.optional(),
  lastUpdatedDate: z.string().optional(),
  records: z.array(recordSchema).optional(),
  startDate: z.string().optional(),
  warnings: z.array(errorSchema).optional(),
});

// ============================================================================
// Input schemas — with full enum documentation and examples
// ============================================================================

/**
 * Input accepted by Analytics API findSellerStandardsProfiles.
 * No parameters required — returns all profiles for the seller.
 */
export const findSellerStandardsProfilesInputSchema = z.object({});

/**
 * Input accepted by Analytics API getCustomerServiceMetric.
 *
 * customer_service_metric_type values:
 *   ITEM_NOT_AS_DESCRIBED — cases where buyer says item didn't match the listing
 *   ITEM_NOT_RECEIVED     — cases where buyer says item never arrived
 *
 * evaluation_type values:
 *   CURRENT   — official monthly evaluation (runs around the 20th of each month)
 *   PROJECTED — real-time projection of where you'll land at the next evaluation
 *
 * evaluationMarketplaceId values (subset supported by this API):
 *   EBAY_US, EBAY_GB, EBAY_DE, EBAY_AU, EBAY_FR, EBAY_IT, EBAY_ES, EBAY_CA
 */
export const getCustomerServiceMetricInputSchema = z.object({
  customerServiceMetricType: z
    .enum(['ITEM_NOT_AS_DESCRIBED', 'ITEM_NOT_RECEIVED'])
    .describe(
      'Type of customer service metric to evaluate.\n' +
        'ITEM_NOT_AS_DESCRIBED: buyer claims do not match listing description.\n' +
        'ITEM_NOT_RECEIVED: buyer claims item never arrived.',
    ),
  evaluationType: z
    .enum(['CURRENT', 'PROJECTED'])
    .describe(
      'CURRENT: values from the most recent official monthly eBay evaluation (runs ~20th of each month).\n' +
        'PROJECTED: real-time snapshot showing where you currently stand heading into the next evaluation.',
    ),
  evaluationMarketplaceId: z
    .enum([
      'EBAY_US',
      'EBAY_GB',
      'EBAY_DE',
      'EBAY_AU',
      'EBAY_FR',
      'EBAY_IT',
      'EBAY_ES',
      'EBAY_CA',
      'EBAY_MOTORS_US',
    ])
    .describe(
      'Marketplace to evaluate metrics for. Only a subset of marketplaces are supported by this API.\n' +
        'Use EBAY_US for the US marketplace.',
    ),
});

/**
 * Input accepted by Analytics API getSellerStandardsProfile.
 *
 * program values:
 *   PROGRAM_US     — US marketplace seller standards
 *   PROGRAM_UK     — UK marketplace seller standards
 *   PROGRAM_DE     — German marketplace seller standards
 *   PROGRAM_GLOBAL — aggregate across all marketplaces where seller has activity
 *
 * cycle values:
 *   CURRENT   — metrics from the last official monthly eBay evaluation
 *   PROJECTED — metrics as of right now (real-time)
 */
export const getSellerStandardsProfileInputSchema = z.object({
  program: z
    .enum(['PROGRAM_US', 'PROGRAM_UK', 'PROGRAM_DE', 'PROGRAM_GLOBAL'])
    .describe(
      'Seller standards program (region) to retrieve.\n' +
        'PROGRAM_US: US marketplace. PROGRAM_UK: UK marketplace.\n' +
        'PROGRAM_DE: German marketplace. PROGRAM_GLOBAL: all marketplaces combined.\n' +
        'Use findSellerStandardsProfiles first if unsure which programs apply to your account.',
    ),
  cycle: z
    .enum(['CURRENT', 'PROJECTED'])
    .describe(
      'CURRENT: values from the last official monthly eBay evaluation (~20th of each month).\n' +
        'PROJECTED: real-time values showing where you stand right now.',
    ),
});

/**
 * Input accepted by Analytics API getTrafficReport.
 *
 * dimension values:
 *   DAY     — one record per day in the date range; marketplace_ids filter required
 *   LISTING — one record per listing; returns up to 200 listings if listing_ids not specified
 *
 * filter format (comma-separated, URL-encode curly braces and brackets):
 *   date_range:[YYYYMMDD..YYYYMMDD]            required — max 90-day range
 *   marketplace_ids:{EBAY_US}                  required when dimension=DAY
 *   listing_ids:{123456|789012}                optional — up to 200 IDs, pipe-separated
 *
 * metric values (comma-separated, case-insensitive):
 *   CLICK_THROUGH_RATE
 *   LISTING_IMPRESSION_SEARCH_RESULTS_PAGE
 *   LISTING_IMPRESSION_STORE
 *   LISTING_IMPRESSION_TOTAL
 *   LISTING_VIEWS_SOURCE_DIRECT
 *   LISTING_VIEWS_SOURCE_OFF_EBAY
 *   LISTING_VIEWS_SOURCE_OTHER_EBAY
 *   LISTING_VIEWS_SOURCE_SEARCH_RESULTS_PAGE
 *   LISTING_VIEWS_SOURCE_STORE
 *   LISTING_VIEWS_TOTAL
 *   SALES_CONVERSION_RATE
 *   TOTAL_IMPRESSION_TOTAL
 *   TRANSACTION
 *
 * sort: optional — prefix with "-" for descending, e.g. "-CLICK_THROUGH_RATE"
 *   Note: SALES_CONVERSION_RATE cannot be sorted; TRANSACTION descending only.
 */
export const getTrafficReportInputSchema = z.object({
  dimension: z
    .enum(['DAY', 'LISTING'])
    .describe(
      'How to slice the report data.\n' +
        'DAY: one data point per day — requires marketplace_ids in the filter.\n' +
        'LISTING: one data point per listing — returns up to 200 listings unless listing_ids filter is set.',
    ),
  filter: z
    .string()
    .describe(
      'Comma-separated filter expression. date_range is required.\n' +
        'Format: date_range:[YYYYMMDD..YYYYMMDD],marketplace_ids:{EBAY_US}\n' +
        'Example (last 30 days, US): date_range:[20240601..20240701],marketplace_ids:{EBAY_US}\n' +
        'Example (specific listings): date_range:[20240601..20240701],listing_ids:{123456789|987654321}\n' +
        'Max date range: 90 days. Earliest start date: 730 days ago.\n' +
        'marketplace_ids is required when dimension=DAY.\n' +
        'listing_ids accepts up to 200 IDs separated by pipe characters.',
    ),
  metric: z
    .string()
    .describe(
      'Comma-separated list of metrics to include in the report (case-insensitive).\n' +
        'Valid values: CLICK_THROUGH_RATE, LISTING_IMPRESSION_SEARCH_RESULTS_PAGE,\n' +
        'LISTING_IMPRESSION_STORE, LISTING_IMPRESSION_TOTAL,\n' +
        'LISTING_VIEWS_SOURCE_DIRECT, LISTING_VIEWS_SOURCE_OFF_EBAY,\n' +
        'LISTING_VIEWS_SOURCE_OTHER_EBAY, LISTING_VIEWS_SOURCE_SEARCH_RESULTS_PAGE,\n' +
        'LISTING_VIEWS_SOURCE_STORE, LISTING_VIEWS_TOTAL,\n' +
        'SALES_CONVERSION_RATE, TOTAL_IMPRESSION_TOTAL, TRANSACTION\n' +
        'Example: LISTING_IMPRESSION_TOTAL,LISTING_VIEWS_TOTAL,TRANSACTION',
    ),
  sort: z
    .string()
    .optional()
    .describe(
      'Optional: sort the report by a single metric included in the metric parameter.\n' +
        'Prefix with "-" for descending order. Example: -CLICK_THROUGH_RATE\n' +
        'Constraints: SALES_CONVERSION_RATE cannot be sorted; TRANSACTION is descending only.',
    ),
});

// ============================================================================
// JSON Schema conversion (used by MCP tool registration)
// ============================================================================

/**
 * Converts Analytics API Effect-backed schemas to JSON Schema format for MCP tools.
 *
 * @returns Analytics API JSON schemas keyed by endpoint or shared model name.
 * @example
 * ```ts
 * const schemas = getAnalyticsJsonSchemas();
 * ```
 */
export const getAnalyticsJsonSchemas = () => {
  return {
    getCustomerServiceMetricInput: zodToJsonSchema(
      getCustomerServiceMetricInputSchema,
      'getCustomerServiceMetricInput',
    ),
    getCustomerServiceMetricOutput: zodToJsonSchema(
      getCustomerServiceMetricResponseSchema,
      'getCustomerServiceMetricOutput',
    ),
    findSellerStandardsProfilesInput: zodToJsonSchema(
      findSellerStandardsProfilesInputSchema,
      'findSellerStandardsProfilesInput',
    ),
    findSellerStandardsProfilesOutput: zodToJsonSchema(
      findSellerStandardsProfilesResponseSchema,
      'findSellerStandardsProfilesOutput',
    ),
    getSellerStandardsProfileInput: zodToJsonSchema(
      getSellerStandardsProfileInputSchema,
      'getSellerStandardsProfileInput',
    ),
    getSellerStandardsProfileOutput: zodToJsonSchema(
      standardsProfileSchema,
      'getSellerStandardsProfileOutput',
    ),
    getTrafficReportInput: zodToJsonSchema(getTrafficReportInputSchema, 'getTrafficReportInput'),
    getTrafficReportOutput: zodToJsonSchema(reportSchema, 'getTrafficReportOutput'),
    benchmarkMetadata: zodToJsonSchema(benchmarkMetadataSchema, 'benchmarkMetadata'),
    cycle: zodToJsonSchema(cycleSchema, 'cycle'),
    definition: zodToJsonSchema(definitionSchema, 'definition'),
    dimension: zodToJsonSchema(dimensionSchema, 'dimension'),
    dimensionMetric: zodToJsonSchema(dimensionMetricSchema, 'dimensionMetric'),
    distribution: zodToJsonSchema(distributionSchema, 'distribution'),
    error: zodToJsonSchema(errorSchema, 'error'),
    errorParameter: zodToJsonSchema(errorParameterSchema, 'errorParameter'),
    evaluationCycle: zodToJsonSchema(evaluationCycleSchema, 'evaluationCycle'),
    header: zodToJsonSchema(headerSchema, 'header'),
    metadata: zodToJsonSchema(metadataSchema, 'metadata'),
    metadataHeader: zodToJsonSchema(metadataHeaderSchema, 'metadataHeader'),
    metadataRecord: zodToJsonSchema(metadataRecordSchema, 'metadataRecord'),
    metric: zodToJsonSchema(metricSchema, 'metric'),
    metricBenchmark: zodToJsonSchema(metricBenchmarkSchema, 'metricBenchmark'),
    metricDistribution: zodToJsonSchema(metricDistributionSchema, 'metricDistribution'),
    record: zodToJsonSchema(recordSchema, 'record'),
    report: zodToJsonSchema(reportSchema, 'report'),
    standardsProfile: zodToJsonSchema(standardsProfileSchema, 'standardsProfile'),
    value: zodToJsonSchema(valueSchema, 'value'),
  };
};
