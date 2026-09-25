import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import nock from 'nock';
import { assertSafeImageUrl, fetchRemoteImage, isBlockedAddress } from '@/utils/imageFetch.js';

const MAX_BYTES = 12 * 1024 * 1024;
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

vi.mock('node:dns/promises', () => ({
  // Resolve every hostname to a public address unless a test overrides it.
  lookup: vi.fn(async (host: string) => {
    if (host === 'internal.example.com') {
      return [{ address: '169.254.169.254', family: 4 }];
    }
    if (host === 'unresolvable.example.com') {
      throw new Error('ENOTFOUND');
    }
    return [{ address: '93.184.216.34', family: 4 }];
  }),
}));

beforeEach(() => {
  nock.cleanAll();
  nock.disableNetConnect();
});

afterEach(() => {
  nock.cleanAll();
  nock.enableNetConnect();
});

describe('isBlockedAddress', () => {
  it('blocks loopback, private, link-local, and malformed addresses', () => {
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '224.0.0.1',
      '::1',
      '::',
      'fd00::1',
      'fe80::1',
      '::ffff:127.0.0.1',
      'not-an-ip',
    ]) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
  });

  it('allows ordinary public addresses', () => {
    for (const ip of ['93.184.216.34', '8.8.8.8', '172.32.0.1', '2606:2800:220:1::1']) {
      expect(isBlockedAddress(ip), ip).toBe(false);
    }
  });
});

describe('assertSafeImageUrl', () => {
  it('rejects non-HTTPS schemes', async () => {
    await expect(assertSafeImageUrl('http://example.com/a.jpg')).rejects.toThrow(/must use https/);
    await expect(assertSafeImageUrl('file:///etc/passwd')).rejects.toThrow(/must use https/);
  });

  it('rejects malformed URLs', async () => {
    await expect(assertSafeImageUrl('not a url')).rejects.toThrow(/not a valid URL/);
  });

  it('rejects hosts that resolve to link-local metadata addresses', async () => {
    await expect(assertSafeImageUrl('https://internal.example.com/a.jpg')).rejects.toThrow(
      /blocked address/,
    );
  });

  it('rejects literal loopback and private hosts without DNS', async () => {
    await expect(assertSafeImageUrl('https://127.0.0.1/a.jpg')).rejects.toThrow(/blocked address/);
    await expect(assertSafeImageUrl('https://192.168.0.5/a.jpg')).rejects.toThrow(
      /blocked address/,
    );
    await expect(assertSafeImageUrl('https://[::1]/a.jpg')).rejects.toThrow(/blocked address/);
  });

  it('rejects hosts that cannot be resolved', async () => {
    await expect(assertSafeImageUrl('https://unresolvable.example.com/a.jpg')).rejects.toThrow(
      /could not be resolved/,
    );
  });

  it('accepts a public HTTPS URL', async () => {
    const url = await assertSafeImageUrl('https://cdn.example.com/photo.jpg');
    expect(url.hostname).toBe('cdn.example.com');
  });
});

describe('fetchRemoteImage', () => {
  it('downloads an image and derives filename and content type', async () => {
    nock('https://cdn.example.com')
      .get('/photo.jpg')
      .reply(200, JPEG, { 'content-type': 'image/jpeg' });

    const result = await fetchRemoteImage({
      url: 'https://cdn.example.com/photo.jpg',
      maxBytes: MAX_BYTES,
    });

    expect(result.contentType).toBe('image/jpeg');
    expect(result.filename).toBe('photo.jpg');
    expect(result.buffer.equals(JPEG)).toBe(true);
  });

  it('rejects a non-image response', async () => {
    nock('https://cdn.example.com')
      .get('/page.html')
      .reply(200, '<html></html>', { 'content-type': 'text/html' });

    await expect(
      fetchRemoteImage({ url: 'https://cdn.example.com/page.html', maxBytes: MAX_BYTES }),
    ).rejects.toThrow(/did not return an image/);
  });

  it('rejects an oversized image declared by content-length', async () => {
    nock('https://cdn.example.com')
      .get('/big.jpg')
      .reply(200, JPEG, { 'content-type': 'image/jpeg', 'content-length': String(MAX_BYTES + 1) });

    await expect(
      fetchRemoteImage({ url: 'https://cdn.example.com/big.jpg', maxBytes: MAX_BYTES }),
    ).rejects.toThrow(/maximum supported size/);
  });

  it('rejects an oversized body even when content-length is absent', async () => {
    nock('https://cdn.example.com')
      .get('/stream.jpg')
      .reply(200, Buffer.alloc(64, 1), { 'content-type': 'image/jpeg' });

    await expect(
      fetchRemoteImage({ url: 'https://cdn.example.com/stream.jpg', maxBytes: 16 }),
    ).rejects.toThrow(/maximum supported size/);
  });

  it('surfaces transport failures', async () => {
    nock('https://cdn.example.com').get('/gone.jpg').replyWithError('socket hang up');

    await expect(
      fetchRemoteImage({ url: 'https://cdn.example.com/gone.jpg', maxBytes: MAX_BYTES }),
    ).rejects.toThrow(/Unable to fetch imageUrl/);
  });

  it('reports a timeout when the origin stalls', async () => {
    nock('https://cdn.example.com')
      .get('/slow.jpg')
      .delay(200)
      .reply(200, JPEG, { 'content-type': 'image/jpeg' });

    await expect(
      fetchRemoteImage({
        url: 'https://cdn.example.com/slow.jpg',
        maxBytes: MAX_BYTES,
        timeoutMs: 20,
      }),
    ).rejects.toThrow(/Timed out fetching imageUrl/);
  });

  it('surfaces a non-2xx status', async () => {
    nock('https://cdn.example.com').get('/missing.jpg').reply(404, 'nope');

    await expect(
      fetchRemoteImage({ url: 'https://cdn.example.com/missing.jpg', maxBytes: MAX_BYTES }),
    ).rejects.toThrow(/HTTP 404/);
  });

  it('re-validates redirects and refuses a hop to a private address', async () => {
    nock('https://cdn.example.com')
      .get('/redirect.jpg')
      .reply(302, '', { location: 'https://169.254.169.254/latest/meta-data' });

    await expect(
      fetchRemoteImage({ url: 'https://cdn.example.com/redirect.jpg', maxBytes: MAX_BYTES }),
    ).rejects.toThrow(/blocked address/);
  });

  it('refuses a redirect that downgrades to http', async () => {
    nock('https://cdn.example.com')
      .get('/downgrade.jpg')
      .reply(302, '', { location: 'http://cdn.example.com/photo.jpg' });

    await expect(
      fetchRemoteImage({ url: 'https://cdn.example.com/downgrade.jpg', maxBytes: MAX_BYTES }),
    ).rejects.toThrow(/must use https/);
  });

  it('follows a safe redirect to a public host', async () => {
    nock('https://cdn.example.com')
      .get('/moved.jpg')
      .reply(301, '', { location: 'https://images.example.com/final.png' });
    nock('https://images.example.com')
      .get('/final.png')
      .reply(200, JPEG, { 'content-type': 'image/png' });

    const result = await fetchRemoteImage({
      url: 'https://cdn.example.com/moved.jpg',
      maxBytes: MAX_BYTES,
    });

    expect(result.filename).toBe('final.png');
    expect(result.contentType).toBe('image/png');
  });
});
