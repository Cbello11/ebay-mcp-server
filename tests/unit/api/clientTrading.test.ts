import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EbayApiClient } from '@/api/client.js';
import { TradingApiClient } from '@/api/clientTrading.js';
import { Effect } from 'effect';
import nock from 'nock';

/** Matches a fully hex-encoded request body, as nock reports binary payloads. */
const HEX_BODY_PATTERN = /^[0-9a-f]+$/i;

function createMockRestClient(environment = 'production') {
  const mockOAuthClient = {
    getAccessToken: vi.fn().mockReturnValue(Effect.succeed('mock_token')),
  };
  return {
    getConfig: vi.fn().mockReturnValue({ environment }),
    getOAuthClient: vi.fn().mockReturnValue(mockOAuthClient),
    _mockOAuthClient: mockOAuthClient,
  } as unknown as EbayApiClient & {
    _mockOAuthClient: { getAccessToken: ReturnType<typeof vi.fn> };
  };
}

let client: TradingApiClient;
let mockRestClient: ReturnType<typeof createMockRestClient>;

beforeEach(() => {
  vi.clearAllMocks();
  nock.cleanAll();
  nock.disableNetConnect();
  mockRestClient = createMockRestClient('production');
  client = new TradingApiClient(mockRestClient);
});

afterEach(() => {
  nock.cleanAll();
  nock.enableNetConnect();
});

it('sends XML request headers required by Trading API', async () => {
  const scope = nock('https://api.ebay.com')
    .post('/ws/api.dll')
    .matchHeader('X-EBAY-API-CALL-NAME', 'GetMyeBaySelling')
    .matchHeader('X-EBAY-API-SITEID', '0')
    .matchHeader('X-EBAY-API-COMPATIBILITY-LEVEL', '1451')
    .matchHeader('X-EBAY-API-IAF-TOKEN', 'mock_token')
    .matchHeader('Content-Type', 'text/xml')
    .reply(
      200,
      `<?xml version="1.0" encoding="utf-8"?>
      <GetMyeBaySellingResponse xmlns="urn:ebay:apis:eBLBaseComponents">
        <Ack>Success</Ack>
      </GetMyeBaySellingResponse>`,
    );

  const result = await Effect.runPromise(client.execute('GetMyeBaySelling', {}));
  expect(result.Ack).toBe('Success');
  scope.done();
});

it('builds XML request body from params', async () => {
  const scope = nock('https://api.ebay.com')
    .post('/ws/api.dll', (body: string) => body.includes('<ItemID>12345</ItemID>'))
    .reply(
      200,
      `<?xml version="1.0" encoding="utf-8"?>
      <GetItemResponse xmlns="urn:ebay:apis:eBLBaseComponents">
        <Ack>Success</Ack>
        <Item><ItemID>12345</ItemID></Item>
      </GetItemResponse>`,
    );

  const result = await Effect.runPromise(client.execute('GetItem', { ItemID: '12345' }));
  expect(result.Ack).toBe('Success');
  scope.done();
});

it('fails with EbayApiError on eBay error response', async () => {
  nock('https://api.ebay.com')
    .post('/ws/api.dll')
    .reply(
      200,
      `<?xml version="1.0" encoding="utf-8"?>
      <GetItemResponse xmlns="urn:ebay:apis:eBLBaseComponents">
        <Ack>Failure</Ack>
        <Errors>
          <ShortMessage>Invalid item ID</ShortMessage>
          <LongMessage>The item ID 99999 is invalid.</LongMessage>
          <SeverityCode>Error</SeverityCode>
        </Errors>
      </GetItemResponse>`,
    );

  const error = await Effect.runPromise(
    Effect.flip(client.execute('GetItem', { ItemID: '99999' })),
  );

  expect(error._tag).toBe('EbayApiError');
  expect(error.cause).toBeInstanceOf(Error);
  if (error.cause instanceof Error) {
    expect(error.cause.message).toContain('Invalid item ID');
  }
});

it('uses the sandbox URL for sandbox environment', () => {
  const sandboxClient = new TradingApiClient(createMockRestClient('sandbox'));
  expect(sandboxClient.getTradingBaseUrl()).toBe('https://api.sandbox.ebay.com');
});

it('uses the production URL for production environment', () => {
  expect(client.getTradingBaseUrl()).toBe('https://api.ebay.com');
});

describe('proxy auth mode', () => {
  function createProxyRestClient() {
    return {
      getConfig: vi.fn().mockReturnValue({
        environment: 'production',
        apiBaseUrl: 'http://localhost:8099',
        disableAuthHeader: true,
      }),
      getOAuthClient: vi.fn(),
    } as unknown as EbayApiClient & { getOAuthClient: ReturnType<typeof vi.fn> };
  }

  it('targets the overridden base URL', () => {
    const proxyClient = new TradingApiClient(createProxyRestClient());
    expect(proxyClient.getTradingBaseUrl()).toBe('http://localhost:8099');
  });

  it('omits the IAF token and never acquires a token', async () => {
    const proxyRest = createProxyRestClient();
    const proxyClient = new TradingApiClient(proxyRest);

    const scope = nock('http://localhost:8099', { badheaders: ['x-ebay-api-iaf-token'] })
      .post('/ws/api.dll')
      .reply(
        200,
        `<?xml version="1.0" encoding="utf-8"?>
        <GetItemResponse xmlns="urn:ebay:apis:eBLBaseComponents"><Ack>Success</Ack></GetItemResponse>`,
      );

    const result = await Effect.runPromise(proxyClient.execute('GetItem', { ItemID: '1' }));

    expect(result.Ack).toBe('Success');
    expect(proxyRest.getOAuthClient).not.toHaveBeenCalled();
    scope.done();
  });
});

describe('Media API image upload', () => {
  const MEDIA_PATH = '/commerce/media/v1_beta/image/create_image_from_file';
  const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01, 0x02]);

  /**
   * nock hands binary request bodies over as a hex string, so decode before
   * asserting on the multipart envelope.
   */
  const multipartBody = (body: unknown): string => {
    if (typeof body !== 'string') {
      return '';
    }
    return HEX_BODY_PATTERN.test(body) ? Buffer.from(body, 'hex').toString('binary') : body;
  };
  const isImagePart = (body: unknown): boolean => multipartBody(body).includes('name="image"');

  it('uploads image bytes as multipart/form-data to the production Media host', async () => {
    const scope = nock('https://apim.ebay.com')
      .post(MEDIA_PATH, isImagePart)
      .matchHeader('authorization', 'Bearer mock_token')
      .matchHeader('content-type', (value) => value.startsWith('multipart/form-data; boundary='))
      .reply(201, { imageUrl: 'https://i.ebayimg.com/images/g/abc/s-l1600.jpg' });

    const result = await Effect.runPromise(
      client.executeUploadPicture({
        imageBuffer: jpegBytes,
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
      }),
    );

    expect(result.imageUrl).toBe('https://i.ebayimg.com/images/g/abc/s-l1600.jpg');
    scope.done();
  });

  it('sends Media API uploads to apim.sandbox.ebay.com in the sandbox environment', async () => {
    const sandboxClient = new TradingApiClient(createMockRestClient('sandbox'));
    const scope = nock('https://apim.sandbox.ebay.com')
      .post(MEDIA_PATH, isImagePart)
      .reply(201, { imageUrl: 'https://i.ebayimg.com/images/g/sandbox/s-l1600.jpg' });

    const result = await Effect.runPromise(
      sandboxClient.executeUploadPicture({
        imageBuffer: jpegBytes,
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
      }),
    );

    expect(result.imageUrl).toBe('https://i.ebayimg.com/images/g/sandbox/s-l1600.jpg');
    scope.done();
  });

  it('exposes a Media host that is independent of the Trading host', () => {
    const sandboxClient = new TradingApiClient(createMockRestClient('sandbox'));

    expect(client.getMediaBaseUrl()).toBe('https://apim.ebay.com');
    expect(client.getTradingBaseUrl()).toBe('https://api.ebay.com');
    expect(client.getTradingBaseUrl()).not.toContain('apim.');
    expect(sandboxClient.getMediaBaseUrl()).toBe('https://apim.sandbox.ebay.com');
    expect(sandboxClient.getTradingBaseUrl()).toBe('https://api.sandbox.ebay.com');
  });

  it('keeps Trading XML traffic on the regular api host, not the Media host', async () => {
    const scope = nock('https://api.ebay.com')
      .post('/ws/api.dll')
      .reply(
        200,
        `<?xml version="1.0" encoding="utf-8"?><GetItemResponse xmlns="urn:ebay:apis:eBLBaseComponents"><Ack>Success</Ack></GetItemResponse>`,
      );

    const result = await Effect.runPromise(client.execute('GetItem', { ItemID: '1' }));

    expect(result.Ack).toBe('Success');
    scope.done();
  });

  it('labels Media API failures as Media API, not Trading API', async () => {
    nock('https://apim.ebay.com').post(MEDIA_PATH).reply(503, 'Service Unavailable');

    const error = await Effect.runPromise(
      Effect.flip(
        client.executeUploadPicture({
          imageBuffer: jpegBytes,
          filename: 'photo.jpg',
          contentType: 'image/jpeg',
        }),
      ),
    );

    expect(error._tag).toBe('EbayApiError');
    expect(error.cause).toBeInstanceOf(Error);
    if (error.cause instanceof Error) {
      expect(error.cause.message).toContain('Media API createImageFromFile');
      expect(error.cause.message).not.toContain('Trading API');
    }
  });

  it('fails when the Media API response omits imageUrl', async () => {
    nock('https://apim.ebay.com').post(MEDIA_PATH).reply(201, { somethingElse: true });

    const error = await Effect.runPromise(
      Effect.flip(
        client.executeUploadPicture({
          imageBuffer: jpegBytes,
          filename: 'photo.jpg',
          contentType: 'image/jpeg',
        }),
      ),
    );

    expect(error._tag).toBe('EbayApiError');
    if (error.cause instanceof Error) {
      expect(error.cause.message).toContain('Media API createImageFromFile');
      expect(error.cause.message).toContain('did not contain imageUrl');
    }
  });
});
