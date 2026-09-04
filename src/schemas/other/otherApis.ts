import { z } from '@/utils/effectSchema.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

/**
 * Other eBay APIs Schemas
 *
 * This file contains Effect-backed schemas for various eBay APIs including:
 * - Commerce Identity API
 * - Sell Compliance API
 * - Commerce Translation API
 * - Commerce VERO API
 * - Sell eDelivery International Shipping API
 */

// ============================================================================
// Common Schemas
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

// ============================================================================
// Commerce Identity API Schemas
// ============================================================================

const userConsentSchema = z.object({
  consentState: z.string().optional(),
  consentType: z.string().optional(),
});

const getUserConsentResponseSchema = z.object({
  consents: z.array(userConsentSchema).optional(),
});

// ============================================================================
// Sell Compliance API Schemas
// ============================================================================

const nameValueListSchema = z.object({
  name: z.string().optional(),
  value: z.string().optional(),
});

const correctiveRecommendationsSchema = z.object({
  complianceDetail: z.string().optional(),
  complianceDetailDescription: z.string().optional(),
  correctiveActionDetails: z.string().optional(),
  productRecommendation: z
    .object({
      epid: z.string().optional(),
    })
    .optional(),
});

const variationDetailsSchema = z.object({
  sku: z.string().optional(),
  variationAspects: z.array(nameValueListSchema).optional(),
});

const complianceDetailSchema = z.object({
  complianceState: z.string().optional(),
  complianceType: z.string().optional(),
  message: z.string().optional(),
  reasons: z
    .array(
      z.object({
        complianceDetailType: z.string().optional(),
        message: z.string().optional(),
        variation: variationDetailsSchema.optional(),
        violationData: z.array(nameValueListSchema).optional(),
      }),
    )
    .optional(),
  correctiveRecommendations: correctiveRecommendationsSchema.optional(),
});

const complianceSummaryInfoSchema = z.object({
  complianceSummary: z
    .object({
      violationSummaries: z
        .array(
          z.object({
            complianceType: z.string().optional(),
            listingCount: z.number().int().optional(),
          }),
        )
        .optional(),
    })
    .optional(),
});

const complianceViolationSchema = z.object({
  listingId: z.string().optional(),
  offerId: z.string().optional(),
  sku: z.string().optional(),
  complianceType: z.string().optional(),
  complianceDetails: z.array(complianceDetailSchema).optional(),
});

const pageMetadataSchema = z.object({
  href: z.string().optional(),
  limit: z.number().int().optional(),
  next: z.string().optional(),
  offset: z.number().int().optional(),
  prev: z.string().optional(),
  total: z.number().int().optional(),
});

const listingViolationSummaryResponseSchema = z.object({
  href: z.string().optional(),
  limit: z.number().int().optional(),
  listingViolations: z.array(complianceViolationSchema).optional(),
  next: z.string().optional(),
  offset: z.number().int().optional(),
  prev: z.string().optional(),
  total: z.number().int().optional(),
});

// ============================================================================
// Commerce Translation API Schemas
// ============================================================================

const translationSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  translatedText: z.string().optional(),
});

/** Input schema for Commerce Translation API translate. */
export const translateInputSchema = z.object({
  from: z.string().optional(),
  to: z.string(),
  text: z.array(z.string()),
  translationContext: z.string().optional(),
});

const translateResponseSchema = z.object({
  translations: z.array(translationSchema).optional(),
});

// ============================================================================
// Commerce VERO API Schemas
// ============================================================================

const amountSchema = z.object({
  currency: z.string().optional(),
  value: z.string().optional(),
});

const reportItemDetailsSchema = z.object({
  brand: z.string().optional(),
  copyEmailToRightsOwner: z.boolean().optional(),
  countries: z.array(z.string()).optional(),
  detailedMessage: z.string().optional(),
  itemId: z.string().optional(),
  messageToSeller: z.string().optional(),
  patent: z.string().optional(),
  regions: z.array(z.string()).optional(),
  veroReasonCodeId: z.string().optional(),
});

/** Request schema for Commerce VeRO API createVeroReport report items. */
export const veroReportItemsRequestSchema = z.object({
  reportItems: z.array(reportItemDetailsSchema).optional(),
});

/** Response schema for Commerce VeRO API createVeroReport. */
export const veroReportItemsResponseSchema = z.object({
  veroReportId: z.string().optional(),
  veroReportStatus: z.string().optional(),
});

const reportedItemSchema = z.object({
  itemId: z.string().optional(),
  reasonForFailure: z.string().optional(),
  status: z.string().optional(),
});

const veroReportStatusResponseSchema = z.object({
  reportedItemDetails: z.array(reportedItemSchema).optional(),
  veroReportId: z.string().optional(),
  veroReportStatus: z.string().optional(),
});

/** Paginated response schema for Commerce VeRO API getVeroReportItems. */
export const veroReportItemsStatusResponseSchema = z.object({
  href: z.string().optional(),
  limit: z.number().int().optional(),
  next: z.string().optional(),
  offset: z.number().int().optional(),
  prev: z.string().optional(),
  reportedItemDetails: z.array(reportedItemSchema).optional(),
  total: z.number().int().optional(),
});

const reasonCodeDetailTypeSchema = z.object({
  description: z.string().optional(),
  detailedDescription: z.string().optional(),
  veroReasonCodeId: z.string().optional(),
});

const veroReasonCodeSchema = z.object({
  marketplaceId: z.string().optional(),
  reasonCodeDetails: z.array(reasonCodeDetailTypeSchema).optional(),
});

/** Response schema for Commerce VeRO API getVeroReasonCode. */
export const veroReasonCodeResponseSchema = z.object({
  marketplaceId: z.string().optional(),
  reasonCodeDetails: reasonCodeDetailTypeSchema.optional(),
});

/** Response schema for Commerce VeRO API getVeroReasonCodes. */
export const veroReasonCodesResponseSchema = z.object({
  veroReasonCodes: z.array(veroReasonCodeSchema).optional(),
});

// ============================================================================
// Sell eDelivery International Shipping API Schemas
// ============================================================================

const addressSchema = z.object({
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  stateOrProvince: z.string().optional(),
  postalCode: z.string().optional(),
  countryCode: z.string().optional(),
});

const contactSchema = z.object({
  companyName: z.string().optional(),
  contactAddress: addressSchema.optional(),
  email: z.string().optional(),
  fullName: z.string().optional(),
  primaryPhone: z
    .object({
      phoneNumber: z.string().optional(),
    })
    .optional(),
});

const dimensionsSchema = z.object({
  height: z.number().optional(),
  length: z.number().optional(),
  width: z.number().optional(),
  unit: z.string().optional(),
});

const weightSchema = z.object({
  value: z.number().optional(),
  unit: z.string().optional(),
});

const generatedEDeliveryBodySchema = z.object({}).passthrough();

const generatedEDeliveryResponseSchema = z.object({}).passthrough();

const emptyResponseSchema = z.object({});

/** Input schema for eDelivery endpoints that accept a generated request body. */
export const edeliveryBodyInputSchema = z.object({
  body: generatedEDeliveryBodySchema,
});

/** Shared pagination input schema for eDelivery list endpoints. */
export const edeliveryPaginationInputSchema = z.object({
  limit: z.number().int().optional(),
  offset: z.number().int().optional(),
});

/** Input schema for eDelivery getActualCosts. */
export const getActualCostsInputSchema = z.object({
  trackingNumbers: z.string().optional(),
  transactionBeginTime: z.string().optional(),
  transactionEndTime: z.string().optional(),
});

/** Input schema for eDelivery endpoints addressed by bundle ID. */
export const bundleIdInputSchema = z.object({
  bundleId: z.string(),
});

/** Input schema for eDelivery endpoints addressed by package ID. */
export const packageIdInputSchema = z.object({
  packageId: z.string(),
});

/** Input schema for eDelivery getPackagesByLineItemId. */
export const getPackagesByLineItemIdInputSchema = z.object({
  orderLineItemId: z.string(),
});

/** Input schema for eDelivery getLabels. */
export const getLabelsInputSchema = z.object({
  pageSize: z.string().optional(),
  printPreference: z.string().optional(),
  trackingNumbers: z.string(),
});

/** Input schema for eDelivery getHandoverSheet. */
export const getHandoverSheetInputSchema = z.object({
  trackingNumbers: z.string(),
});

/** Input schema for eDelivery getTracking. */
export const getTrackingInputSchema = z.object({
  trackingNumber: z.string(),
});

// ============================================================================
// Input Schemas for Operations
// ============================================================================

/** Empty input schema for Commerce Identity API getUser. */
export const getUserInputSchema = z.object({});

/** Input schema for Sell Compliance API getListingViolations. */
export const getListingViolationsInputSchema = z.object({
  complianceType: z.string().optional(),
  offset: z.number().int().optional(),
  limit: z.number().int().optional(),
  filter: z.string().optional(),
});

/** Input schema for Sell Compliance API getListingViolationsSummary. */
export const getListingViolationsSummaryInputSchema = z.object({
  complianceType: z.string().optional(),
});

/** Empty input schema for eDelivery getAddressPreferences. */
export const getAddressPreferencesInputSchema = z.object({});

/** Empty input schema for eDelivery getConsignPreferences. */
export const getConsignPreferencesInputSchema = z.object({});

/** Input schema for Commerce VeRO API createVeroReport. */
export const createVeroReportInputSchema = z.object({
  reportData: veroReportItemsRequestSchema.describe('Generated VeroReportItemsRequest body'),
});

/** Input schema for Commerce VeRO API getVeroReport. */
export const getVeroReportInputSchema = z.object({
  veroReportId: z.string().min(1).describe('VeRO report identifier returned by createVeroReport'),
});

/** Input schema for Commerce VeRO API getVeroReportItems. */
export const getVeroReportItemsInputSchema = z.object({
  filter: z.string().optional(),
  limit: z.number().int().optional(),
  offset: z.number().int().optional(),
});

/** Input schema for Commerce VeRO API getVeroReasonCode. */
export const getVeroReasonCodeInputSchema = z.object({
  veroReasonCodeId: z.string().min(1).describe('VeRO reason-code identifier'),
});

/** Empty input schema for Commerce VeRO API getVeroReasonCodes. */
export const getVeroReasonCodesInputSchema = z.object({});

// ============================================================================
// JSON Schema Conversion Functions
// ============================================================================

/**
 * Converts other eBay API Effect-backed schemas to JSON Schema format for MCP tools.
 *
 * @returns Other API JSON schemas keyed by endpoint or shared model name.
 * @example
 * ```ts
 * const schemas = getOtherApisJsonSchemas();
 * ```
 */
export const getOtherApisJsonSchemas = () => {
  return {
    // Commerce Identity API
    getUserInput: zodToJsonSchema(getUserInputSchema, 'getUserInput'),
    getUserConsentOutput: zodToJsonSchema(getUserConsentResponseSchema, 'getUserConsentOutput'),

    // Sell Compliance API
    getComplianceSummaryOutput: zodToJsonSchema(
      complianceSummaryInfoSchema,
      'getComplianceSummaryOutput',
    ),
    getListingViolationsInput: zodToJsonSchema(
      getListingViolationsInputSchema,
      'getListingViolationsInput',
    ),
    getListingViolationsOutput: zodToJsonSchema(
      listingViolationSummaryResponseSchema,
      'getListingViolationsOutput',
    ),
    getListingViolationsSummaryInput: zodToJsonSchema(
      getListingViolationsSummaryInputSchema,
      'getListingViolationsSummaryInput',
    ),
    // Commerce Translation API
    translateInput: zodToJsonSchema(translateInputSchema, 'translateInput'),
    translateOutput: zodToJsonSchema(translateResponseSchema, 'translateOutput'),

    // Commerce VERO API
    createVeroReportInput: zodToJsonSchema(createVeroReportInputSchema, 'createVeroReportInput'),
    createVeroReportOutput: zodToJsonSchema(
      veroReportItemsResponseSchema,
      'createVeroReportOutput',
    ),
    getVeroReportInput: zodToJsonSchema(getVeroReportInputSchema, 'getVeroReportInput'),
    getVeroReportOutput: zodToJsonSchema(veroReportStatusResponseSchema, 'getVeroReportOutput'),
    getVeroReportItemsInput: zodToJsonSchema(
      getVeroReportItemsInputSchema,
      'getVeroReportItemsInput',
    ),
    getVeroReportItemsOutput: zodToJsonSchema(
      veroReportItemsStatusResponseSchema,
      'getVeroReportItemsOutput',
    ),
    getVeroReasonCodeInput: zodToJsonSchema(getVeroReasonCodeInputSchema, 'getVeroReasonCodeInput'),
    getVeroReasonCodeOutput: zodToJsonSchema(
      veroReasonCodeResponseSchema,
      'getVeroReasonCodeOutput',
    ),
    getVeroReasonCodesInput: zodToJsonSchema(
      getVeroReasonCodesInputSchema,
      'getVeroReasonCodesInput',
    ),
    getVeroReasonCodesOutput: zodToJsonSchema(
      veroReasonCodesResponseSchema,
      'getVeroReasonCodesOutput',
    ),

    // Sell eDelivery International Shipping API
    getActualCostsInput: zodToJsonSchema(getActualCostsInputSchema, 'getActualCostsInput'),
    getActualCostsOutput: zodToJsonSchema(generatedEDeliveryResponseSchema, 'getActualCostsOutput'),
    getAddressPreferencesInput: zodToJsonSchema(
      getAddressPreferencesInputSchema,
      'getAddressPreferencesInput',
    ),
    getAddressPreferencesOutput: zodToJsonSchema(
      generatedEDeliveryResponseSchema,
      'getAddressPreferencesOutput',
    ),
    createAddressPreferenceInput: zodToJsonSchema(
      edeliveryBodyInputSchema,
      'createAddressPreferenceInput',
    ),
    createAddressPreferenceOutput: zodToJsonSchema(
      generatedEDeliveryResponseSchema,
      'createAddressPreferenceOutput',
    ),
    getConsignPreferencesOutput: zodToJsonSchema(
      generatedEDeliveryResponseSchema,
      'getConsignPreferencesOutput',
    ),
    getConsignPreferencesInput: zodToJsonSchema(
      getConsignPreferencesInputSchema,
      'getConsignPreferencesInput',
    ),
    createConsignPreferenceInput: zodToJsonSchema(
      edeliveryBodyInputSchema,
      'createConsignPreferenceInput',
    ),
    createConsignPreferenceOutput: zodToJsonSchema(
      generatedEDeliveryResponseSchema,
      'createConsignPreferenceOutput',
    ),
    getAgentsInput: zodToJsonSchema(edeliveryPaginationInputSchema, 'getAgentsInput'),
    getAgentsOutput: zodToJsonSchema(generatedEDeliveryResponseSchema, 'getAgentsOutput'),
    getBatteryQualificationsInput: zodToJsonSchema(
      edeliveryPaginationInputSchema,
      'getBatteryQualificationsInput',
    ),
    getBatteryQualificationsOutput: zodToJsonSchema(
      generatedEDeliveryResponseSchema,
      'getBatteryQualificationsOutput',
    ),
    getDropoffSitesInput: zodToJsonSchema(edeliveryPaginationInputSchema, 'getDropoffSitesInput'),
    getDropoffSitesOutput: zodToJsonSchema(
      generatedEDeliveryResponseSchema,
      'getDropoffSitesOutput',
    ),
    getServicesInput: zodToJsonSchema(edeliveryPaginationInputSchema, 'getServicesInput'),
    getServicesOutput: zodToJsonSchema(generatedEDeliveryResponseSchema, 'getServicesOutput'),
    createBundleInput: zodToJsonSchema(edeliveryBodyInputSchema, 'createBundleInput'),
    createBundleOutput: zodToJsonSchema(generatedEDeliveryResponseSchema, 'createBundleOutput'),
    getBundleInput: zodToJsonSchema(bundleIdInputSchema, 'getBundleInput'),
    getBundleOutput: zodToJsonSchema(generatedEDeliveryResponseSchema, 'getBundleOutput'),
    cancelBundleInput: zodToJsonSchema(bundleIdInputSchema, 'cancelBundleInput'),
    cancelBundleOutput: zodToJsonSchema(emptyResponseSchema, 'cancelBundleOutput'),
    getBundleLabelInput: zodToJsonSchema(bundleIdInputSchema, 'getBundleLabelInput'),
    getBundleLabelOutput: zodToJsonSchema(generatedEDeliveryResponseSchema, 'getBundleLabelOutput'),
    createPackageInput: zodToJsonSchema(edeliveryBodyInputSchema, 'createPackageInput'),
    createPackageOutput: zodToJsonSchema(generatedEDeliveryResponseSchema, 'createPackageOutput'),
    getPackageInput: zodToJsonSchema(packageIdInputSchema, 'getPackageInput'),
    getPackageOutput: zodToJsonSchema(generatedEDeliveryResponseSchema, 'getPackageOutput'),
    deletePackageInput: zodToJsonSchema(packageIdInputSchema, 'deletePackageInput'),
    deletePackageOutput: zodToJsonSchema(emptyResponseSchema, 'deletePackageOutput'),
    getPackagesByLineItemIdInput: zodToJsonSchema(
      getPackagesByLineItemIdInputSchema,
      'getPackagesByLineItemIdInput',
    ),
    getPackagesByLineItemIdOutput: zodToJsonSchema(
      generatedEDeliveryResponseSchema,
      'getPackagesByLineItemIdOutput',
    ),
    cancelPackageInput: zodToJsonSchema(packageIdInputSchema, 'cancelPackageInput'),
    cancelPackageOutput: zodToJsonSchema(emptyResponseSchema, 'cancelPackageOutput'),
    clonePackageInput: zodToJsonSchema(packageIdInputSchema, 'clonePackageInput'),
    clonePackageOutput: zodToJsonSchema(generatedEDeliveryResponseSchema, 'clonePackageOutput'),
    confirmPackageInput: zodToJsonSchema(packageIdInputSchema, 'confirmPackageInput'),
    confirmPackageOutput: zodToJsonSchema(emptyResponseSchema, 'confirmPackageOutput'),
    bulkCancelPackagesInput: zodToJsonSchema(edeliveryBodyInputSchema, 'bulkCancelPackagesInput'),
    bulkCancelPackagesOutput: zodToJsonSchema(
      generatedEDeliveryResponseSchema,
      'bulkCancelPackagesOutput',
    ),
    bulkConfirmPackagesInput: zodToJsonSchema(edeliveryBodyInputSchema, 'bulkConfirmPackagesInput'),
    bulkConfirmPackagesOutput: zodToJsonSchema(
      generatedEDeliveryResponseSchema,
      'bulkConfirmPackagesOutput',
    ),
    bulkDeletePackagesInput: zodToJsonSchema(edeliveryBodyInputSchema, 'bulkDeletePackagesInput'),
    bulkDeletePackagesOutput: zodToJsonSchema(
      generatedEDeliveryResponseSchema,
      'bulkDeletePackagesOutput',
    ),
    getLabelsInput: zodToJsonSchema(getLabelsInputSchema, 'getLabelsInput'),
    getLabelsOutput: zodToJsonSchema(generatedEDeliveryResponseSchema, 'getLabelsOutput'),
    getHandoverSheetInput: zodToJsonSchema(getHandoverSheetInputSchema, 'getHandoverSheetInput'),
    getHandoverSheetOutput: zodToJsonSchema(
      generatedEDeliveryResponseSchema,
      'getHandoverSheetOutput',
    ),
    getTrackingInput: zodToJsonSchema(getTrackingInputSchema, 'getTrackingInput'),
    getTrackingOutput: zodToJsonSchema(generatedEDeliveryResponseSchema, 'getTrackingOutput'),
    createComplaintInput: zodToJsonSchema(edeliveryBodyInputSchema, 'createComplaintInput'),
    createComplaintOutput: zodToJsonSchema(emptyResponseSchema, 'createComplaintOutput'),

    // Common Types
    error: zodToJsonSchema(errorSchema, 'error'),
    errorParameter: zodToJsonSchema(errorParameterSchema, 'errorParameter'),
    amount: zodToJsonSchema(amountSchema, 'amount'),
    address: zodToJsonSchema(addressSchema, 'address'),
    contact: zodToJsonSchema(contactSchema, 'contact'),
    dimensions: zodToJsonSchema(dimensionsSchema, 'dimensions'),
    weight: zodToJsonSchema(weightSchema, 'weight'),
    pageMetadata: zodToJsonSchema(pageMetadataSchema, 'pageMetadata'),

    // Compliance Types
    complianceViolation: zodToJsonSchema(complianceViolationSchema, 'complianceViolation'),
    complianceDetail: zodToJsonSchema(complianceDetailSchema, 'complianceDetail'),
    correctiveRecommendations: zodToJsonSchema(
      correctiveRecommendationsSchema,
      'correctiveRecommendations',
    ),
    variationDetails: zodToJsonSchema(variationDetailsSchema, 'variationDetails'),
    nameValueList: zodToJsonSchema(nameValueListSchema, 'nameValueList'),

    // Translation Types
    translation: zodToJsonSchema(translationSchema, 'translation'),

    // VERO Types
    reportedItem: zodToJsonSchema(reportedItemSchema, 'reportedItem'),
    reportItemDetails: zodToJsonSchema(reportItemDetailsSchema, 'reportItemDetails'),

    userConsent: zodToJsonSchema(userConsentSchema, 'userConsent'),
  };
};
