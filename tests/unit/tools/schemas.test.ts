import { describe, it, expect } from 'vitest';
import { Effect, Either } from 'effect';
import {
  timeDurationSchema,
  amountSchema,
  regionSchema,
  regionSetSchema,
  fulfillmentPolicySchema,
  paymentPolicySchema,
  returnPolicySchema,
  inventoryItemSchema,
  offerSchema,
  locationSchema as inventoryLocationSchema,
} from '@/tools/schemas.js';
import { decodeEffectSchema } from '@/utils/effectSchema.js';
import type { EffectBackedSchema, InferEffectSchema } from '@/utils/effectSchemaTypes.js';

type DecodeResult<TValue> = { success: true; data: TValue } | { success: false; error: unknown };

const decodeResult = <TSchema extends EffectBackedSchema>(
  schema: TSchema,
  value: unknown,
): DecodeResult<InferEffectSchema<TSchema>> => {
  const decoded = Effect.runSync(Effect.either(decodeEffectSchema(schema, value)));
  return Either.isRight(decoded)
    ? { success: true, data: decoded.right }
    : { success: false, error: decoded.left };
};

describe('Schema Validation', () => {
  describe('Common Schemas', () => {
    describe('timeDurationSchema', () => {
      it('validate valid time duration', () => {
        const validDuration = {
          unit: 'DAY',
          value: 30,
        };

        const result = decodeResult(timeDurationSchema, validDuration);
        expect(result.success).toBe(true);
      });

      it('reject invalid unit', () => {
        const invalidDuration = {
          unit: 'INVALID_UNIT',
          value: 30,
        };

        const result = decodeResult(timeDurationSchema, invalidDuration);
        expect(result.success).toBe(false);
      });

      it('require unit and value', () => {
        const missingFields = {
          unit: 'DAY',
        };

        const result = decodeResult(timeDurationSchema, missingFields);
        expect(result.success).toBe(false);
      });

      it('allow additional properties (passthrough)', () => {
        const withExtra = {
          unit: 'DAY',
          value: 30,
          extraField: 'extra',
        };

        const result = decodeResult(timeDurationSchema, withExtra);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toHaveProperty('extraField');
        }
      });
    });

    describe('amountSchema', () => {
      it('validate valid amount', () => {
        const validAmount = {
          currency: 'USD',
          value: '99.99',
        };

        const result = decodeResult(amountSchema, validAmount);
        expect(result.success).toBe(true);
      });

      it('accept different currencies', () => {
        const currencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'];

        currencies.forEach((currency) => {
          const amount = { currency, value: '100.00' };
          const result = decodeResult(amountSchema, amount);
          expect(result.success).toBe(true);
        });
      });

      it('require both currency and value', () => {
        const missingValue = { currency: 'USD' };
        const missingCurrency = { value: '99.99' };

        expect(decodeResult(amountSchema, missingValue).success).toBe(false);
        expect(decodeResult(amountSchema, missingCurrency).success).toBe(false);
      });
    });

    describe('regionSchema', () => {
      it('validate region with name and type', () => {
        const validRegion = {
          regionName: 'United States',
          regionType: 'COUNTRY',
        };

        const result = decodeResult(regionSchema, validRegion);
        expect(result.success).toBe(true);
      });

      it('allow optional fields', () => {
        const minimalRegion = {};

        const result = decodeResult(regionSchema, minimalRegion);
        expect(result.success).toBe(true);
      });

      it('validate all region types', () => {
        const regionTypes = [
          'COUNTRY',
          'COUNTRY_REGION',
          'STATE_OR_PROVINCE',
          'WORLD_REGION',
          'WORLDWIDE',
        ];

        regionTypes.forEach((regionType) => {
          const region = { regionName: 'Test', regionType };
          const result = decodeResult(regionSchema, region);
          expect(result.success).toBe(true);
        });
      });
    });

    describe('regionSetSchema', () => {
      it('validate region set with included and excluded regions', () => {
        const validRegionSet = {
          regionIncluded: [
            { regionName: 'United States', regionType: 'COUNTRY' },
            { regionName: 'Canada', regionType: 'COUNTRY' },
          ],
          regionExcluded: [{ regionName: 'Alaska', regionType: 'STATE_OR_PROVINCE' }],
        };

        const result = decodeResult(regionSetSchema, validRegionSet);
        expect(result.success).toBe(true);
      });

      it('allow empty region set', () => {
        const result = decodeResult(regionSetSchema, {});
        expect(result.success).toBe(true);
      });
    });
  });

  describe('Account Management Schemas', () => {
    describe('fulfillmentPolicySchema', () => {
      it('validate basic fulfillment policy', () => {
        const validPolicy = {
          name: 'Standard Shipping',
          marketplaceId: 'EBAY_US',
          categoryTypes: [{ name: 'ALL_EXCLUDING_MOTORS_VEHICLES', default: true }],
          handlingTime: { unit: 'DAY', value: 1 },
          shippingOptions: [
            {
              costType: 'FLAT_RATE',
              optionType: 'DOMESTIC',
              shippingServices: [
                {
                  shippingCost: { currency: 'USD', value: '5.99' },
                  shippingCarrierCode: 'USPS',
                  shippingServiceCode: 'USPSPriority',
                },
              ],
            },
          ],
        };

        const result = decodeResult(fulfillmentPolicySchema, validPolicy);
        expect(result.success).toBe(true);
      });

      it('require name and marketplaceId', () => {
        const missingName = { marketplaceId: 'EBAY_US' };
        const missingMarketplace = { name: 'Test Policy' };

        expect(decodeResult(fulfillmentPolicySchema, missingName).success).toBe(false);
        expect(decodeResult(fulfillmentPolicySchema, missingMarketplace).success).toBe(false);
      });
    });

    describe('paymentPolicySchema', () => {
      it('validate basic payment policy', () => {
        const validPolicy = {
          name: 'Immediate Payment Required',
          marketplaceId: 'EBAY_US',
          categoryTypes: [{ name: 'ALL_EXCLUDING_MOTORS_VEHICLES', default: true }],
          paymentMethods: [{ paymentMethodType: 'PAYPAL' }],
        };

        const result = decodeResult(paymentPolicySchema, validPolicy);
        expect(result.success).toBe(true);
      });

      it('require name and marketplaceId', () => {
        const missingName = { marketplaceId: 'EBAY_US' };

        expect(decodeResult(paymentPolicySchema, missingName).success).toBe(false);
      });
    });

    describe('returnPolicySchema', () => {
      it('validate return policy', () => {
        const validPolicy = {
          name: '30 Day Returns',
          marketplaceId: 'EBAY_US',
          categoryTypes: [{ name: 'ALL_EXCLUDING_MOTORS_VEHICLES', default: true }],
          returnsAccepted: true,
          returnPeriod: { unit: 'DAY', value: 30 },
        };

        const result = decodeResult(returnPolicySchema, validPolicy);
        expect(result.success).toBe(true);
      });

      it('allow no returns accepted', () => {
        const noReturns = {
          name: 'No Returns',
          marketplaceId: 'EBAY_US',
          returnsAccepted: false,
        };

        const result = decodeResult(returnPolicySchema, noReturns);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('Inventory Management Schemas', () => {
    describe('inventoryItemSchema', () => {
      it('validate complete inventory item', () => {
        const validItem = {
          availability: {
            shipToLocationAvailability: {
              quantity: 10,
            },
          },
          condition: 'NEW',
          product: {
            title: 'Test Product',
            description: 'A test product description',
            aspects: {
              Brand: ['Test Brand'],
              Color: ['Blue'],
            },
            imageUrls: ['https://example.com/image.jpg'],
          },
        };

        const result = decodeResult(inventoryItemSchema, validItem);
        expect(result.success).toBe(true);
      });

      it('allow missing availability (all fields optional)', () => {
        const missingAvailability = {
          condition: 'NEW',
          product: {
            title: 'Test',
            description: 'Test',
          },
        };

        const result = decodeResult(inventoryItemSchema, missingAvailability);
        expect(result.success).toBe(true);
      });

      it('accept different conditions', () => {
        const conditions = ['NEW', 'LIKE_NEW', 'NEW_OTHER', 'USED_EXCELLENT', 'USED_GOOD'];

        conditions.forEach((condition) => {
          const item = {
            availability: { shipToLocationAvailability: { quantity: 1 } },
            condition,
            product: { title: 'Test' },
          };
          const result = decodeResult(inventoryItemSchema, item);
          expect(result.success).toBe(true);
        });
      });
    });

    describe('offerSchema', () => {
      it('validate complete offer', () => {
        const validOffer = {
          sku: 'TEST-SKU-001',
          marketplaceId: 'EBAY_US',
          format: 'FIXED_PRICE',
          listingPolicies: {
            fulfillmentPolicyId: '12345',
            paymentPolicyId: '67890',
            returnPolicyId: '11111',
          },
          pricingSummary: {
            price: { currency: 'USD', value: '99.99' },
          },
          quantityLimitPerBuyer: 5,
          categoryId: '1234',
        };

        const result = decodeResult(offerSchema, validOffer);
        expect(result.success).toBe(true);
      });

      it('require sku and marketplaceId', () => {
        const missingSku = { marketplaceId: 'EBAY_US', format: 'FIXED_PRICE' };
        const missingMarketplace = { sku: 'TEST-001', format: 'FIXED_PRICE' };

        expect(decodeResult(offerSchema, missingSku).success).toBe(false);
        expect(decodeResult(offerSchema, missingMarketplace).success).toBe(false);
      });

      it('validate listing formats', () => {
        const formats = ['FIXED_PRICE', 'AUCTION'];

        formats.forEach((format) => {
          const offer = {
            sku: 'TEST-001',
            marketplaceId: 'EBAY_US',
            format,
          };
          const result = decodeResult(offerSchema, offer);
          expect(result.success).toBe(true);
        });
      });
    });

    describe('inventoryLocationSchema', () => {
      it('validate inventory location', () => {
        const validLocation = {
          location: {
            address: {
              addressLine1: '123 Main St',
              city: 'San Jose',
              stateOrProvince: 'CA',
              postalCode: '95110',
              country: 'US',
            },
          },
          locationInstructions: 'Loading dock at rear',
          name: 'Main Warehouse',
          merchantLocationStatus: 'ENABLED',
          locationTypes: ['WAREHOUSE'],
        };

        const result = decodeResult(inventoryLocationSchema, validLocation);
        expect(result.success).toBe(true);
      });

      it('allow missing location object (all fields optional)', () => {
        const missingLocation = {
          name: 'Test Location',
          merchantLocationStatus: 'ENABLED',
        };

        const result = decodeResult(inventoryLocationSchema, missingLocation);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('Schema Edge Cases', () => {
    it('handle empty objects gracefully', () => {
      const schemas = [regionSchema, regionSetSchema];

      schemas.forEach((schema) => {
        const result = decodeResult(schema, {});
        expect(result.success).toBe(true);
      });
    });

    it('reject non-object values', () => {
      const schemas = [amountSchema, timeDurationSchema, regionSchema];

      const invalidValues = [null, undefined, 'string', 123, [], true];

      schemas.forEach((schema) => {
        invalidValues.forEach((value) => {
          const result = decodeResult(schema, value);
          expect(result.success).toBe(false);
        });
      });
    });

    it('preserve extra fields with passthrough', () => {
      const schemaWithExtra = decodeResult(amountSchema, {
        currency: 'USD',
        value: '99.99',
        metadata: { source: 'test' },
        customField: 'custom',
      });

      expect(schemaWithExtra.success).toBe(true);
      if (schemaWithExtra.success) {
        expect(schemaWithExtra.data).toHaveProperty('metadata');
        expect(schemaWithExtra.data).toHaveProperty('customField');
      }
    });
  });
});
