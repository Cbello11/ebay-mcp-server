/**
 * Tests for Effect-backed schema validation with native enums
 */

import { describe, it, expect } from 'vitest';
import { Effect, Either } from 'effect';
import {
  timeDurationSchema,
  regionSchema,
  shippingOptionSchema,
  depositSchema,
  returnPolicySchema,
  inventoryItemSchema,
  pricingSchema,
  offerSchema,
  locationSchema,
  refundDataSchema,
  fundingStrategySchema,
  messageDataSchema,
  feedbackDataSchema,
  infringementDataSchema,
  listingFeesRequestSchema,
} from '@/tools/schemas.js';
import {
  TimeDurationUnit,
  RegionType,
  ShippingCostType,
  ShippingOptionType,
  DepositType,
  RefundMethod,
  ReturnMethod,
  ReturnShippingCostPayer,
  Condition,
  LengthUnit,
  WeightUnit,
  PricingVisibility,
  FormatType,
  LocationType,
  MerchantLocationStatus,
  DayOfWeek,
  ReasonForRefund,
  FundingModel,
  MessageReferenceType,
  FeedbackRating,
  ReportedItemType,
} from '@/types/ebayEnums.js';
import { decodeEffectSchema, decodeEffectSchemaSync } from '@/utils/effectSchema.js';
import type { EffectBackedSchema, InferEffectSchema } from '@/utils/effectSchemaTypes.js';

type DecodeResult<TValue> = { success: true; data: TValue } | { success: false; error: unknown };

const decode = <TSchema extends EffectBackedSchema>(
  schema: TSchema,
  value: unknown,
): InferEffectSchema<TSchema> => decodeEffectSchemaSync(schema, value);

const decodeResult = <TSchema extends EffectBackedSchema>(
  schema: TSchema,
  value: unknown,
): DecodeResult<InferEffectSchema<TSchema>> => {
  const decoded = Effect.runSync(Effect.either(decodeEffectSchema(schema, value)));
  return Either.isRight(decoded)
    ? { success: true, data: decoded.right }
    : { success: false, error: decoded.left };
};

describe('Effect-backed schema enum validation', () => {
  describe('timeDurationSchema', () => {
    it('accept valid TimeDurationUnit enum values', () => {
      const validData = {
        unit: TimeDurationUnit.DAY,
        value: 30,
      };
      expect(() => decode(timeDurationSchema, validData)).not.toThrow();
    });

    it('accept all TimeDurationUnit values', () => {
      const units = [
        TimeDurationUnit.YEAR,
        TimeDurationUnit.MONTH,
        TimeDurationUnit.DAY,
        TimeDurationUnit.HOUR,
        TimeDurationUnit.CALENDAR_DAY,
        TimeDurationUnit.BUSINESS_DAY,
        TimeDurationUnit.MINUTE,
        TimeDurationUnit.SECOND,
        TimeDurationUnit.MILLISECOND,
      ];

      units.forEach((unit) => {
        const data = { unit, value: 10 };
        expect(() => decode(timeDurationSchema, data)).not.toThrow();
      });
    });

    it('reject invalid unit values', () => {
      const invalidData = {
        unit: 'INVALID_UNIT',
        value: 30,
      };
      expect(() => decode(timeDurationSchema, invalidData)).toThrow();
    });
  });

  describe('regionSchema', () => {
    it('accept valid RegionType enum values', () => {
      const validData = {
        regionName: 'United States',
        regionType: RegionType.COUNTRY,
      };
      expect(() => decode(regionSchema, validData)).not.toThrow();
    });

    it('accept all RegionType values', () => {
      const types = [
        RegionType.COUNTRY,
        RegionType.COUNTRY_REGION,
        RegionType.STATE_OR_PROVINCE,
        RegionType.WORLD_REGION,
        RegionType.WORLDWIDE,
      ];

      types.forEach((regionType) => {
        const data = { regionName: 'Test Region', regionType };
        expect(() => decode(regionSchema, data)).not.toThrow();
      });
    });
  });

  describe('shippingOptionSchema', () => {
    it('accept valid ShippingCostType and ShippingOptionType', () => {
      const validData = {
        costType: ShippingCostType.FLAT_RATE,
        optionType: ShippingOptionType.DOMESTIC,
        shippingServices: [],
      };
      expect(() => decode(shippingOptionSchema, validData)).not.toThrow();
    });

    it('accept CALCULATED cost type', () => {
      const data = {
        costType: ShippingCostType.CALCULATED,
        optionType: ShippingOptionType.INTERNATIONAL,
        shippingServices: [],
      };
      expect(() => decode(shippingOptionSchema, data)).not.toThrow();
    });
  });

  describe('depositSchema', () => {
    it('accept valid DepositType enum values', () => {
      const validData = {
        depositType: DepositType.PERCENTAGE,
        depositAmount: { currency: 'USD', value: '10' },
        dueIn: { unit: TimeDurationUnit.DAY, value: 7 },
      };
      expect(() => decode(depositSchema, validData)).not.toThrow();
    });

    it('accept FIXED_AMOUNT deposit type', () => {
      const data = {
        depositType: DepositType.FIXED_AMOUNT,
        depositAmount: { currency: 'USD', value: '100' },
        dueIn: { unit: TimeDurationUnit.DAY, value: 7 },
      };
      expect(() => decode(depositSchema, data)).not.toThrow();
    });
  });

  describe('returnPolicySchema', () => {
    it('accept valid RefundMethod, ReturnMethod, and ReturnShippingCostPayer', () => {
      const validData = {
        name: 'Test Policy',
        marketplaceId: 'EBAY_US',
        refundMethod: RefundMethod.MONEY_BACK,
        returnMethod: ReturnMethod.REPLACEMENT,
        returnShippingCostPayer: ReturnShippingCostPayer.SELLER,
        returnsAccepted: true,
      };
      expect(() => decode(returnPolicySchema, validData)).not.toThrow();
    });

    it('accept MERCHANDISE_CREDIT refund method', () => {
      const data = {
        name: 'Test Policy',
        marketplaceId: 'EBAY_US',
        refundMethod: RefundMethod.MERCHANDISE_CREDIT,
      };
      expect(() => decode(returnPolicySchema, data)).not.toThrow();
    });
  });

  describe('inventoryItemSchema', () => {
    it('accept valid Condition enum', () => {
      const validData = {
        availability: {
          shipToLocationAvailability: {
            quantity: 10,
          },
        },
        condition: Condition.NEW,
        product: {
          title: 'Test Product',
          description: 'Test Description',
        },
      };
      expect(() => decode(inventoryItemSchema, validData)).not.toThrow();
    });

    it('accept all Condition values', () => {
      const conditions = [
        Condition.NEW,
        Condition.LIKE_NEW,
        Condition.NEW_OTHER,
        Condition.NEW_WITH_DEFECTS,
        Condition.MANUFACTURER_REFURBISHED,
        Condition.CERTIFIED_REFURBISHED,
        Condition.USED_EXCELLENT,
        Condition.USED_VERY_GOOD,
        Condition.USED_GOOD,
        Condition.USED_ACCEPTABLE,
        Condition.FOR_PARTS_OR_NOT_WORKING,
      ];

      conditions.forEach((condition) => {
        const data = {
          availability: {
            shipToLocationAvailability: { quantity: 10 },
          },
          condition,
          product: {
            title: 'Test Product',
            description: 'Test Description',
          },
        };
        expect(() => decode(inventoryItemSchema, data)).not.toThrow();
      });
    });

    it('accept valid LengthUnit and WeightUnit', () => {
      const data = {
        availability: {
          shipToLocationAvailability: { quantity: 10 },
        },
        condition: Condition.NEW,
        product: {
          title: 'Test Product',
          description: 'Test Description',
        },
        packageWeightAndSize: {
          dimensions: {
            length: 10,
            width: 5,
            height: 3,
            unit: LengthUnit.INCH,
          },
          weight: {
            value: 2,
            unit: WeightUnit.POUND,
          },
        },
      };
      expect(() => decode(inventoryItemSchema, data)).not.toThrow();
    });
  });

  describe('pricingSchema', () => {
    it('accept valid PricingVisibility enum', () => {
      const validData = {
        price: { currency: 'USD', value: '99.99' },
        pricingVisibility: PricingVisibility.PRE_CHECKOUT,
      };
      expect(() => decode(pricingSchema, validData)).not.toThrow();
    });

    it('accept all PricingVisibility values', () => {
      const visibilities = [
        PricingVisibility.NONE,
        PricingVisibility.PRE_CHECKOUT,
        PricingVisibility.DURING_CHECKOUT,
      ];

      visibilities.forEach((pricingVisibility) => {
        const data = {
          price: { currency: 'USD', value: '99.99' },
          pricingVisibility,
        };
        expect(() => decode(pricingSchema, data)).not.toThrow();
      });
    });
  });

  describe('offerSchema', () => {
    it('accept valid FormatType enum', () => {
      const validData = {
        sku: 'TEST-SKU-001',
        marketplaceId: 'EBAY_US',
        format: FormatType.FIXED_PRICE,
        availableQuantity: 10,
        categoryId: '12345',
        listingPolicies: {
          fulfillmentPolicyId: 'fp-123',
          paymentPolicyId: 'pp-123',
          returnPolicyId: 'rp-123',
        },
        pricingSummary: {
          price: { currency: 'USD', value: '99.99' },
        },
      };
      expect(() => decode(offerSchema, validData)).not.toThrow();
    });

    it('accept AUCTION format type', () => {
      const data = {
        sku: 'TEST-SKU-001',
        marketplaceId: 'EBAY_US',
        format: FormatType.AUCTION,
        availableQuantity: 1,
        categoryId: '12345',
        listingPolicies: {
          fulfillmentPolicyId: 'fp-123',
          paymentPolicyId: 'pp-123',
          returnPolicyId: 'rp-123',
        },
        pricingSummary: {
          price: { currency: 'USD', value: '0.99' },
        },
      };
      expect(() => decode(offerSchema, data)).not.toThrow();
    });
  });

  describe('locationSchema', () => {
    it('accept valid LocationType and MerchantLocationStatus', () => {
      const validData = {
        name: 'Main Warehouse',
        merchantLocationStatus: MerchantLocationStatus.ENABLED,
        locationTypes: [LocationType.WAREHOUSE],
        location: {
          address: {
            addressLine1: '123 Main St',
            city: 'San Jose',
            stateOrProvince: 'CA',
            postalCode: '95131',
            country: 'US',
          },
        },
      };
      expect(() => decode(locationSchema, validData)).not.toThrow();
    });

    it('accept STORE location type', () => {
      const data = {
        name: 'Retail Store',
        merchantLocationStatus: MerchantLocationStatus.ENABLED,
        locationTypes: [LocationType.STORE],
        location: {
          address: {
            addressLine1: '456 Store Ave',
            city: 'New York',
            stateOrProvince: 'NY',
            postalCode: '10001',
            country: 'US',
          },
        },
      };
      expect(() => decode(locationSchema, data)).not.toThrow();
    });

    it('accept valid DayOfWeek in operating hours', () => {
      const data = {
        name: 'Store with Hours',
        merchantLocationStatus: MerchantLocationStatus.ENABLED,
        locationTypes: [LocationType.STORE],
        location: {
          address: {
            addressLine1: '789 Business Blvd',
            city: 'Chicago',
            stateOrProvince: 'IL',
            postalCode: '60601',
            country: 'US',
          },
        },
        operatingHours: [
          {
            dayOfWeekEnum: DayOfWeek.MONDAY,
            intervals: [{ open: '09:00', close: '17:00' }],
          },
          {
            dayOfWeekEnum: DayOfWeek.FRIDAY,
            intervals: [{ open: '09:00', close: '17:00' }],
          },
        ],
      };
      expect(() => decode(locationSchema, data)).not.toThrow();
    });
  });

  describe('refundDataSchema', () => {
    it('accept valid ReasonForRefund enum', () => {
      const validData = {
        reasonForRefund: ReasonForRefund.ITEM_DAMAGED,
      };
      expect(() => decode(refundDataSchema, validData)).not.toThrow();
    });

    it('accept all ReasonForRefund values', () => {
      const reasons = [
        ReasonForRefund.BUYER_CANCEL,
        ReasonForRefund.OUT_OF_STOCK,
        ReasonForRefund.FOUND_CHEAPER_PRICE,
        ReasonForRefund.INCORRECT_PRICE,
        ReasonForRefund.ITEM_DAMAGED,
        ReasonForRefund.ITEM_DEFECTIVE,
        ReasonForRefund.LOST_IN_TRANSIT,
        ReasonForRefund.MUTUALLY_AGREED,
        ReasonForRefund.SELLER_CANCEL,
      ];

      reasons.forEach((reasonForRefund) => {
        const data = { reasonForRefund };
        expect(() => decode(refundDataSchema, data)).not.toThrow();
      });
    });
  });

  describe('fundingStrategySchema', () => {
    it('accept valid FundingModel enum', () => {
      const validData = {
        fundingModel: FundingModel.COST_PER_SALE,
        bidPercentage: '5.0',
      };
      expect(() => decode(fundingStrategySchema, validData)).not.toThrow();
    });

    it('accept COST_PER_CLICK funding model', () => {
      const data = {
        fundingModel: FundingModel.COST_PER_CLICK,
        bidPercentage: '0.50',
      };
      expect(() => decode(fundingStrategySchema, data)).not.toThrow();
    });
  });

  describe('messageDataSchema', () => {
    it('accept valid MessageReferenceType enum', () => {
      const validData = {
        messageText: 'Test message',
        reference: {
          referenceId: '123456',
          referenceType: MessageReferenceType.LISTING,
        },
      };
      expect(() => decode(messageDataSchema, validData)).not.toThrow();
    });

    it('accept ORDER reference type', () => {
      const data = {
        messageText: 'Order inquiry',
        reference: {
          referenceId: 'order-789',
          referenceType: MessageReferenceType.ORDER,
        },
      };
      expect(() => decode(messageDataSchema, data)).not.toThrow();
    });
  });

  describe('feedbackDataSchema', () => {
    it('accept valid FeedbackRating enum', () => {
      const validData = {
        orderLineItemId: 'order-123-item-1',
        rating: FeedbackRating.POSITIVE,
        feedbackText: 'Great buyer!',
      };
      expect(() => decode(feedbackDataSchema, validData)).not.toThrow();
    });

    it('accept all FeedbackRating values', () => {
      const ratings = [FeedbackRating.POSITIVE, FeedbackRating.NEUTRAL, FeedbackRating.NEGATIVE];

      ratings.forEach((rating) => {
        const data = {
          orderLineItemId: 'order-123-item-1',
          rating,
        };
        expect(() => decode(feedbackDataSchema, data)).not.toThrow();
      });
    });
  });

  describe('infringementDataSchema', () => {
    it('accept valid ReportedItemType enum', () => {
      const validData = {
        itemId: '123456789',
        reportedItemType: ReportedItemType.LISTING,
        reportingReason: 'Copyright infringement',
      };
      expect(() => decode(infringementDataSchema, validData)).not.toThrow();
    });

    it('accept IMAGE reported item type', () => {
      const data = {
        itemId: '987654321',
        reportedItemType: ReportedItemType.IMAGE,
        reportingReason: 'Unauthorized image use',
      };
      expect(() => decode(infringementDataSchema, data)).not.toThrow();
    });
  });

  describe('listingFeesRequestSchema', () => {
    it('accept valid FormatType in offers', () => {
      const validData = {
        offers: [
          {
            offerId: 'offer-123',
            marketplaceId: 'EBAY_US',
            format: FormatType.FIXED_PRICE,
          },
        ],
      };
      expect(() => decode(listingFeesRequestSchema, validData)).not.toThrow();
    });

    it('accept AUCTION format in listing fees', () => {
      const data = {
        offers: [
          {
            offerId: 'offer-456',
            marketplaceId: 'EBAY_US',
            format: FormatType.AUCTION,
          },
        ],
      };
      expect(() => decode(listingFeesRequestSchema, data)).not.toThrow();
    });
  });

  describe('Cross-Schema Enum Consistency', () => {
    it('use the same TimeDurationUnit across schemas', () => {
      const durationData = {
        unit: TimeDurationUnit.BUSINESS_DAY,
        value: 3,
      };

      // Used in both timeDurationSchema and depositSchema
      expect(() => decode(timeDurationSchema, durationData)).not.toThrow();

      const depositData = {
        depositType: DepositType.PERCENTAGE,
        depositAmount: { currency: 'USD', value: '10' },
        dueIn: durationData,
      };
      expect(() => decode(depositSchema, depositData)).not.toThrow();
    });

    it('use the same FormatType across offer and listing fees schemas', () => {
      const format = FormatType.FIXED_PRICE;

      const offerData = {
        sku: 'TEST-SKU',
        marketplaceId: 'EBAY_US',
        format,
        availableQuantity: 10,
        categoryId: '12345',
        listingPolicies: {
          fulfillmentPolicyId: 'fp-123',
          paymentPolicyId: 'pp-123',
          returnPolicyId: 'rp-123',
        },
        pricingSummary: {
          price: { currency: 'USD', value: '99.99' },
        },
      };

      expect(() => decode(offerSchema, offerData)).not.toThrow();

      const feesData = {
        offers: [
          {
            offerId: 'offer-789',
            marketplaceId: 'EBAY_US',
            format,
          },
        ],
      };

      expect(() => decode(listingFeesRequestSchema, feesData)).not.toThrow();
    });
  });

  describe('Enum Validation Error Messages', () => {
    it('provide clear error for invalid enum value', () => {
      const invalidData = {
        unit: 'INVALID_UNIT',
        value: 30,
      };

      const parsed = decodeResult(timeDurationSchema, invalidData);

      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(String(parsed.error)).toContain('unit');
      }
    });

    it('validate nested enum values', () => {
      const invalidData = {
        depositType: 'INVALID_TYPE',
        depositAmount: { currency: 'USD', value: '10' },
        dueIn: { unit: TimeDurationUnit.DAY, value: 7 },
      };

      expect(() => decode(depositSchema, invalidData)).toThrow();
    });
  });
});
