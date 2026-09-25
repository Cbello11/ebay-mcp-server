import XmlBuilder, { type XMLBuilder as XmlBuilderInstance } from 'fast-xml-builder';
import { XMLParser } from 'fast-xml-parser';
import type { EbayApiClient } from '@/api/client.js';
import { TradingApiFailure } from '@/api/clientTradingError.js';
import { EbayApiError } from '@/api/shared/request.js';
import { getBaseUrl, getMediaBaseUrl, getTradingSiteId } from '@/config/environment.js';
import { getErrorMessage } from '@/utils/errors.js';
import { httpRequestEffect } from '@/utils/http.js';
import { apiLogger } from '@/utils/logger.js';
import { isRecord } from '@/utils/typeGuards.js';
import { Effect } from 'effect';

const COMPAT_LEVEL = '1451';
const TRADING_ENDPOINT_PATH = '/ws/api.dll';
const TRADING_XMLNS = 'urn:ebay:apis:eBLBaseComponents';
const MEDIA_IMAGE_PATH = '/commerce/media/v1_beta/image/create_image_from_file';
const TRADING_API_LABEL = 'Trading API';
const MEDIA_API_LABEL = 'Media API';

/** Context required to report a failed Trading API call. */
interface TradingFailureContext {
  /** Trading API call name, such as GetItem. */
  readonly callName: string;
  /** Absolute Trading API request URL. */
  readonly path: string;
  /** API family reported in failure messages. Defaults to the Trading API. */
  readonly apiLabel?: string;
}

/** Values required to create an authorized Trading API header set. */
interface TradingAuthContext extends TradingFailureContext {
  /** REST client that owns OAuth configuration for the seller account. */
  readonly restClient: EbayApiClient;
  /** Base Trading API headers before optional OAuth injection. */
  readonly headers: Record<string, string>;
}

/** Values required to send one Trading API request body. */
interface TradingPostContext extends TradingFailureContext {
  /** Request headers sent to the Trading API endpoint. */
  readonly headers: Record<string, string>;
  /** XML request body, or a raw multipart body for binary uploads. */
  readonly xmlBody: string | Buffer;
}

/** Values required to parse a Trading API XML response. */
interface TradingParseContext extends TradingFailureContext {
  /** XML parser configured for Trading API response shapes. */
  readonly parser: XMLParser;
  /** XML response body returned by the Trading API endpoint. */
  readonly responseText: string;
}

const buildTradingPath = (baseUrl: string): string => `${baseUrl}${TRADING_ENDPOINT_PATH}`;
const buildMediaPath = (baseUrl: string): string => `${baseUrl}${MEDIA_IMAGE_PATH}`;

const buildTradingHeaders = (callName: string): Record<string, string> => ({
  'X-EBAY-API-SITEID': getTradingSiteId(),
  'X-EBAY-API-COMPATIBILITY-LEVEL': COMPAT_LEVEL,
  'X-EBAY-API-CALL-NAME': callName,
  'Content-Type': 'text/xml',
});

const buildTradingXmlBody = (
  builder: XmlBuilderInstance,
  requestTag: string,
  params: Record<string, unknown>,
): string => {
  const xmlObject: Record<string, unknown> = {
    [requestTag]: {
      '@_xmlns': TRADING_XMLNS,
      ...params,
    },
  };

  return `<?xml version="1.0" encoding="utf-8"?>\n${builder.build(xmlObject)}`;
};

const createTradingApiError = (
  { callName, path, apiLabel }: TradingFailureContext,
  message: string,
  cause?: unknown,
): EbayApiError =>
  new EbayApiError({
    method: 'POST',
    path,
    cause: new TradingApiFailure({
      callName,
      path,
      message: `${apiLabel ?? TRADING_API_LABEL} ${callName} ${message}`,
      ...(cause === undefined ? {} : { cause }),
    }),
  });

const authorizeTradingHeaders = ({
  restClient,
  headers,
  callName,
  path,
}: TradingAuthContext): Effect.Effect<Record<string, string>, EbayApiError> => {
  if (restClient.getConfig().disableAuthHeader) {
    return Effect.succeed(headers);
  }

  return restClient
    .getOAuthClient()
    .getAccessToken()
    .pipe(
      Effect.mapError((error) =>
        createTradingApiError(
          { callName, path },
          `token acquisition failed: ${getErrorMessage(error)}`,
        ),
      ),
      Effect.map((token) => ({ ...headers, 'X-EBAY-API-IAF-TOKEN': token })),
    );
};

/**
 * Build authorized headers for the Commerce Media API, which expects a
 * standard OAuth bearer token rather than the Trading API's IAF token header.
 */
const authorizeMediaHeaders = ({
  restClient,
  headers,
  callName,
  path,
}: TradingAuthContext): Effect.Effect<Record<string, string>, EbayApiError> => {
  if (restClient.getConfig().disableAuthHeader) {
    return Effect.succeed(headers);
  }

  return restClient
    .getOAuthClient()
    .getAccessToken()
    .pipe(
      Effect.mapError((error) =>
        createTradingApiError(
          { callName, path, apiLabel: MEDIA_API_LABEL },
          `token acquisition failed: ${getErrorMessage(error)}`,
        ),
      ),
      Effect.map((token) => ({ ...headers, Authorization: `Bearer ${token}` })),
    );
};

const postTradingXml = ({
  path,
  headers,
  xmlBody,
  callName,
}: TradingPostContext): Effect.Effect<{ readonly data: string }, EbayApiError> =>
  httpRequestEffect<string>({
    method: 'POST',
    url: path,
    headers,
    body: xmlBody,
    timeoutMs: 30_000,
    responseType: 'text',
  }).pipe(
    Effect.mapError((error) =>
      createTradingApiError({ callName, path }, `request failed: ${getErrorMessage(error)}`),
    ),
  );

const parseTradingXml = ({
  parser,
  responseText,
  callName,
  path,
}: TradingParseContext): Effect.Effect<Record<string, unknown>, EbayApiError> =>
  Effect.try({
    try: () => parser.parse(responseText),
    catch: (error) =>
      new EbayApiError({
        method: 'POST',
        path,
        cause: new TradingApiFailure({
          callName,
          path,
          message: `Failed to parse Trading API ${callName} response: ${getErrorMessage(error)}`,
          cause: error,
        }),
      }),
  }).pipe(
    Effect.flatMap((parsedValue) => {
      if (isRecord(parsedValue)) {
        return Effect.succeed(parsedValue);
      }

      return Effect.fail(createTradingApiError({ callName, path }, 'response must be an object'));
    }),
  );

const readTradingPayload = (
  parsed: Record<string, unknown>,
  responseTag: string,
  { callName, path }: TradingFailureContext,
): Effect.Effect<Record<string, unknown>, EbayApiError> => {
  const resultValue = parsed[responseTag] === undefined ? parsed : parsed[responseTag];

  if (isRecord(resultValue)) {
    return Effect.succeed(resultValue);
  }

  return Effect.fail(
    createTradingApiError({ callName, path }, 'response payload is not an object'),
  );
};

const extractTradingErrorMessage = (errors: unknown): string => {
  const firstError = Array.isArray(errors) ? errors[0] : errors;

  if (!isRecord(firstError)) {
    return 'Trading API returned a failure without an error message';
  }

  const shortMessage = firstError.ShortMessage;
  if (typeof shortMessage === 'string' && shortMessage !== '') {
    return shortMessage;
  }

  const longMessage = firstError.LongMessage;
  if (typeof longMessage === 'string' && longMessage !== '') {
    return longMessage;
  }

  return 'Trading API returned a failure without an error message';
};

const validateTradingAck = (
  result: Record<string, unknown>,
  { callName, path }: TradingFailureContext,
): Effect.Effect<Record<string, unknown>, EbayApiError> => {
  if (result.Ack === 'Warning') {
    apiLogger.warn(`Trading API ${callName} returned warnings`, {
      errors: result.Errors,
    });
  }

  if (result.Ack === 'Failure' || result.Ack === 'PartialFailure') {
    return Effect.fail(
      new EbayApiError({
        method: 'POST',
        path,
        cause: new TradingApiFailure({
          callName,
          path,
          message: extractTradingErrorMessage(result.Errors),
          cause: result.Errors,
        }),
      }),
    );
  }

  return Effect.succeed(result);
};

/**
 * XML-based client for eBay Trading API calls that are not covered by REST APIs.
 */
export class TradingApiClient {
  private readonly restClient: EbayApiClient;
  private readonly baseUrl: string;
  private readonly mediaBaseUrl: string;
  private readonly parser: XMLParser;
  private readonly builder: XmlBuilderInstance;

  constructor(restClient: EbayApiClient) {
    this.restClient = restClient;
    const config = restClient.getConfig();
    this.baseUrl = getBaseUrl(config.environment, config.apiBaseUrl);
    this.mediaBaseUrl = getMediaBaseUrl(config.environment, config.apiBaseUrl);

    this.parser = new XMLParser({
      ignoreAttributes: false,
      removeNSPrefix: true,
      parseTagValue: true,
      isArray: (_name: string) => {
        const arrayTags = [
          'Item',
          'Errors',
          'Error',
          'NameValueList',
          'Value',
          'ShippingServiceOptions',
          'InternationalShippingServiceOption',
          'PaymentMethods',
          'PictureURL',
          'CompatibilityList',
          'Variation',
        ];
        return arrayTags.includes(_name);
      },
    });

    this.builder = new XmlBuilder({
      ignoreAttributes: false,
      format: true,
      suppressEmptyNode: true,
    });
  }

  /**
   * Return the Trading API base URL for the configured eBay environment.
   *
   * @returns The Trading API base URL derived from the configured environment.
   *
   * @example
   * ```ts
   * const baseUrl = tradingClient.getTradingBaseUrl();
   * ```
   */
  getTradingBaseUrl = (): string => this.baseUrl;

  getMediaBaseUrl = (): string => this.mediaBaseUrl;

  /**
   * Execute a named Trading API call with XML request/response conversion.
   *
   * @param callName - Trading API call name, such as GetItem or AddFixedPriceItem.
   * @param params - XML request payload fields nested under the generated request tag.
   * @returns An Effect that succeeds with the parsed response payload.
   *
   * @example
   * ```ts
   * const result = await Effect.runPromise(
   *   tradingClient.execute('GetItem', { ItemID: '12345' }),
   * );
   * ```
   */
  execute = (
    callName: string,
    params: Record<string, unknown>,
  ): Effect.Effect<Record<string, unknown>, EbayApiError> => {
    const tradingClient = this;
    const requestTag = `${callName}Request`;
    const responseTag = `${callName}Response`;
    const path = buildTradingPath(tradingClient.baseUrl);
    const headers = buildTradingHeaders(callName);
    const xmlBody = buildTradingXmlBody(tradingClient.builder, requestTag, params);

    apiLogger.debug(`Trading API ${callName}`, { xmlBody });

    return Effect.gen(function* () {
      const authorizedHeaders = yield* authorizeTradingHeaders({
        restClient: tradingClient.restClient,
        headers,
        callName,
        path,
      });
      const response = yield* postTradingXml({
        path,
        headers: authorizedHeaders,
        xmlBody,
        callName,
      });
      const parsed = yield* parseTradingXml({
        parser: tradingClient.parser,
        responseText: response.data,
        callName,
        path,
      });
      const result = yield* readTradingPayload(parsed, responseTag, { callName, path });

      return yield* validateTradingAck(result, { callName, path });
    });
  };

  /**
   * Upload an image through the Commerce Media API (createImageFromFile) as a
   * multipart/form-data request, returning a permanent eBay-hosted image URL
   * for use in listing PictureDetails.
   *
   * This call targets the Media API host (apim.*), not the regular Trading or
   * REST host, and authorizes with a bearer token rather than the Trading
   * API's IAF token header.
   *
   * @param input - Image bytes, filename, and content type.
   * @returns An Effect that succeeds with the Media API payload, including imageUrl.
   *
   * @see https://developer.ebay.com/api-docs/commerce/media/resources/image/methods/createImageFromFile
   */
  executeUploadPicture = ({
    imageBuffer,
    filename,
    contentType,
  }: {
    readonly imageBuffer: Buffer;
    readonly filename: string;
    readonly contentType: string;
  }): Effect.Effect<Record<string, unknown>, EbayApiError> => {
    const callName = 'createImageFromFile';
    const path = buildMediaPath(this.mediaBaseUrl);
    const failureContext: TradingFailureContext = {
      callName,
      path,
      apiLabel: MEDIA_API_LABEL,
    };
    const form = new FormData();
    const restClient = this.restClient;
    // Convert to a fresh Uint8Array so TypeScript/Node's BlobPart types remain compatible across Node 20/25 typings.
    form.append('image', new Blob([Uint8Array.from(imageBuffer)], { type: contentType }), filename);

    apiLogger.debug(`Media API ${callName}`, {
      filename,
      contentType,
      sizeBytes: imageBuffer.byteLength,
    });

    return Effect.gen(function* () {
      const headers = yield* authorizeMediaHeaders({ restClient, headers: {}, callName, path });
      const response = yield* httpRequestEffect<Record<string, unknown>>({
        method: 'POST',
        url: path,
        headers,
        body: form,
        timeoutMs: 90_000,
        responseType: 'json',
      }).pipe(
        Effect.mapError((error) =>
          createTradingApiError(failureContext, `request failed: ${getErrorMessage(error)}`),
        ),
      );

      if (!isRecord(response.data)) {
        return yield* Effect.fail(
          createTradingApiError(failureContext, 'response must be an object'),
        );
      }
      const imageUrl = response.data.imageUrl;
      if (typeof imageUrl !== 'string' || imageUrl.length === 0) {
        return yield* Effect.fail(
          createTradingApiError(failureContext, 'response did not contain imageUrl', response.data),
        );
      }
      return response.data;
    });
  };
}
