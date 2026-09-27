/**
 * Short-lived upload handles: the bridge between an image that only exists on
 * the user's phone and a hosted MCP server that has no filesystem in common
 * with it.
 *
 * MCP has no client-to-server binary channel — tool inputs are JSON, roots are
 * `file://` only (and deprecated as of the 2026-07-28 revision), and every
 * binary-carrying feature runs server-to-client. So the bytes cannot travel
 * through the protocol. What *can* travel is a URL: the tool mints a handle,
 * returns its URL as text, the user opens it on the same device that holds the
 * photo, and the browser POSTs the bytes straight to this server.
 *
 * The security model, and its one honest compromise:
 *
 * - The handle is a 256-bit random capability. The browser doing the upload has
 *   no OAuth token and no session — it is a phone camera-roll picker, not an MCP
 *   client — so possession of the handle is what authorizes the POST. This is
 *   the same shape as a signed upload URL.
 * - Everything the capability *cannot* do is enforced where real identity does
 *   exist. A handle is bound at mint time to the authenticated MCP subject, and
 *   {@link UploadHandleStore.consume} refuses any other subject. So the worst a
 *   leaked URL permits is offering image bytes that only the original user can
 *   then choose to send to their own eBay account; it reads nothing back and
 *   cannot be redeemed by anyone else.
 * - Handles expire in ten minutes, are single-use, and the bytes live in memory
 *   under a global budget so a flood of uploads cannot exhaust the container.
 */

import { randomBytes } from 'node:crypto';
import type { ImageSource } from '@/utils/imageValidation.js';

/** How long a minted handle stays redeemable. */
export const UPLOAD_HANDLE_TTL_MS = 10 * 60 * 1000;

/** Most handles allowed to be outstanding at once. */
const DEFAULT_MAX_PENDING = 20;

/** Ceiling on the total in-memory image bytes held across all handles (64 MiB). */
const DEFAULT_MAX_TOTAL_BYTES = 64 * 1024 * 1024;

/** Trailing slashes, stripped from a configured base URL. */
const TRAILING_SLASHES = /\/+$/;

/** Owner recorded when the server runs with authentication disabled. */
export const ANONYMOUS_OWNER = '(unauthenticated)';

/** Why an upload-handle operation was refused. */
export type UploadHandleFailureReason =
  | 'not_configured'
  | 'capacity'
  | 'not_found'
  | 'expired'
  | 'forbidden'
  | 'pending'
  | 'already_uploaded';

/** Outcome of an upload-handle operation. */
export type UploadHandleResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: UploadHandleFailureReason; readonly message: string };

/** A freshly minted handle and the URL the user opens to feed it. */
export interface MintedUpload {
  readonly uploadHandle: string;
  readonly uploadUrl: string;
  readonly expiresAt: string;
}

interface HandleRecord {
  readonly owner: string;
  readonly expiresAt: number;
  image?: ImageSource;
}

const failure = <T>(reason: UploadHandleFailureReason, message: string): UploadHandleResult<T> => ({
  ok: false,
  reason,
  message,
});

/**
 * In-memory registry of pending image uploads.
 *
 * Instantiable (rather than a bare module singleton) so tests can drive TTL and
 * capacity with an injected clock instead of real time; {@link uploadHandleStore}
 * is the instance the running server uses.
 */
export class UploadHandleStore {
  private readonly records = new Map<string, HandleRecord>();
  private readonly ttlMs: number;
  private readonly maxPending: number;
  private readonly maxTotalBytes: number;
  private readonly now: () => number;
  private baseUrl: string | undefined;

  constructor(
    options: {
      readonly ttlMs?: number;
      readonly maxPending?: number;
      readonly maxTotalBytes?: number;
      readonly now?: () => number;
    } = {},
  ) {
    this.ttlMs = options.ttlMs ?? UPLOAD_HANDLE_TTL_MS;
    this.maxPending = options.maxPending ?? DEFAULT_MAX_PENDING;
    this.maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;
    this.now = options.now ?? Date.now;
  }

  /**
   * Point minted URLs at the server's publicly reachable origin.
   *
   * Until this is called the store refuses to mint, which is the correct
   * behaviour for stdio: there is no HTTP listener to upload to, and `imagePath`
   * is the right answer there anyway.
   *
   * @param baseUrl - Public origin of the HTTP transport, or undefined to
   * restore the unconfigured (stdio) state.
   */
  configure(baseUrl: string | undefined): void {
    this.baseUrl = baseUrl?.replace(TRAILING_SLASHES, '');
  }

  /** Drops handles whose TTL has elapsed, releasing any bytes they held. */
  private prune(): void {
    const now = this.now();
    for (const [handle, record] of this.records) {
      if (record.expiresAt <= now) {
        this.records.delete(handle);
      }
    }
  }

  /** Total bytes currently held across all filled handles. */
  private heldBytes(): number {
    let total = 0;
    for (const record of this.records.values()) {
      total += record.image?.imageBuffer.byteLength ?? 0;
    }
    return total;
  }

  /**
   * Look a handle up, applying expiry and (optionally) ownership.
   *
   * Ownership is checked only when an `owner` is supplied, because the browser
   * POST has no MCP identity to check against — see the module docblock.
   */
  private lookup(handle: string, owner?: string): UploadHandleResult<HandleRecord> {
    // Deliberately does not prune first: pruning would delete the expired record
    // and turn a precise "this link has expired" (410) into a bare "unknown
    // handle" (404). Expiry is applied per-record below, and bulk pruning runs
    // on mint, so nothing accumulates.
    const record = this.records.get(handle);
    if (!record) {
      return failure('not_found', 'Unknown, already-used, or expired upload handle.');
    }
    if (record.expiresAt <= this.now()) {
      this.records.delete(handle);
      return failure('expired', 'This upload handle has expired. Request a new one.');
    }
    if (owner !== undefined && record.owner !== owner) {
      return failure('forbidden', 'This upload handle belongs to a different user.');
    }
    return { ok: true, value: record };
  }

  /**
   * Create a handle bound to the calling MCP user.
   *
   * @param owner - Authenticated subject that will be allowed to redeem it.
   * @returns The handle, the URL to open, and its expiry.
   *
   * @example
   * ```ts
   * const minted = store.mint('user-123');
   * ```
   */
  mint(owner: string): UploadHandleResult<MintedUpload> {
    this.prune();

    if (!this.baseUrl) {
      return failure(
        'not_configured',
        'This server has no public HTTP address, so browser uploads are unavailable. Use imagePath (local file) or imageUrl (hosted HTTPS image) instead.',
      );
    }
    if (this.records.size >= this.maxPending) {
      return failure(
        'capacity',
        'Too many uploads are already pending. Finish or wait for one to expire.',
      );
    }

    const handle = randomBytes(32).toString('base64url');
    const expiresAt = this.now() + this.ttlMs;
    this.records.set(handle, { owner, expiresAt });

    return {
      ok: true,
      value: {
        uploadHandle: handle,
        uploadUrl: `${this.baseUrl}/upload/${handle}`,
        expiresAt: new Date(expiresAt).toISOString(),
      },
    };
  }

  /** True when the handle is live and still waiting for bytes. */
  isAwaitingBytes(handle: string): boolean {
    const found = this.lookup(handle);
    return found.ok && found.value.image === undefined;
  }

  /**
   * Attach uploaded bytes to a pending handle.
   *
   * Authorized by possession of the handle alone. A handle that already holds an
   * image is refused rather than overwritten, so a leaked URL cannot be used to
   * swap the image out from under the user between upload and redemption.
   *
   * @param handle - The capability from the upload URL.
   * @param image - Validated image bytes and metadata.
   * @returns Success, or the reason the bytes were refused.
   *
   * @example
   * ```ts
   * store.attach(handle, { imageBuffer, filename: 'photo.jpg', contentType: 'image/jpeg' });
   * ```
   */
  attach(handle: string, image: ImageSource): UploadHandleResult<undefined> {
    const found = this.lookup(handle);
    if (!found.ok) {
      return found;
    }
    if (found.value.image !== undefined) {
      return failure('already_uploaded', 'An image has already been uploaded for this handle.');
    }
    if (this.heldBytes() + image.imageBuffer.byteLength > this.maxTotalBytes) {
      return failure('capacity', 'The server is holding too much pending image data right now.');
    }

    found.value.image = image;
    return { ok: true, value: undefined };
  }

  /**
   * Redeem a handle for its image, consuming it.
   *
   * Single-use: the record is deleted whether or not the caller goes on to use
   * the bytes successfully, so a replayed tool call cannot upload twice.
   *
   * @param handle - The handle returned when the upload was minted.
   * @param owner - Authenticated subject redeeming it; must match the minter.
   * @returns The image, or the reason it could not be redeemed.
   *
   * @example
   * ```ts
   * const redeemed = store.consume(handle, 'user-123');
   * ```
   */
  consume(handle: string, owner: string): UploadHandleResult<ImageSource> {
    const found = this.lookup(handle, owner);
    if (!found.ok) {
      return found;
    }
    const { image } = found.value;
    if (image === undefined) {
      return failure(
        'pending',
        'No image has been uploaded for this handle yet. Open the upload URL, choose the photo, then try again.',
      );
    }

    this.records.delete(handle);
    return { ok: true, value: image };
  }

  /** Number of live handles; for tests and diagnostics. */
  size(): number {
    this.prune();
    return this.records.size;
  }

  /** Forget every handle. Used by tests. */
  clear(): void {
    this.records.clear();
  }
}

/** The store the running server uses. */
export const uploadHandleStore = new UploadHandleStore();
