import type { TradingApiClient } from '@/api/clientTrading.js';
import {
  type EbayApiError,
  type EndpointInputError,
  optionalPositiveNumberEffect,
  optionalStringEffect,
  requireObjectEffect,
  requireStringEffect,
} from '@/api/shared/request.js';
import type {
  createListingSchema,
  endListingSchema,
  getActiveListingsSchema,
  getListingSchema,
  getStoreCategoriesSchema,
  relistItemSchema,
  reviseListingSchema,
  uploadPictureSchema,
} from '@/utils/trading/trading.js';
import { isRecord } from '@/utils/typeGuards.js';
import { Effect } from 'effect';
import type { InferEffectSchema } from '@/utils/effectSchemaTypes.js';

/** Input accepted by getActiveListings. */
type GetActiveListingsInput = InferEffectSchema<typeof getActiveListingsSchema>;
/** Input accepted by getListing. */
type GetListingInput = InferEffectSchema<typeof getListingSchema>;
/** Input accepted by createListing. */
type CreateListingInput = InferEffectSchema<typeof createListingSchema>;
/** Input accepted by reviseListing. */
type ReviseListingInput = InferEffectSchema<typeof reviseListingSchema>;
/** Input accepted by endListing. */
type EndListingInput = InferEffectSchema<typeof endListingSchema>;
/** Input accepted by relistItem. */
type RelistItemInput = InferEffectSchema<typeof relistItemSchema>;
/** Input accepted by uploadPicture. */
type UploadPictureInput = InferEffectSchema<typeof uploadPictureSchema>;
/** Input accepted by getStoreCategories. */
type GetStoreCategoriesInput = InferEffectSchema<typeof getStoreCategoriesSchema>;

const asRecordArray = (value: unknown): Record<string, unknown>[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord);
};

/**
 * Drops the `Fees`/`DiscountReason` block eBay attaches to every listing
 * mutation response. It's ~25 always-present line items (almost always all
 * $0 for a standard fixed-price listing under the free-listing tier) that
 * callers driving this API programmatically have no use for — pure token
 * cost with zero information value. Every other field (Ack, Errors, ItemID,
 * Timestamp, etc.) passes through unchanged.
 */
const stripFees = (result: TradingRecordResponse): TradingRecordResponse => {
  const { Fees, DiscountReason, ...rest } = result;
  return rest;
};

/**
 * Parsed Trading API object payload returned unchanged from XML calls.
 *
 * @see https://developer.ebay.com/devzone/xml/docs/reference/ebay/index.html
 */
export type TradingRecordResponse = Record<string, unknown>;

/**
 * High-level wrapper for seller listing operations backed by eBay Trading API calls.
 */
export class TradingApi {
  private readonly client: TradingApiClient;

  constructor(client: TradingApiClient) {
    this.client = client;
  }

  /**
   * Fetches active seller listings with Trading API pagination metadata.
   *
   * @param input - Optional page number and entries-per-page values.
   * @returns An Effect that succeeds with the parsed GetMyeBaySelling response payload.
   *
   * @example
   * ```ts
   * const response = await Effect.runPromise(
   *   tradingApi.getActiveListings({ page: 2, entriesPerPage: 25 }),
   * );
   * ```
   *
   * @see https://developer.ebay.com/devzone/xml/docs/reference/ebay/getmyebayselling.html
   */
  getActiveListings = (
    input: GetActiveListingsInput = {},
  ): Effect.Effect<TradingRecordResponse, EbayApiError | EndpointInputError> => {
    const tradingClient = this.client;

    return Effect.gen(function* () {
      const request = yield* requireObjectEffect<GetActiveListingsInput>(input, 'input');
      const inputPage = yield* optionalPositiveNumberEffect(request.page, 'page');
      const inputEntriesPerPage = yield* optionalPositiveNumberEffect(
        request.entriesPerPage,
        'entriesPerPage',
      );
      const page = inputPage === undefined ? 1 : inputPage;
      const entriesPerPage = inputEntriesPerPage === undefined ? 50 : inputEntriesPerPage;

      return yield* tradingClient.execute('GetMyeBaySelling', {
        ActiveList: {
          Sort: 'TimeLeft',
          Pagination: {
            EntriesPerPage: entriesPerPage,
            PageNumber: page,
          },
        },
      });
    });
  };

  /**
   * Fetches a single listing by eBay item ID with full Trading API detail.
   *
   * @param input - eBay item identifier.
   * @returns An Effect that succeeds with the parsed Trading API item payload.
   *
   * @example
   * ```ts
   * const listing = await Effect.runPromise(tradingApi.getListing({ itemId: '12345' }));
   * ```
   *
   * @see https://developer.ebay.com/devzone/xml/docs/reference/ebay/getitem.html
   */
  getListing = (
    input: GetListingInput,
  ): Effect.Effect<TradingRecordResponse, EbayApiError | EndpointInputError> => {
    const tradingClient = this.client;

    return Effect.gen(function* () {
      const request = yield* requireObjectEffect<GetListingInput>(input, 'input');
      const itemId = yield* requireStringEffect(request.itemId, 'itemId');
      const result = yield* tradingClient.execute('GetItem', {
        ItemID: itemId,
        DetailLevel: 'ReturnAll',
        IncludeItemSpecifics: true,
      });
      const items = asRecordArray(result.Item);

      return items.length > 0 ? items[0] : result;
    });
  };

  /**
   * Creates a fixed-price listing using the supplied Trading API item payload.
   *
   * @param input - Trading API Item payload nested under `item`.
   * @returns An Effect that succeeds with the parsed AddFixedPriceItem response.
   *
   * @example
   * ```ts
   * const listing = await Effect.runPromise(
   *   tradingApi.createListing({ item: { Title: 'New item', StartPrice: 9.99 } }),
   * );
   * ```
   *
   * @see https://developer.ebay.com/devzone/xml/docs/reference/ebay/AddFixedPriceItem.html
   */
  createListing = (
    input: CreateListingInput,
  ): Effect.Effect<TradingRecordResponse, EbayApiError | EndpointInputError> => {
    const tradingClient = this.client;

    return Effect.gen(function* () {
      const request = yield* requireObjectEffect<CreateListingInput>(input, 'input');
      const item = yield* requireObjectEffect<Record<string, unknown>>(request.item, 'item');

      return yield* tradingClient
        .execute('AddFixedPriceItem', { Item: item })
        .pipe(Effect.map(stripFees));
    });
  };

  /**
   * Revises a fixed-price or auction listing by merging changes with the eBay item ID.
   *
   * @param input - eBay item identifier plus Trading API Item fields to update.
   * @returns An Effect that succeeds with the parsed ReviseItem response.
   *
   * @example
   * ```ts
   * const listing = await Effect.runPromise(
   *   tradingApi.reviseListing({ itemId: '12345', fields: { Quantity: 10 } }),
   * );
   * ```
   *
   * @see https://developer.ebay.com/devzone/xml/docs/reference/ebay/ReviseItem.html
   */
  reviseListing = (
    input: ReviseListingInput,
  ): Effect.Effect<TradingRecordResponse, EbayApiError | EndpointInputError> => {
    const tradingClient = this.client;

    return Effect.gen(function* () {
      const request = yield* requireObjectEffect<ReviseListingInput>(input, 'input');
      const itemId = yield* requireStringEffect(request.itemId, 'itemId');
      const fields = yield* requireObjectEffect<Record<string, unknown>>(request.fields, 'fields');

      // ReviseItem is the listing-type-agnostic call; ReviseFixedPriceItem
      // rejects auction (Chinese) listings with "Unsupported ListingType" even
      // for fields like Title that both listing types support.
      return yield* tradingClient
        .execute('ReviseItem', { Item: { ...fields, ItemID: itemId } })
        .pipe(Effect.map(stripFees));
    });
  };

  /**
   * Ends a fixed-price listing with the provided Trading API ending reason.
   *
   * @param input - eBay item identifier plus optional Trading API ending reason.
   * @returns An Effect that succeeds with the parsed EndFixedPriceItem response.
   *
   * @example
   * ```ts
   * await Effect.runPromise(
   *   tradingApi.endListing({ itemId: '12345', reason: 'NotAvailable' }),
   * );
   * ```
   *
   * @see https://developer.ebay.com/devzone/xml/docs/reference/ebay/endfixedpriceitem.html
   */
  endListing = (
    input: EndListingInput,
  ): Effect.Effect<TradingRecordResponse, EbayApiError | EndpointInputError> => {
    const tradingClient = this.client;

    return Effect.gen(function* () {
      const request = yield* requireObjectEffect<EndListingInput>(input, 'input');
      const itemId = yield* requireStringEffect(request.itemId, 'itemId');
      const inputReason = yield* optionalStringEffect(request.reason, 'reason');
      const reason = inputReason === undefined ? 'NotAvailable' : inputReason;

      return yield* tradingClient
        .execute('EndFixedPriceItem', { ItemID: itemId, EndingReason: reason })
        .pipe(Effect.map(stripFees));
    });
  };

  /**
   * Relists an ended fixed-price item with optional listing modifications.
   *
   * @param input - eBay item identifier plus optional Trading API Item modifications.
   * @returns An Effect that succeeds with the parsed RelistFixedPriceItem response.
   *
   * @example
   * ```ts
   * const listing = await Effect.runPromise(
   *   tradingApi.relistItem({ itemId: '12345', modifications: { Quantity: 20 } }),
   * );
   * ```
   *
   * @see https://developer.ebay.com/devzone/xml/docs/reference/ebay/relistfixedpriceitem.html
   */
  relistItem = (
    input: RelistItemInput,
  ): Effect.Effect<TradingRecordResponse, EbayApiError | EndpointInputError> => {
    const tradingClient = this.client;

    return Effect.gen(function* () {
      const request = yield* requireObjectEffect<RelistItemInput>(input, 'input');
      const itemId = yield* requireStringEffect(request.itemId, 'itemId');
      let modifications: Record<string, unknown> = {};

      if (request.modifications !== undefined) {
        modifications = yield* requireObjectEffect<Record<string, unknown>>(
          request.modifications,
          'modifications',
        );
      }

      return yield* tradingClient
        .execute('RelistFixedPriceItem', { Item: { ...modifications, ItemID: itemId } })
        .pipe(Effect.map(stripFees));
    });
  };

  /**
   * Uploads a picture to eBay Picture Services (EPS) and returns a permanent
   * eBay-hosted image URL for use in listing PictureDetails, instead of linking
   * to a third-party image host.
   *
   * @param input - Base64-encoded image data, filename, and optional MIME type / picture name.
   * @returns An Effect that succeeds with the parsed UploadSiteHostedPictures response payload.
   *
   * @example
   * ```ts
   * const result = await Effect.runPromise(
   *   tradingApi.uploadPicture({ imageBase64: '...', filename: 'photo.jpg' }),
   * );
   * ```
   *
   * @see https://developer.ebay.com/devzone/xml/docs/reference/ebay/UploadSiteHostedPictures.html
   */
  uploadPicture = (
    input: UploadPictureInput,
  ): Effect.Effect<TradingRecordResponse, EbayApiError | EndpointInputError> => {
    const tradingClient = this.client;

    return Effect.gen(function* () {
      const request = yield* requireObjectEffect<UploadPictureInput>(input, 'input');
      const imageBase64 = yield* requireStringEffect(request.imageBase64, 'imageBase64');
      const filename = yield* requireStringEffect(request.filename, 'filename');
      const inputContentType = yield* optionalStringEffect(request.contentType, 'contentType');
      const pictureName = yield* optionalStringEffect(request.pictureName, 'pictureName');
      const contentType = inputContentType === undefined ? 'image/jpeg' : inputContentType;
      const imageBuffer = Buffer.from(imageBase64, 'base64');

      return yield* tradingClient.executeUploadPicture({
        imageBuffer,
        filename,
        contentType,
        pictureName,
      });
    });
  };

  /**
   * Fetches the seller's eBay Store custom category tree (the folders shown
   * under "Store category" when listing/revising an item).
   *
   * @param input - No input fields; accepted for handler-signature consistency.
   * @returns An Effect that succeeds with the parsed GetStore response payload,
   * including Store.CustomCategories.CustomCategory (with nested ChildCategory).
   *
   * @example
   * ```ts
   * const result = await Effect.runPromise(tradingApi.getStoreCategories());
   * ```
   *
   * @see https://developer.ebay.com/devzone/xml/docs/reference/ebay/GetStore.html
   */
  getStoreCategories = (
    _input: GetStoreCategoriesInput = {},
  ): Effect.Effect<TradingRecordResponse, EbayApiError> => {
    const tradingClient = this.client;

    return tradingClient.execute('GetStore', { CategoryStructureOnly: true });
  };
}
