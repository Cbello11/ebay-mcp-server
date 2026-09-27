import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { UploadHandleStore } from '@/mcp/uploadHandles.js';
import { createUploadRouter } from '@/mcp/uploadRoute.js';
import { MAX_IMAGE_BYTES } from '@/utils/imageValidation.js';

const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

describe('browser upload endpoint', () => {
  let clock: number;
  let store: UploadHandleStore;
  let app: express.Application;

  beforeEach(() => {
    clock = 1_000_000;
    store = new UploadHandleStore({ now: () => clock });
    store.configure('https://mcp.example.test');

    app = express();
    // Mirrors the real transport, where a global JSON parser is installed
    // before the upload router: it must not swallow image bodies.
    app.use(express.json());
    app.use(createUploadRouter(store));
  });

  const mint = (owner = 'user-a'): string => {
    const minted = store.mint(owner);
    if (!minted.ok) {
      throw new Error('mint failed');
    }
    return minted.value.uploadHandle;
  };

  it('serves the upload page for a live handle', async () => {
    const response = await request(app).get(`/upload/${mint()}`);

    expect(response.status).toBe(200);
    expect(response.text).toContain('Send a photo to eBay');
    // The handle is never templated into the page; the script reads it from the URL.
    expect(response.text).toContain('/upload/assets/upload.js');
  });

  it('serves the page assets without swallowing them as handles', async () => {
    const script = await request(app).get('/upload/assets/upload.js');
    const styles = await request(app).get('/upload/assets/upload.css');

    expect(script.status).toBe(200);
    expect(script.headers['content-type']).toContain('javascript');
    expect(styles.status).toBe(200);
    expect(styles.headers['content-type']).toContain('css');
  });

  it('shows an expiry page rather than the form for an unknown handle', async () => {
    const response = await request(app).get(`/upload/${'z'.repeat(43)}`);

    expect(response.status).toBe(404);
    expect(response.text).toContain('expired');
  });

  it('accepts a valid image and makes it redeemable by its owner', async () => {
    const handle = mint('user-a');

    const response = await request(app)
      .post(`/upload/${handle}`)
      .set('Content-Type', 'image/jpeg')
      .set('X-Upload-Filename', 'holiday photo.jpg')
      .send(JPEG_MAGIC);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ status: 'uploaded' });

    const consumed = store.consume(handle, 'user-a');
    expect(consumed.ok).toBe(true);
    if (!consumed.ok) {
      return;
    }
    expect(consumed.value.contentType).toBe('image/jpeg');
    expect(consumed.value.imageBuffer.equals(JPEG_MAGIC)).toBe(true);
    // Spaces are sanitised out of the client-supplied name.
    expect(consumed.value.filename).toBe('holiday_photo.jpg');
  });

  it('defaults the filename when the client does not send one', async () => {
    const handle = mint();

    await request(app).post(`/upload/${handle}`).set('Content-Type', 'image/png').send(PNG_MAGIC);

    const consumed = store.consume(handle, 'user-a');
    expect(consumed.ok && consumed.value.filename).toBe('upload.png');
  });

  it('strips path traversal out of a client-supplied filename', async () => {
    const handle = mint();

    await request(app)
      .post(`/upload/${handle}`)
      .set('Content-Type', 'image/jpeg')
      .set('X-Upload-Filename', '../../etc/passwd.jpg')
      .send(JPEG_MAGIC);

    const consumed = store.consume(handle, 'user-a');
    expect(consumed.ok && consumed.value.filename).toBe('passwd.jpg');
  });

  it('rejects a malformed handle', async () => {
    const response = await request(app)
      .post('/upload/not-a-real-handle')
      .set('Content-Type', 'image/jpeg')
      .send(JPEG_MAGIC);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('not_found');
  });

  it('rejects a well-formed but unknown handle', async () => {
    const response = await request(app)
      .post(`/upload/${'z'.repeat(43)}`)
      .set('Content-Type', 'image/jpeg')
      .send(JPEG_MAGIC);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('not_found');
  });

  it('rejects an expired handle with 410 rather than 404', async () => {
    const handle = mint();
    clock += 10 * 60 * 1000 + 1;

    const response = await request(app)
      .post(`/upload/${handle}`)
      .set('Content-Type', 'image/jpeg')
      .send(JPEG_MAGIC);

    expect(response.status).toBe(410);
    expect(response.body.error).toBe('expired');
  });

  it('rejects a second upload to the same handle', async () => {
    const handle = mint();
    const send = () =>
      request(app).post(`/upload/${handle}`).set('Content-Type', 'image/jpeg').send(JPEG_MAGIC);

    expect((await send()).status).toBe(201);

    const second = await send();
    expect(second.status).toBe(409);
    expect(second.body.error).toBe('already_uploaded');
  });

  it('rejects a handle already redeemed by the tool', async () => {
    const handle = mint();
    await request(app).post(`/upload/${handle}`).set('Content-Type', 'image/jpeg').send(JPEG_MAGIC);
    store.consume(handle, 'user-a');

    const replay = await request(app)
      .post(`/upload/${handle}`)
      .set('Content-Type', 'image/jpeg')
      .send(JPEG_MAGIC);

    expect(replay.status).toBe(404);
  });

  it('rejects an unsupported content type', async () => {
    const response = await request(app)
      .post(`/upload/${mint()}`)
      .set('Content-Type', 'application/pdf')
      .send(Buffer.from('%PDF-1.7'));

    expect(response.status).toBe(415);
    expect(response.body.error).toBe('unsupported_media_type');
  });

  it('rejects bytes that contradict the declared image type', async () => {
    const response = await request(app)
      .post(`/upload/${mint()}`)
      .set('Content-Type', 'image/png')
      .send(Buffer.from('this is definitely not a png'));

    expect(response.status).toBe(415);
    expect(response.body.error_description).toContain('do not match');
  });

  it('rejects an empty body', async () => {
    const response = await request(app)
      .post(`/upload/${mint()}`)
      .set('Content-Type', 'image/jpeg')
      .send(Buffer.alloc(0));

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('empty_body');
  });

  it('rejects a file over the 12 MiB cap', async () => {
    const oversized = Buffer.concat([JPEG_MAGIC, Buffer.alloc(MAX_IMAGE_BYTES)]);

    const response = await request(app)
      .post(`/upload/${mint()}`)
      .set('Content-Type', 'image/jpeg')
      .send(oversized);

    expect(response.status).toBe(413);
    expect(response.body.error).toBe('payload_too_large');
  });

  it('never lets one user redeem an image uploaded against another user handle', async () => {
    const handle = mint('user-a');
    await request(app).post(`/upload/${handle}`).set('Content-Type', 'image/jpeg').send(JPEG_MAGIC);

    const stolen = store.consume(handle, 'user-b');
    expect(stolen.ok).toBe(false);
    if (stolen.ok) {
      return;
    }
    expect(stolen.reason).toBe('forbidden');
  });
});
