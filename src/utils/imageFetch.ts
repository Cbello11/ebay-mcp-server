/**
 * Server-side image fetching for remote (HTTP transport) MCP deployments.
 *
 * Why this exists: `imagePath` only works when the client and the MCP server
 * share a filesystem, which is true for stdio but never for the hosted HTTP
 * transport. Fetching the bytes server-side keeps image data out of MCP JSON
 * (no Base64 payloads) while still working remotely.
 *
 * Because the URL is caller-supplied, this module is an SSRF boundary: it
 * accepts HTTPS only, resolves and rejects loopback/private/link-local
 * destinations, and re-validates every redirect hop instead of letting `fetch`
 * follow them blindly.
 */

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/** Maximum redirect hops followed before giving up. */
const MAX_REDIRECTS = 3;
/** Total wall-clock budget for the fetch, including redirects. */
const DEFAULT_TIMEOUT_MS = 20_000;
/** Strips a leading IPv4-mapped IPv6 prefix so the v4 rules apply. */
const IPV4_MAPPED_PREFIX = /^::ffff:/i;

/** A fetched image, ready for the existing Media API multipart upload. */
export interface RemoteImage {
  readonly buffer: Buffer;
  readonly contentType: string;
  readonly filename: string;
}

/** Raised for any caller-correctable problem with a remote image URL. */
export class ImageFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageFetchError';
  }
}

/** True when an IPv4 literal falls in a range that must never be reachable. */
const isBlockedIpv4 = (ip: string): boolean => {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return true;
  }
  const [a, b] = parts as [number, number, number, number];
  if (a === 0 || a === 127) {
    return true; // "this network" and loopback
  }
  if (a === 10) {
    return true; // private
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true; // private
  }
  if (a === 192 && b === 168) {
    return true; // private
  }
  if (a === 169 && b === 254) {
    return true; // link-local, including cloud metadata
  }
  if (a === 100 && b >= 64 && b <= 127) {
    return true; // carrier-grade NAT
  }
  if (a === 198 && (b === 18 || b === 19)) {
    return true; // benchmarking
  }
  if (a >= 224) {
    return true; // multicast and reserved
  }
  return false;
};

/** True when an IPv6 literal is loopback, unspecified, ULA, or link-local. */
const isBlockedIpv6 = (ip: string): boolean => {
  const normalized = ip.toLowerCase().split('%')[0] ?? '';
  if (IPV4_MAPPED_PREFIX.test(normalized)) {
    return isBlockedIpv4(normalized.replace(IPV4_MAPPED_PREFIX, ''));
  }
  if (normalized === '::1' || normalized === '::') {
    return true;
  }
  const head = normalized.slice(0, 2);
  if (head === 'fc' || head === 'fd') {
    return true; // unique local
  }
  if (normalized.startsWith('fe8') || normalized.startsWith('fe9')) {
    return true; // link-local
  }
  if (normalized.startsWith('fea') || normalized.startsWith('feb')) {
    return true; // link-local
  }
  if (normalized.startsWith('ff')) {
    return true; // multicast
  }
  return false;
};

/** True when a resolved address must not be contacted. */
export const isBlockedAddress = (ip: string): boolean => {
  const version = isIP(ip);
  if (version === 4) {
    return isBlockedIpv4(ip);
  }
  if (version === 6) {
    return isBlockedIpv6(ip);
  }
  return true;
};

/**
 * Validate a candidate URL: HTTPS scheme, and every DNS answer for its host
 * must be a public address.
 *
 * @throws {ImageFetchError} when the scheme or any resolved address is unsafe.
 */
export const assertSafeImageUrl = async (raw: string): Promise<URL> => {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new ImageFetchError(`imageUrl is not a valid URL: ${raw}`);
  }
  if (parsed.protocol !== 'https:') {
    throw new ImageFetchError(
      `imageUrl must use https (received ${parsed.protocol || 'no'} scheme)`,
    );
  }

  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) !== 0) {
    if (isBlockedAddress(host)) {
      throw new ImageFetchError(`imageUrl resolves to a blocked address: ${host}`);
    }
    return parsed;
  }

  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch (error) {
    throw new ImageFetchError(
      `imageUrl host could not be resolved: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (addresses.length === 0) {
    throw new ImageFetchError(`imageUrl host could not be resolved: ${host}`);
  }
  for (const { address } of addresses) {
    if (isBlockedAddress(address)) {
      throw new ImageFetchError(`imageUrl resolves to a blocked address: ${address}`);
    }
  }
  return parsed;
};

/** Pick a filename for the multipart part, preferring the URL's own basename. */
const filenameFor = (url: URL, contentType: string): string => {
  const last = url.pathname.split('/').filter(Boolean).pop();
  if (last && last.includes('.')) {
    return last;
  }
  const subtype = contentType.split('/')[1]?.split(';')[0] ?? 'jpg';
  return `image.${subtype === 'jpeg' ? 'jpg' : subtype}`;
};

/** Read a response body, aborting as soon as it exceeds the byte budget. */
const readCapped = async (response: Response, maxBytes: number): Promise<Buffer> => {
  const declared = Number(response.headers.get('content-length') ?? Number.NaN);
  if (!Number.isNaN(declared) && declared > maxBytes) {
    throw new ImageFetchError(
      `Remote image is ${declared} bytes; maximum supported size is ${maxBytes} bytes.`,
    );
  }

  const body = response.body;
  if (!body) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > maxBytes) {
      throw new ImageFetchError(
        `Remote image exceeds the maximum supported size of ${maxBytes} bytes.`,
      );
    }
    return buffer;
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (!value) {
      continue;
    }
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new ImageFetchError(
        `Remote image exceeds the maximum supported size of ${maxBytes} bytes.`,
      );
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
};

/**
 * Fetch an image over HTTPS with SSRF guards, a size cap, and a timeout.
 *
 * Redirects are followed manually so each hop is re-validated; `fetch`'s
 * automatic following would let a public URL bounce to a private address.
 *
 * @throws {ImageFetchError} on unsafe URLs, non-image responses, oversized
 * bodies, redirect loops, timeouts, and transport failures.
 */
export const fetchRemoteImage = async ({
  url,
  maxBytes,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: {
  readonly url: string;
  readonly maxBytes: number;
  readonly timeoutMs?: number;
}): Promise<RemoteImage> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let target = await assertSafeImageUrl(url);

    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      let response: Response;
      try {
        response = await fetch(target, {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
          headers: { Accept: 'image/*' },
        });
      } catch (error) {
        if (controller.signal.aborted) {
          throw new ImageFetchError(`Timed out fetching imageUrl after ${timeoutMs}ms`);
        }
        throw new ImageFetchError(
          `Unable to fetch imageUrl: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) {
          throw new ImageFetchError('imageUrl redirected without a Location header');
        }
        target = await assertSafeImageUrl(new URL(location, target).toString());
        continue;
      }

      if (!response.ok) {
        throw new ImageFetchError(`imageUrl responded with HTTP ${response.status}`);
      }

      const contentType = (response.headers.get('content-type') ?? '').split(';')[0]?.trim() ?? '';
      if (!contentType.toLowerCase().startsWith('image/')) {
        throw new ImageFetchError(
          `imageUrl did not return an image (content-type: ${contentType || 'none'})`,
        );
      }

      const buffer = await readCapped(response, maxBytes);
      if (buffer.byteLength === 0) {
        throw new ImageFetchError('imageUrl returned an empty response body');
      }
      return {
        buffer,
        contentType: contentType.toLowerCase(),
        filename: filenameFor(target, contentType),
      };
    }

    throw new ImageFetchError(`imageUrl exceeded ${MAX_REDIRECTS} redirects`);
  } finally {
    clearTimeout(timer);
  }
};
