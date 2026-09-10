# eBay MCP API Schemas

This directory contains comprehensive Effect-backed schemas for eBay API endpoints, organized by functional area. Schemas are authored with `@/utils/effectSchema.js`, which attaches Effect Schema metadata while preserving the Zod-compatible carrier required by the MCP SDK and `zod-to-json-schema`.

## 📁 Directory Structure

```
src/schemas/
├── account-management/    # Account, policies, programs
│   └── account.ts
├── inventory-management/  # Inventory items, offers, locations
│   └── inventory.ts
├── communication/         # Messages, feedback, notifications
│   └── messages.ts
├── fulfillment/          # Orders, shipping, refunds
│   └── orders.ts
├── marketing/            # Campaigns, ads, keywords, promotions
│   └── marketing.ts
├── metadata/             # Marketplace policies, compatibility
│   └── metadata.ts
├── analytics/            # Reports, metrics, seller standards
│   └── analytics.ts
├── taxonomy/             # Categories, suggestions, aspects
│   └── taxonomy.ts
├── other/                # Identity, compliance, VERO, translation, eDelivery
│   └── otherApis.ts
├── index.ts              # Central export point
└── README.md             # This file
```

## Schema ownership

| Surface | Owns |
| --- | --- |
| `src/tools/schemas.ts` | Shared primitives reused across families |
| `src/schemas/<family>/` | Endpoint/tool input (and optional response) schemas for that family |
| `src/types/**` | Generated eBay DTOs — regenerate with `pnpm run sync`; never hand-edit |

See [ARCHITECTURE.md](../../ARCHITECTURE.md#schema-ownership) for the family map.

## 🎯 Purpose

The schemas in this directory serve multiple purposes:

1. **Input Validation**: Decode request parameters through Effect before sending to eBay APIs
2. **Output Validation**: Ensure API responses match expected structures
3. **Type Safety**: Provide TypeScript types for compile-time checking
4. **JSON Schema Generation**: Convert the Zod-compatible adapter carrier to JSON Schema for MCP tools
5. **Documentation**: Self-documenting code with schema descriptions

## 🚀 Usage

### Basic Import

```typescript
import {
  getAccountManagementJsonSchemas,
  getInventoryManagementJsonSchemas,
  getCommunicationJsonSchemas,
  getFulfillmentJsonSchemas,
  getMarketingJsonSchemas,
  getMetadataJsonSchemas,
  getAnalyticsJsonSchemas,
  getTaxonomyJsonSchemas,
  getOtherApisJsonSchemas,
  getAllJsonSchemas, // Gets all schemas at once
} from '@/schemas';

// Get all JSON schemas for a specific category
const accountSchemas = getAccountManagementJsonSchemas();

// Access specific schemas
const inputSchema = accountSchemas.getFulfillmentPoliciesInput;
const outputSchema = accountSchemas.getFulfillmentPoliciesOutput;

// Or get all schemas at once
const allSchemas = getAllJsonSchemas();
const marketingCampaignSchema = allSchemas.marketing.createCampaignInput;
```

### Using Effect-Backed Schemas for Validation

```typescript
import { Effect } from 'effect';
import { getInventoryItemInputSchema, getInventoryItemOutputSchema } from '@/schemas';
import { decodeEffectSchema } from '@/utils/effectSchema.js';

// Validate input
const input = await Effect.runPromise(
  decodeEffectSchema(getInventoryItemInputSchema, { sku: 'ABC123' }),
);

// Validate output
const response = await Effect.runPromise(api.inventory.getInventoryItem(input));
const validatedOutput = await Effect.runPromise(
  decodeEffectSchema(getInventoryItemOutputSchema, response),
);
```

### Using JSON Schemas with MCP Tools

```typescript
import { getInventoryManagementJsonSchemas } from '@/schemas';

const schemas = getInventoryManagementJsonSchemas();

// Use in MCP tool definition
const tool = {
  name: 'ebay_get_inventory_item',
  description: 'Get a specific inventory item by SKU',
  inputSchema: schemas.getInventoryItemInput,
  outputSchema: schemas.getInventoryItemOutput,
};
```

## 📚 Available Schema Categories

### 1. Account Management (`account-management/account.ts`)

Schemas for managing seller account settings, business policies, and programs.

**Endpoints Covered:**

- Custom Policies (PRODUCT_COMPLIANCE, TAKE_BACK)
- Fulfillment Policies (shipping rules, handling time)
- Payment Policies (payment methods, immediate pay)
- Return Policies (return period, refund method)
- Sales Tax (jurisdiction-based tax rules)
- Programs (opt-in/opt-out programs)
- KYC (seller verification status)
- Privileges (selling limits and permissions)

**Key Schemas:**

- `getFulfillmentPoliciesInputSchema` / `getFulfillmentPoliciesOutputSchema`
- `createPaymentPolicyInputSchema` / `createPaymentPolicyOutputSchema`
- `getReturnPoliciesInputSchema` / `getReturnPoliciesOutputSchema`

### 2. Inventory Management (`inventory-management/inventory.ts`)

Schemas for inventory items, offers, locations, and product compatibility.

**Endpoints Covered:**

- Inventory Items (create, read, update, delete)
- Offers (pricing, availability, publishing)
- Inventory Locations (warehouses, stores)
- Product Compatibility (vehicle parts)
- Inventory Item Groups (variations)
- Bulk Operations (batch processing)

**Key Schemas:**

- `getInventoryItemsInputSchema` / `getInventoryItemsOutputSchema`
- `createOfferInputSchema` / `createOfferOutputSchema`
- `publishOfferInputSchema` / `publishOfferOutputSchema`
- `bulkInventoryItemRequestSchema` / `bulkInventoryItemResponseSchema`

### 3. Communication (`communication/messages.ts`)

Schemas for messages, feedback, notifications, and negotiations.

**Endpoints Covered:**

- Message API (conversations, messages)
- Feedback API (leave feedback, respond to feedback)
- Notification API (destinations, subscriptions, topics)
- Negotiation API (offers to buyers)

**Key Schemas:**

- `sendMessageInputSchema` / `sendMessageOutputSchema`
- `leaveFeedbackInputSchema` / `leaveFeedbackOutputSchema`
- `createNotificationSubscriptionInputSchema` / `createNotificationSubscriptionOutputSchema`
- `sendOfferToInterestedBuyersInputSchema` / `sendOfferToInterestedBuyersOutputSchema`

### 4. Fulfillment (`fulfillment/orders.ts`)

Schemas for order management, shipping, refunds, and payment disputes.

**Endpoints Covered:**

- Orders (retrieve, filter orders)
- Shipping Fulfillment (create, track shipments)
- Refunds (issue refunds)
- Payment Disputes (manage buyer disputes)

**Key Schemas:**

- `getOrdersInputSchema` / `getOrdersOutputSchema`
- `createShippingFulfillmentInputSchema` / `createShippingFulfillmentOutputSchema`
- `issueRefundInputSchema` / `issueRefundOutputSchema`
- `getPaymentDisputeSummariesInputSchema` / `getPaymentDisputeSummariesOutputSchema`

### 5. Marketing & Promotions (`marketing/marketing.ts`)

Schemas for advertising campaigns, ads, keywords, promotions, and recommendations.

**Endpoints Covered (71 total):**

- Campaign Management (create, update, pause, resume, end campaigns)
- Ad Operations (single and bulk operations for creating, updating, deleting ads)
- Ad Group Management (create, update, get ad groups)
- Keyword Management (create, update, bulk keyword operations)
- Negative Keywords (campaign and ad group level)
- Targeting & Bid Suggestions
- Reporting (create report tasks, get report metadata)
- Item Promotions (discounts, coupons, markdown sales, volume discounts)
- Email Campaigns
- Recommendations

**Key Schemas:**

- `createCampaignInputSchema` / `createCampaignOutputSchema`
- `createAdInputSchema` / `createAdOutputSchema`
- `bulkCreateAdsInputSchema` / `bulkCreateAdsOutputSchema`
- `createKeywordInputSchema` / `createKeywordOutputSchema`
- `createItemPromotionInputSchema` / `createItemPromotionOutputSchema`
- `suggestBidsOutputSchema` / `suggestKeywordsOutputSchema`

### 6. Metadata (`metadata/metadata.ts`)

Schemas for marketplace policies and product compatibility.

**Endpoints Covered (23 total):**

- Marketplace Policies (automotive compatibility, category policies, EPR, hazmat labels, item conditions, listing structure, negotiated price, product safety, regulatory, return policy metadata, shipping cost types, classified ads, currencies, listing types, motors, shipping policies, site visibility)
- Compatibility (by specification, property names/values, multi-property values, product compatibilities)
- Sales Tax Jurisdictions

**Key Schemas:**

- `getCategoryPoliciesOutputSchema`
- `getItemConditionPoliciesOutputSchema`
- `getCompatibilityPropertyNamesOutputSchema`
- `getProductCompatibilitiesOutputSchema`
- `getSalesTaxJurisdictionsOutputSchema`

### 7. Analytics (`analytics/analytics.ts`)

Schemas for reports, metrics, and seller performance tracking.

**Endpoints Covered (4 total):**

- Traffic Reports (analyze listing views and search impressions)
- Seller Standards Profiles (monitor seller performance)
- Customer Service Metrics (track customer service quality)

**Key Schemas:**

- `getTrafficReportInputSchema` / `getTrafficReportOutputSchema`
- `getSellerStandardsProfileOutputSchema`
- `getCustomerServiceMetricOutputSchema`

### 8. Taxonomy (`taxonomy/taxonomy.ts`)

Schemas for category navigation, suggestions, and product aspects.

**Endpoints Covered (4 total):**

- Category Tree (get category hierarchy)
- Category Suggestions (find appropriate categories for items)
- Item Aspects (get required/recommended aspects for categories)

**Key Schemas:**

- `getCategoryTreeOutputSchema`
- `getCategorySuggestionsInputSchema` / `getCategorySuggestionsOutputSchema`
- `getItemAspectsForCategoryOutputSchema`

### 9. Other APIs (`other/otherApis.ts`)

Schemas for identity, compliance, VERO, translation, and international shipping.

**Endpoints Covered (40 total):**

- Commerce Identity API (user information)
- Sell Compliance API (listing violations, suppression)
- Commerce VERO API (intellectual property rights reporting)
- Commerce Translation API (content translation)
- Sell eDelivery International Shipping API (actual costs, services, bundles, packages, labels, tracking)

**Key Schemas:**

- `getUserOutputSchema`
- `getListingViolationsOutputSchema`
- `createVeroReportInputSchema` / `createVeroReportOutputSchema`
- `translateInputSchema` / `translateOutputSchema`
- `getActualCostsInputSchema` / `getActualCostsOutputSchema`
- `createPackageInputSchema` / `createPackageOutputSchema`
- `getTrackingInputSchema` / `getTrackingOutputSchema`

## 🔧 Schema Naming Convention

All schemas follow a consistent naming pattern:

- **Input Schemas**: `{actionName}InputSchema`
  - Example: `getOrdersInputSchema`, `createOfferInputSchema`

- **Output Schemas**: `{actionName}OutputSchema`
  - Example: `getOrdersOutputSchema`, `createOfferOutputSchema`

- **Detail/Entity Schemas**: `{entityName}Schema`
  - Example: `orderSchema`, `offerResponseSchema`, `lineItemSchema`

## 🛠️ Adding New Schemas

When adding schemas for new endpoints:

1. **Create a new file** in the appropriate category folder
2. **Import required enums** from `@/types/ebayEnums.js`
3. **Define Effect-backed schemas** for inputs and outputs
4. **Add JSON Schema converter function** (e.g., `getMarketingJsonSchemas()`)
5. **Export from `index.ts`**
6. **Update this README** with the new category

### Example Template:

```typescript
import { zodToJsonSchema } from 'zod-to-json-schema';
import { z } from '@/utils/effectSchema.js';

// Common schemas
const errorSchema = z.object({...});

// Input schema
export const actionNameInputSchema = z.object({
  param1: z.string().describe('Description'),
  param2: z.number().optional(),
});

// Output schema
export const actionNameOutputSchema = z.object({
  result: z.string().optional(),
  warnings: z.array(errorSchema).optional(),
});

/**
 * Converts category schemas to JSON Schema format for MCP tools.
 *
 * @returns Category JSON schemas keyed by endpoint or shared model name.
 * @example
 * ```ts
 * const schemas = getCategoryJsonSchemas();
 * ```
 */
export const getCategoryJsonSchemas = () => {
  return {
    actionNameInput: zodToJsonSchema(actionNameInputSchema, 'actionNameInput'),
    actionNameOutput: zodToJsonSchema(actionNameOutputSchema, 'actionNameOutput'),
  };
};
```

## 🧪 Testing Schemas

To test schema validation:

```typescript
import { describe, it, expect } from 'vitest';
import { Effect } from 'effect';
import { getInventoryItemInputSchema } from '@/schemas';
import { decodeEffectSchema } from '@/utils/effectSchema.js';

describe('Inventory Schemas', () => {
  it('validates correct input', async () => {
    await expect(
      Effect.runPromise(decodeEffectSchema(getInventoryItemInputSchema, { sku: 'TEST-SKU-123' })),
    ).resolves.toEqual({ sku: 'TEST-SKU-123' });
  });

  it('rejects invalid input', async () => {
    await expect(
      Effect.runPromise(decodeEffectSchema(getInventoryItemInputSchema, {})),
    ).rejects.toThrow();
  });
});
```

## 📖 Related Documentation

- [Effect Schema Documentation](https://effect.website/docs/schema/introduction/)
- [zod-to-json-schema](https://github.com/StefanTerdell/zod-to-json-schema)
- [eBay API Documentation](https://developer.ebay.com/api-docs/)
- [MCP Protocol Specification](https://modelcontextprotocol.io/)

## 🎨 Design Principles

1. **DRY (Don't Repeat Yourself)**: Reuse common schemas (error, amount, address)
2. **Type Safety**: Leverage TypeScript and Effect Schema for compile-time and runtime safety
3. **Descriptive**: Use `.describe()` to document schema fields
4. **Optional by Default**: Make fields optional unless they're truly required
5. **Passthrough**: Use `.passthrough()` to allow additional properties from eBay
6. **Enum Support**: Use native enums from `@/types/ebayEnums.js`

## ✅ Completion Status

All eBay API endpoints now have comprehensive Effect-backed schemas!

- [x] **Account Management** - 21 endpoints ✅
- [x] **Inventory Management** - 30 endpoints ✅
- [x] **Communication** - 11 endpoints ✅
- [x] **Fulfillment** - 16 endpoints ✅
- [x] **Marketing & Promotions** - 71 endpoints ✅
- [x] **Metadata** - 23 endpoints ✅
- [x] **Analytics** - 4 endpoints ✅
- [x] **Taxonomy** - 4 endpoints ✅
- [x] **Other APIs** - 40 endpoints ✅

**Total: 220 eBay API endpoints with full input/output schemas**

## 🚧 Future Enhancements

- [ ] Integration tests for all schemas
- [ ] Schema validation benchmarks
- [ ] Performance optimization for large-scale validation
- [ ] Additional enum validation for marketplace-specific values
- [ ] Schema versioning strategy for API updates

## 📝 Notes

- All schemas use `.optional()` for fields that may not be present in responses
- Error schemas are consistent across all endpoints
- Amount schemas support currency conversion fields
- Date fields use ISO 8601 string format
- All schemas support eBay's standard pagination (href, limit, offset, etc.)
- All schemas validated against openapi-typescript generated types
- Required vs optional fields precisely match eBay API specifications

## 📊 Statistics

- **Total Effect-Backed Schemas**: 450+
- **Total JSON Schemas**: 220+
- **Lines of Code**: 5,000+
- **API Categories**: 9
- **Coverage**: 100% of eBay Seller APIs

---

**Last Updated**: 2025-11-16
**Status**: ✅ Complete
**Effect Version**: see `package.json`
**Zod Compatibility Carrier**: 3.x
**zod-to-json-schema Version**: 3.24.6
**Validation Status**: All schemas verified against TypeScript types
