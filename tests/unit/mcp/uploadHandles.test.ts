import { beforeEach, describe, expect, it } from 'vitest';
import { ANONYMOUS_OWNER, UPLOAD_HANDLE_TTL_MS, UploadHandleStore } from '@/mcp/uploadHandles.js';
import type { ImageSource } from '@/utils/imageValidation.js';

const JPEG: ImageSource = {
  imageBuffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  filename: 'photo.jpg',
  contentType: 'image/jpeg',
};

/** A store with a clock the test drives, so TTL is exercised without waiting. */
const createStore = (options: {
  now: () => number;
  maxPending?: number;
  maxTotalBytes?: number;
}) => {
  const store = new UploadHandleStore(options);
  store.configure('https://mcp.example.test');
  return store;
};

describe('UploadHandleStore', () => {
  let clock: number;
  let store: UploadHandleStore;

  beforeEach(() => {
    clock = 1_000_000;
    store = createStore({ now: () => clock });
  });

  const mint = (owner = 'user-a'): string => {
    const minted = store.mint(owner);
    if (!minted.ok) {
      throw new Error(`mint failed: ${minted.reason}`);
    }
    return minted.value.uploadHandle;
  };

  it('mints a random single-use handle with a ten-minute lifetime', () => {
    const first = store.mint('user-a');
    const second = store.mint('user-a');

    expect(first.ok && second.ok).toBe(true);
    if (!(first.ok && second.ok)) {
      return;
    }

    // 32 random bytes as base64url.
    expect(first.value.uploadHandle).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.value.uploadHandle).not.toBe(second.value.uploadHandle);
    expect(first.value.uploadUrl).toBe(
      `https://mcp.example.test/upload/${first.value.uploadHandle}`,
    );
    expect(Date.parse(first.value.expiresAt)).toBe(clock + UPLOAD_HANDLE_TTL_MS);
    expect(UPLOAD_HANDLE_TTL_MS).toBe(10 * 60 * 1000);
  });

  it('refuses to mint when no public address is configured', () => {
    const unconfigured = new UploadHandleStore({ now: () => clock });
    const minted = unconfigured.mint('user-a');

    expect(minted.ok).toBe(false);
    if (minted.ok) {
      return;
    }
    expect(minted.reason).toBe('not_configured');
    // Points the caller at the two paths that do work without an HTTP listener.
    expect(minted.message).toContain('imagePath');
    expect(minted.message).toContain('imageUrl');
  });

  it('round-trips an image from attach to consume', () => {
    const handle = mint();

    expect(store.isAwaitingBytes(handle)).toBe(true);
    expect(store.attach(handle, JPEG).ok).toBe(true);
    expect(store.isAwaitingBytes(handle)).toBe(false);

    const consumed = store.consume(handle, 'user-a');
    expect(consumed.ok).toBe(true);
    if (!consumed.ok) {
      return;
    }
    expect(consumed.value.filename).toBe('photo.jpg');
    expect(consumed.value.imageBuffer.equals(JPEG.imageBuffer)).toBe(true);
  });

  it('reports a handle that has not received bytes yet as pending', () => {
    const handle = mint();
    const consumed = store.consume(handle, 'user-a');

    expect(consumed.ok).toBe(false);
    if (consumed.ok) {
      return;
    }
    expect(consumed.reason).toBe('pending');
  });

  it('expires handles after the TTL, releasing the bytes', () => {
    const handle = mint();
    store.attach(handle, JPEG);

    clock += UPLOAD_HANDLE_TTL_MS - 1;
    expect(store.consume(handle, 'user-a').ok).toBe(true);

    const second = mint();
    store.attach(second, JPEG);
    clock += UPLOAD_HANDLE_TTL_MS;

    const expired = store.consume(second, 'user-a');
    expect(expired.ok).toBe(false);
    if (expired.ok) {
      return;
    }
    expect(expired.reason).toBe('expired');
    expect(store.size()).toBe(0);
  });

  it('refuses an expired handle at the attach step too', () => {
    const handle = mint();
    clock += UPLOAD_HANDLE_TTL_MS + 1;

    const attached = store.attach(handle, JPEG);
    expect(attached.ok).toBe(false);
    if (attached.ok) {
      return;
    }
    expect(attached.reason).toBe('expired');
  });

  it('is single-use: a consumed handle cannot be redeemed again', () => {
    const handle = mint();
    store.attach(handle, JPEG);

    expect(store.consume(handle, 'user-a').ok).toBe(true);

    const replay = store.consume(handle, 'user-a');
    expect(replay.ok).toBe(false);
    if (replay.ok) {
      return;
    }
    expect(replay.reason).toBe('not_found');
    expect(store.size()).toBe(0);
  });

  it('will not let a second upload overwrite bytes already attached', () => {
    const handle = mint();
    store.attach(handle, JPEG);

    const swapped = store.attach(handle, {
      ...JPEG,
      imageBuffer: Buffer.from([0xff, 0xd8, 0xff, 0x99]),
      filename: 'swapped.jpg',
    });

    expect(swapped.ok).toBe(false);
    if (swapped.ok) {
      return;
    }
    expect(swapped.reason).toBe('already_uploaded');

    const consumed = store.consume(handle, 'user-a');
    expect(consumed.ok && consumed.value.filename).toBe('photo.jpg');
  });

  it('rejects an unknown handle', () => {
    const consumed = store.consume('n'.repeat(43), 'user-a');

    expect(consumed.ok).toBe(false);
    if (consumed.ok) {
      return;
    }
    expect(consumed.reason).toBe('not_found');
  });

  it('isolates handles by owner: another user cannot redeem them', () => {
    const handle = mint('user-a');
    store.attach(handle, JPEG);

    const stolen = store.consume(handle, 'user-b');
    expect(stolen.ok).toBe(false);
    if (stolen.ok) {
      return;
    }
    expect(stolen.reason).toBe('forbidden');

    // The rightful owner is unaffected by the failed attempt.
    expect(store.consume(handle, 'user-a').ok).toBe(true);
  });

  it('treats unauthenticated callers as one shared principal', () => {
    const handle = mint(ANONYMOUS_OWNER);
    store.attach(handle, JPEG);

    expect(store.consume(handle, ANONYMOUS_OWNER).ok).toBe(true);
  });

  it('caps the number of outstanding handles', () => {
    const small = createStore({ now: () => clock, maxPending: 2 });
    expect(small.mint('user-a').ok).toBe(true);
    expect(small.mint('user-a').ok).toBe(true);

    const third = small.mint('user-a');
    expect(third.ok).toBe(false);
    if (third.ok) {
      return;
    }
    expect(third.reason).toBe('capacity');

    // Expiry frees the slots again.
    clock += UPLOAD_HANDLE_TTL_MS + 1;
    expect(small.mint('user-a').ok).toBe(true);
  });

  it('caps the total bytes held in memory across handles', () => {
    const small = createStore({ now: () => clock, maxTotalBytes: 8 });
    const first = small.mint('user-a');
    const second = small.mint('user-a');
    if (!(first.ok && second.ok)) {
      throw new Error('mint failed');
    }

    const sixBytes: ImageSource = {
      ...JPEG,
      imageBuffer: Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01, 0x02]),
    };

    expect(small.attach(first.value.uploadHandle, sixBytes).ok).toBe(true);

    const overflow = small.attach(second.value.uploadHandle, sixBytes);
    expect(overflow.ok).toBe(false);
    if (overflow.ok) {
      return;
    }
    expect(overflow.reason).toBe('capacity');
  });
});
