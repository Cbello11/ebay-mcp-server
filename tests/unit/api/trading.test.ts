import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import nock from 'nock';

// assertSafeImageUrl performs a real DNS lookup; pin it to a public address so
// these tests exercise the upload path rather than the network.
vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]),
}));
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TradingApiClient } from '@/api/clientTrading.js';
import { TradingApi } from '@/api/trading/trading.js';
import { Effect } from 'effect';

let api: TradingApi;
let mockClient: { execute: ReturnType<typeof vi.fn> };

beforeEach(() => {
  mockClient = { execute: vi.fn() };
  api = new TradingApi(mockClient as unknown as TradingApiClient);
});

it('returns raw active listings payload from GetMyeBaySelling', async () => {
  const activeListingsResponse = {
    Ack: 'Success',
    ActiveList: {
      ItemArray: {
        Item: [
          {
            ItemID: '167382780779',
            Title: 'Bambu Lab 0.2mm Nozzle',
            SKU: 'NZ-2MM',
            Quantity: 10,
            QuantityAvailable: 4,
            SellingStatus: { CurrentPrice: { '#text': 12.99 } },
            WatchCount: 3,
            ListingType: 'FixedPriceItem',
          },
        ],
      },
      PaginationResult: { TotalNumberOfEntries: 1, TotalNumberOfPages: 1 },
    },
  };
  mockClient.execute.mockReturnValue(Effect.succeed(activeListingsResponse));

  const result = await Effect.runPromise(api.getActiveListings());

  expect(result).toBe(activeListingsResponse);
});

it('returns empty active listings payload unchanged', async () => {
  const emptyListingsResponse = {
    Ack: 'Success',
    ActiveList: {
      ItemArray: null,
      PaginationResult: { TotalNumberOfEntries: 0 },
    },
  };
  mockClient.execute.mockReturnValue(Effect.succeed(emptyListingsResponse));

  const result = await Effect.runPromise(api.getActiveListings());

  expect(result).toBe(emptyListingsResponse);
});

it('passes active listing pagination params to execute', async () => {
  mockClient.execute.mockReturnValue(
    Effect.succeed({
      Ack: 'Success',
      ActiveList: {
        ItemArray: null,
        PaginationResult: { TotalNumberOfEntries: 0 },
      },
    }),
  );

  await Effect.runPromise(api.getActiveListings({ page: 2, entriesPerPage: 25 }));

  expect(mockClient.execute).toHaveBeenCalledWith('GetMyeBaySelling', {
    ActiveList: {
      Sort: 'TimeLeft',
      Pagination: { EntriesPerPage: 25, PageNumber: 2 },
    },
  });
});

it('gets one listing by item ID', async () => {
  mockClient.execute.mockReturnValue(
    Effect.succeed({
      Ack: 'Success',
      Item: [{ ItemID: '12345', Title: 'Test', SKU: 'T1', Quantity: 5 }],
    }),
  );

  const result = await Effect.runPromise(api.getListing({ itemId: '12345' }));

  expect(mockClient.execute).toHaveBeenCalledWith('GetItem', {
    ItemID: '12345',
    DetailLevel: 'ReturnAll',
    IncludeItemSpecifics: true,
  });
  expect(result.ItemID).toBe('12345');
});

it('fails getListing when itemId is missing', async () => {
  const error = await Effect.runPromise(Effect.flip(api.getListing({ itemId: '' })));

  expect(error._tag).toBe('EndpointInputError');
  expect(error.message).toContain('itemId is required');
});

it('creates a fixed-price listing', async () => {
  mockClient.execute.mockReturnValue(Effect.succeed({ Ack: 'Success', ItemID: '99999' }));

  const item = { Title: 'New Item', SKU: 'NEW', StartPrice: 9.99 };
  const result = await Effect.runPromise(api.createListing({ item }));

  expect(mockClient.execute).toHaveBeenCalledWith('AddFixedPriceItem', {
    Item: item,
  });
  expect(result.ItemID).toBe('99999');
});

it('revises a fixed-price listing', async () => {
  mockClient.execute.mockReturnValue(Effect.succeed({ Ack: 'Success', ItemID: '12345' }));

  const result = await Effect.runPromise(
    api.reviseListing({ itemId: '12345', fields: { Quantity: 10 } }),
  );

  expect(mockClient.execute).toHaveBeenCalledWith('ReviseItem', {
    Item: { ItemID: '12345', Quantity: 10 },
  });
  expect(result.ItemID).toBe('12345');
});

it('fails reviseListing when itemId is missing', async () => {
  const error = await Effect.runPromise(Effect.flip(api.reviseListing({ itemId: '', fields: {} })));

  expect(error._tag).toBe('EndpointInputError');
  expect(error.message).toContain('itemId is required');
});

it('ends a fixed-price listing', async () => {
  mockClient.execute.mockReturnValue(Effect.succeed({ Ack: 'Success' }));

  await Effect.runPromise(api.endListing({ itemId: '12345', reason: 'NotAvailable' }));

  expect(mockClient.execute).toHaveBeenCalledWith('EndFixedPriceItem', {
    ItemID: '12345',
    EndingReason: 'NotAvailable',
  });
});

it('defaults endListing reason to NotAvailable', async () => {
  mockClient.execute.mockReturnValue(Effect.succeed({ Ack: 'Success' }));

  await Effect.runPromise(api.endListing({ itemId: '12345' }));

  expect(mockClient.execute).toHaveBeenCalledWith('EndFixedPriceItem', {
    ItemID: '12345',
    EndingReason: 'NotAvailable',
  });
});

it('fails endListing when itemId is missing', async () => {
  const error = await Effect.runPromise(Effect.flip(api.endListing({ itemId: '' })));

  expect(error._tag).toBe('EndpointInputError');
  expect(error.message).toContain('itemId is required');
});

it('relists an ended listing', async () => {
  mockClient.execute.mockReturnValue(Effect.succeed({ Ack: 'Success', ItemID: '12345' }));

  const result = await Effect.runPromise(api.relistItem({ itemId: '12345' }));

  expect(mockClient.execute).toHaveBeenCalledWith('RelistFixedPriceItem', {
    Item: { ItemID: '12345' },
  });
  expect(result.ItemID).toBe('12345');
});

it('passes relist modifications', async () => {
  mockClient.execute.mockReturnValue(Effect.succeed({ Ack: 'Success', ItemID: '12345' }));

  await Effect.runPromise(
    api.relistItem({ itemId: '12345', modifications: { Quantity: 20, StartPrice: 15.99 } }),
  );

  expect(mockClient.execute).toHaveBeenCalledWith('RelistFixedPriceItem', {
    Item: { ItemID: '12345', Quantity: 20, StartPrice: 15.99 },
  });
});

it('fails relistItem when itemId is missing', async () => {
  const error = await Effect.runPromise(Effect.flip(api.relistItem({ itemId: '' })));

  expect(error._tag).toBe('EndpointInputError');
  expect(error.message).toContain('itemId is required');
});

describe('uploadPicture (Commerce Media API path)', () => {
  const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  let tmpDir: string;
  let uploadClient: {
    execute: ReturnType<typeof vi.fn>;
    executeUploadPicture: ReturnType<typeof vi.fn>;
  };
  let uploadApi: TradingApi;

  beforeEach(async () => {
    nock.cleanAll();
    nock.disableNetConnect();
    tmpDir = await mkdtemp(join(tmpdir(), 'upload-test-'));
    uploadClient = {
      execute: vi.fn(),
      executeUploadPicture: vi
        .fn()
        .mockReturnValue(
          Effect.succeed({ imageUrl: 'https://i.ebayimg.com/images/g/x/s-l1600.jpg' }),
        ),
    };
    uploadApi = new TradingApi(uploadClient as unknown as TradingApiClient);
  });

  afterEach(async () => {
    nock.cleanAll();
    nock.enableNetConnect();
    await rm(tmpDir, { recursive: true, force: true });
  });

  const writeImage = async (name: string, bytes: Buffer = JPEG_MAGIC): Promise<string> => {
    const target = join(tmpDir, name);
    await writeFile(target, bytes);
    return target;
  };

  it('accepts imagePath, reads the file from disk, and returns the eBay image URL', async () => {
    const imagePath = await writeImage('photo.jpg');

    const result = await Effect.runPromise(uploadApi.uploadPicture({ imagePath }));

    expect(result.imageUrl).toBe('https://i.ebayimg.com/images/g/x/s-l1600.jpg');
    expect(uploadClient.executeUploadPicture).toHaveBeenCalledTimes(1);
    const call = uploadClient.executeUploadPicture.mock.calls[0][0];
    expect(call.filename).toBe('photo.jpg');
    expect(call.contentType).toBe('image/jpeg');
    // Bytes come from disk, not from the caller's JSON payload.
    expect(Buffer.isBuffer(call.imageBuffer)).toBe(true);
    expect(Buffer.from(call.imageBuffer).equals(JPEG_MAGIC)).toBe(true);
  });

  it('no longer accepts imageBase64 as an image source', async () => {
    const error = await Effect.runPromise(
      Effect.flip(
        uploadApi.uploadPicture({
          imageBase64: JPEG_MAGIC.toString('base64'),
          filename: 'photo.jpg',
        } as unknown as { imagePath: string }),
      ),
    );

    expect(error._tag).toBe('EndpointInputError');
    expect(uploadClient.executeUploadPicture).not.toHaveBeenCalled();
  });

  it('infers content type from the extension and honours an explicit override', async () => {
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    const pngPath = await writeImage('photo.png', pngBytes);

    await Effect.runPromise(uploadApi.uploadPicture({ imagePath: pngPath }));
    expect(uploadClient.executeUploadPicture.mock.calls[0][0].contentType).toBe('image/png');

    await Effect.runPromise(
      uploadApi.uploadPicture({ imagePath: pngPath, filename: 'renamed.png' }),
    );
    expect(uploadClient.executeUploadPicture.mock.calls[1][0].filename).toBe('renamed.png');
  });

  it('rejects a missing file without calling the Media API', async () => {
    const error = await Effect.runPromise(
      Effect.flip(uploadApi.uploadPicture({ imagePath: join(tmpDir, 'does-not-exist.jpg') })),
    );

    expect(error._tag).toBe('EndpointInputError');
    expect(uploadClient.executeUploadPicture).not.toHaveBeenCalled();
  });

  it('rejects an empty file and a file whose bytes contradict its extension', async () => {
    const emptyPath = await writeImage('empty.jpg', Buffer.alloc(0));
    const emptyError = await Effect.runPromise(
      Effect.flip(uploadApi.uploadPicture({ imagePath: emptyPath })),
    );
    expect(emptyError._tag).toBe('EndpointInputError');

    const bogusPath = await writeImage('not-really.png', Buffer.from('plain text, not a png'));
    const bogusError = await Effect.runPromise(
      Effect.flip(uploadApi.uploadPicture({ imagePath: bogusPath })),
    );
    expect(bogusError._tag).toBe('EndpointInputError');

    expect(uploadClient.executeUploadPicture).not.toHaveBeenCalled();
  });

  it('requires exactly one of imagePath or imageUrl', async () => {
    const neither = await Effect.runPromise(Effect.flip(uploadApi.uploadPicture({} as never)));
    expect(neither._tag).toBe('EndpointInputError');
    expect((neither as { message: string }).message).toContain('exactly one');

    const imagePath = await writeImage('photo.jpg');
    const both = await Effect.runPromise(
      Effect.flip(
        uploadApi.uploadPicture({ imagePath, imageUrl: 'https://cdn.example.com/a.jpg' } as never),
      ),
    );
    expect(both._tag).toBe('EndpointInputError');
    expect((both as { message: string }).message).toContain('not both');

    expect(uploadClient.executeUploadPicture).not.toHaveBeenCalled();
  });

  it('downloads imageUrl server-side and feeds the same Media API upload', async () => {
    nock('https://cdn.example.com')
      .get('/remote.jpg')
      .reply(200, JPEG_MAGIC, { 'content-type': 'image/jpeg' });

    const result = await Effect.runPromise(
      uploadApi.uploadPicture({ imageUrl: 'https://cdn.example.com/remote.jpg' }),
    );

    expect(result.imageUrl).toBe('https://i.ebayimg.com/images/g/x/s-l1600.jpg');
    expect(uploadClient.executeUploadPicture).toHaveBeenCalledTimes(1);
    const call = uploadClient.executeUploadPicture.mock.calls[0][0];
    expect(call.filename).toBe('remote.jpg');
    expect(call.contentType).toBe('image/jpeg');
    expect(Buffer.from(call.imageBuffer).equals(JPEG_MAGIC)).toBe(true);
  });

  it('rejects a non-HTTPS imageUrl without any network call', async () => {
    const error = await Effect.runPromise(
      Effect.flip(uploadApi.uploadPicture({ imageUrl: 'http://cdn.example.com/a.jpg' })),
    );

    expect(error._tag).toBe('EndpointInputError');
    expect((error as { message: string }).message).toContain('https');
    expect(uploadClient.executeUploadPicture).not.toHaveBeenCalled();
  });

  it('rejects an imageUrl that returns a non-image response', async () => {
    nock('https://cdn.example.com')
      .get('/page.html')
      .reply(200, '<html></html>', { 'content-type': 'text/html' });

    const error = await Effect.runPromise(
      Effect.flip(uploadApi.uploadPicture({ imageUrl: 'https://cdn.example.com/page.html' })),
    );

    expect(error._tag).toBe('EndpointInputError');
    expect((error as { message: string }).message).toContain('did not return an image');
    expect(uploadClient.executeUploadPicture).not.toHaveBeenCalled();
  });

  it('rejects an oversized imageUrl download', async () => {
    nock('https://cdn.example.com')
      .get('/big.jpg')
      .reply(200, JPEG_MAGIC, {
        'content-type': 'image/jpeg',
        'content-length': String(13 * 1024 * 1024),
      });

    const error = await Effect.runPromise(
      Effect.flip(uploadApi.uploadPicture({ imageUrl: 'https://cdn.example.com/big.jpg' })),
    );

    expect(error._tag).toBe('EndpointInputError');
    expect((error as { message: string }).message).toContain('maximum supported size');
    expect(uploadClient.executeUploadPicture).not.toHaveBeenCalled();
  });

  it('surfaces an imageUrl fetch failure', async () => {
    nock('https://cdn.example.com').get('/gone.jpg').replyWithError('socket hang up');

    const error = await Effect.runPromise(
      Effect.flip(uploadApi.uploadPicture({ imageUrl: 'https://cdn.example.com/gone.jpg' })),
    );

    expect(error._tag).toBe('EndpointInputError');
    expect((error as { message: string }).message).toContain('Unable to fetch imageUrl');
    expect(uploadClient.executeUploadPicture).not.toHaveBeenCalled();
  });

  it('rejects downloaded bytes that do not match the declared image type', async () => {
    nock('https://cdn.example.com')
      .get('/fake.png')
      .reply(200, Buffer.from('plain text, not a png'), { 'content-type': 'image/png' });

    const error = await Effect.runPromise(
      Effect.flip(uploadApi.uploadPicture({ imageUrl: 'https://cdn.example.com/fake.png' })),
    );

    expect(error._tag).toBe('EndpointInputError');
    expect(uploadClient.executeUploadPicture).not.toHaveBeenCalled();
  });

  it('propagates Media API failures from the client layer', async () => {
    const imagePath = await writeImage('photo.jpg');
    uploadClient.executeUploadPicture.mockReturnValue(
      Effect.fail(new Error('Media API createImageFromFile request failed: 503')),
    );

    const error = await Effect.runPromise(Effect.flip(uploadApi.uploadPicture({ imagePath })));

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('Media API createImageFromFile');
  });
});
