import type { TradingApiClient } from '@/api/clientTrading.js';
import { readFile, stat } from 'node:fs/promises';
import { ImageFetchError, fetchRemoteImage } from '@/utils/imageFetch.js';
import { basename, extname, isAbsolute, resolve } from 'node:path';
import {
  type EbayApiError,
  EndpointInputError,
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
import { apiLogger } from '@/utils/logger.js';
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

/** Largest image accepted by the Media API upload path (12 MiB). */
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

/** Content types inferred from a file extension when the caller omits one. */
const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

/**
 * Check that a file's magic bytes match the content type it claims, so a
 * mislabelled or non-image file is rejected before it reaches eBay.
 */
const hasImageSignature = (buffer: Buffer, contentType: string): boolean => {
  if (contentType === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (contentType === 'image/png') {
    return (
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    );
  }
  if (contentType === 'image/gif') {
    return (
      buffer.length >= 6 &&
      (buffer.subarray(0, 6).toString('ascii') === 'GIF87a' ||
        buffer.subarray(0, 6).toString('ascii') === 'GIF89a')
    );
  }
  if (contentType === 'image/webp') {
    return (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }
  return true;
};

/** Image bytes plus the multipart metadata the Media API upload needs. */
interface ImageSource {
  readonly imageBuffer: Buffer;
  readonly filename: string;
  readonly contentType: string;
}

/** Load an image from the MCP server's own filesystem (local/stdio use). */
const readLocalImage = ({
  imagePath,
  filenameInput,
  contentTypeInput,
}: {
  readonly imagePath: string;
  readonly filenameInput: string | undefined;
  readonly contentTypeInput: string | undefined;
}): Effect.Effect<ImageSource, EndpointInputError> =>
  Effect.gen(function* () {
    const resolvedPath = isAbsolute(imagePath) ? imagePath : resolve(process.cwd(), imagePath);

    const fileInfo = yield* Effect.tryPromise({
      try: () => stat(resolvedPath),
      catch: (error) => error,
    }).pipe(
      Effect.mapError(
        (error) =>
          new EndpointInputError({
            parameter: 'imagePath',
            message: `Unable to read image file "${resolvedPath}": ${error instanceof Error ? error.message : String(error)}`,
          }),
      ),
    );
    if (!fileInfo.isFile()) {
      return yield* Effect.fail(
        new EndpointInputError({
          parameter: 'imagePath',
          message: 'imagePath must point to a regular file',
        }),
      );
    }
    if (fileInfo.size === 0) {
      return yield* Effect.fail(
        new EndpointInputError({
          parameter: 'imagePath',
          message: 'imagePath points to an empty file',
        }),
      );
    }
    if (fileInfo.size > MAX_IMAGE_BYTES) {
      return yield* Effect.fail(
        new EndpointInputError({
          parameter: 'imagePath',
          message: `Image is ${fileInfo.size} bytes; maximum supported size is ${MAX_IMAGE_BYTES} bytes (12 MiB).`,
        }),
      );
    }

    const filename = filenameInput ?? basename(resolvedPath);
    const extension = extname(filename).toLowerCase();
    const contentType = contentTypeInput ?? MIME_BY_EXTENSION[extension];
    if (!contentType) {
      return yield* Effect.fail(
        new EndpointInputError({
          parameter: 'contentType',
          message:
            'Unsupported image extension. Provide contentType explicitly for this image type.',
        }),
      );
    }

    const imageBuffer = yield* Effect.tryPromise({
      try: () => readFile(resolvedPath),
      catch: (error) => error,
    }).pipe(
      Effect.mapError(
        (error) =>
          new EndpointInputError({
            parameter: 'imagePath',
            message: `Unable to load image file: ${error instanceof Error ? error.message : String(error)}`,
          }),
      ),
    );

    return { imageBuffer, filename, contentType };
  });

/**
 * Download an image over HTTPS so hosted deployments work without a shared
 * filesystem. SSRF guards, the size cap, and the timeout live in
 * {@link fetchRemoteImage}.
 */
const downloadRemoteImage = ({
  imageUrl,
  filenameInput,
  contentTypeInput,
}: {
  readonly imageUrl: string;
  readonly filenameInput: string | undefined;
  readonly contentTypeInput: string | undefined;
}): Effect.Effect<ImageSource, EndpointInputError> =>
  Effect.gen(function* () {
    const remote = yield* Effect.tryPromise({
      try: () => fetchRemoteImage({ url: imageUrl, maxBytes: MAX_IMAGE_BYTES }),
      catch: (error) => error,
    }).pipe(
      Effect.mapError(
        (error) =>
          new EndpointInputError({
            parameter: 'imageUrl',
            message:
              error instanceof ImageFetchError
                ? error.message
                : `Unable to fetch imageUrl: ${error instanceof Error ? error.message : String(error)}`,
          }),
      ),
    );

    const filename = filenameInput ?? remote.filename;
    const contentType = contentTypeInput ?? remote.contentType;
    return { imageBuffer: remote.buffer, filename, contentType };
  });

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

      // This seller account uses eBay Business Policies. Strip legacy
      // shipping/payment/return fields before sending — passing them causes
      // eBay warning 21919456 and may auto-create unwanted policies.
      // Callers must use SellerProfiles.Seller{Shipping|Payment|Return}Profile
      // with the appropriate policy ID instead.
      const LEGACY_POLICY_FIELDS = ['ShippingDetails', 'PaymentMethods', 'ReturnPolicy'];
      const strippedFields: Record<string, unknown> = { ...fields };
      const foundLegacy: string[] = [];
      for (const key of LEGACY_POLICY_FIELDS) {
        if (key in strippedFields) {
          foundLegacy.push(key);
          delete strippedFields[key];
        }
      }
      if (foundLegacy.length > 0) {
        apiLogger.warn(
          `reviseListing: stripped legacy policy fields — use SellerProfiles instead`,
          { itemId, strippedFields: foundLegacy },
        );
      }

      // ReviseItem is the listing-type-agnostic call; ReviseFixedPriceItem
      // rejects auction (Chinese) listings with "Unsupported ListingType" even
      // for fields like Title that both listing types support.
      return yield* tradingClient
        .execute('ReviseItem', { Item: { ...strippedFields, ItemID: itemId } })
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
   * Uploads a picture through the Commerce Media API and returns a permanent
   * eBay-hosted image URL for use in listing PictureDetails, instead of linking
   * to a third-party image host.
   *
   * The image is read from disk by the server, so raw bytes never travel
   * through the MCP JSON channel as Base64.
   *
   * @param input - Local image path, plus optional filename and MIME type overrides.
   * @returns An Effect that succeeds with the Media API response payload, including imageUrl.
   *
   * @example
   * ```ts
   * const result = await Effect.runPromise(
   *   tradingApi.uploadPicture({ imagePath: '/tmp/photo.jpg' }),
   * );
   * ```
   *
   * @see https://developer.ebay.com/api-docs/commerce/media/resources/image/methods/createImageFromFile
   */
  uploadPicture = (
    input: UploadPictureInput,
  ): Effect.Effect<TradingRecordResponse, EbayApiError | EndpointInputError> => {
    const tradingClient = this.client;

    return Effect.gen(function* () {
      const request = yield* requireObjectEffect<UploadPictureInput>(input, 'input');
      const imagePathInput = yield* optionalStringEffect(request.imagePath, 'imagePath');
      const imageUrlInput = yield* optionalStringEffect(request.imageUrl, 'imageUrl');
      const filenameInput = yield* optionalStringEffect(request.filename, 'filename');
      const contentTypeInput = yield* optionalStringEffect(request.contentType, 'contentType');

      if (imagePathInput === undefined && imageUrlInput === undefined) {
        return yield* Effect.fail(
          new EndpointInputError({
            parameter: 'imagePath',
            message: 'Supply exactly one of imagePath or imageUrl.',
          }),
        );
      }
      if (imagePathInput !== undefined && imageUrlInput !== undefined) {
        return yield* Effect.fail(
          new EndpointInputError({
            parameter: 'imagePath',
            message: 'Supply exactly one of imagePath or imageUrl, not both.',
          }),
        );
      }

      const source =
        imageUrlInput === undefined
          ? yield* readLocalImage({
              imagePath: imagePathInput as string,
              filenameInput,
              contentTypeInput,
            })
          : yield* downloadRemoteImage({
              imageUrl: imageUrlInput,
              filenameInput,
              contentTypeInput,
            });

      if (!hasImageSignature(source.imageBuffer, source.contentType)) {
        return yield* Effect.fail(
          new EndpointInputError({
            parameter: imageUrlInput === undefined ? 'imagePath' : 'imageUrl',
            message: `File contents do not match declared image type ${source.contentType}.`,
          }),
        );
      }

      return yield* tradingClient.executeUploadPicture(source);
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
