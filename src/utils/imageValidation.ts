/**
 * Shared image constraints for every path that feeds the Commerce Media API
 * upload.
 *
 * These rules used to live privately inside `api/trading/trading.ts`, which was
 * fine while `imagePath` and `imageUrl` were the only two ways in. The browser
 * upload endpoint is a third entry point that has to enforce exactly the same
 * size cap and type checks, and a second copy of "what counts as an acceptable
 * image" is precisely the kind of thing that drifts. So they live here, and the
 * three acquisition paths all import them.
 */

/** Largest image accepted by the Media API upload path (12 MiB). */
export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

/** Content types inferred from a file extension when the caller omits one. */
export const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

/**
 * Content types the browser upload endpoint accepts.
 *
 * Deliberately narrower than what {@link hasImageSignature} tolerates: that
 * function passes unknown types through (an explicit `contentType` from a
 * trusted local caller may legitimately be something exotic), whereas anything
 * arriving over the network must be one of the formats eBay actually takes.
 */
export const SUPPORTED_IMAGE_CONTENT_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
];

/** Default file name used when an upload does not declare one. */
export const EXTENSION_BY_MIME: Readonly<Record<string, string>> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

/** Image bytes plus the multipart metadata the Media API upload needs. */
export interface ImageSource {
  readonly imageBuffer: Buffer;
  readonly filename: string;
  readonly contentType: string;
}

/**
 * Check that a file's magic bytes match the content type it claims, so a
 * mislabelled or non-image file is rejected before it reaches eBay.
 *
 * @param buffer - Raw image bytes to inspect.
 * @param contentType - The MIME type the bytes claim to be.
 * @returns True when the bytes match the claimed type, or the type is unknown.
 *
 * @example
 * ```ts
 * hasImageSignature(pngBytes, 'image/png'); // true
 * ```
 */
export const hasImageSignature = (buffer: Buffer, contentType: string): boolean => {
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
