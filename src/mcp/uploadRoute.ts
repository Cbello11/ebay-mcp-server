/**
 * The HTTP half of the upload-handle bridge: a minimal page the user opens on
 * the device holding the photo, and the endpoint that receives its bytes.
 *
 * Authorization is the handle itself (see `uploadHandles.ts`) because the phone
 * browser is not an MCP client and has no bearer token to present. These routes
 * are therefore mounted *outside* the MCP bearer middleware — but they are
 * write-only and reveal nothing: every response is a status, never image data,
 * never anything about the account.
 *
 * Bytes arrive as a raw body rather than `multipart/form-data`, which keeps the
 * parsing surface to `express.raw` and avoids pulling in a multipart dependency
 * for a single field. The page's script sets `Content-Type` to the file's own
 * type and sends the `File` as the body.
 */

import express, { type NextFunction, type Request, type Response, type Router } from 'express';
import { basename } from 'node:path';
import {
  EXTENSION_BY_MIME,
  type ImageSource,
  MAX_IMAGE_BYTES,
  SUPPORTED_IMAGE_CONTENT_TYPES,
  hasImageSignature,
} from '@/utils/imageValidation.js';
import type { UploadHandleFailureReason, UploadHandleStore } from '@/mcp/uploadHandles.js';
import { serverLogger } from '@/utils/logger.js';

/** Handles are 32 random bytes rendered base64url, so 43 URL-safe characters. */
const HANDLE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** Characters kept in a client-supplied filename; everything else becomes an underscore. */
const UNSAFE_FILENAME_CHARS = /[^\w.-]/g;

/** Longest filename accepted from the client, after sanitisation. */
const MAX_FILENAME_LENGTH = 120;

/** HTTP status that best expresses each refusal reason. */
const STATUS_BY_REASON: Readonly<Record<UploadHandleFailureReason, number>> = {
  not_configured: 503,
  capacity: 503,
  not_found: 404,
  expired: 410,
  forbidden: 403,
  pending: 409,
  already_uploaded: 409,
};

const UPLOAD_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Send a photo to eBay</title>
<link rel="stylesheet" href="/upload/assets/upload.css">
</head>
<body>
<main>
<h1>Send a photo to eBay</h1>
<p>Choose the photo you want to upload. It goes straight to the eBay listing server &mdash; this link works once, and expires ten minutes after it was created.</p>
<input type="file" id="file" accept="image/jpeg,image/png,image/gif,image/webp">
<button id="send" type="button" disabled>Upload</button>
<p id="status" role="status"></p>
</main>
<script src="/upload/assets/upload.js"></script>
</body>
</html>
`;

const UPLOAD_STYLES = `body{font-family:system-ui,-apple-system,sans-serif;margin:0;padding:1.5rem;background:#f6f7f9;color:#14181f}
main{max-width:32rem;margin:0 auto;background:#fff;border-radius:.75rem;padding:1.5rem;box-shadow:0 1px 3px rgba(0,0,0,.12)}
h1{font-size:1.25rem;margin:0 0 .75rem}
p{line-height:1.5;margin:0 0 1rem}
input[type=file]{display:block;width:100%;margin-bottom:1rem}
button{font-size:1rem;padding:.7rem 1.25rem;border:0;border-radius:.5rem;background:#0f62d6;color:#fff;width:100%}
button:disabled{background:#9aa4b2}
#status{margin:1rem 0 0;font-weight:600;min-height:1.5rem}
.ok{color:#136f3b}
.err{color:#b3261e}
`;

// Reads the handle from the URL rather than having it templated in, so the page
// itself is a static string with no injection surface.
const UPLOAD_SCRIPT = `(function () {
  var file = document.getElementById('file');
  var send = document.getElementById('send');
  var status = document.getElementById('status');

  file.addEventListener('change', function () {
    send.disabled = file.files.length === 0;
    status.textContent = '';
    status.className = '';
  });

  send.addEventListener('click', function () {
    var chosen = file.files[0];
    if (!chosen) { return; }

    send.disabled = true;
    status.className = '';
    status.textContent = 'Uploading\\u2026';

    fetch(window.location.pathname, {
      method: 'POST',
      headers: {
        'Content-Type': chosen.type || 'application/octet-stream',
        'X-Upload-Filename': chosen.name.replace(/[^\\w.\\-]/g, '_')
      },
      body: chosen
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (body) {
        if (response.ok) {
          status.className = 'ok';
          status.textContent = 'Uploaded. You can close this page and return to the chat.';
          file.disabled = true;
          return;
        }
        send.disabled = false;
        status.className = 'err';
        status.textContent = body.error_description || 'Upload failed.';
      });
    }).catch(function () {
      send.disabled = false;
      status.className = 'err';
      status.textContent = 'Upload failed. Check your connection and try again.';
    });
  });
})();
`;

/** Express 5 types a route param as `string | string[]`; only a string is valid here. */
const readHandleParam = (req: Request): string =>
  typeof req.params.handle === 'string' ? req.params.handle : '';

/** Strip any path components a client-supplied filename might carry. */
const sanitizeFilename = (raw: string | undefined, contentType: string): string => {
  const fallback = `upload${EXTENSION_BY_MIME[contentType] ?? ''}`;
  if (!raw) {
    return fallback;
  }
  const cleaned = basename(raw).replace(UNSAFE_FILENAME_CHARS, '_').slice(0, MAX_FILENAME_LENGTH);
  return cleaned.length > 0 && cleaned !== '.' && cleaned !== '..' ? cleaned : fallback;
};

const sendRefusal = (res: Response, status: number, error: string, description: string): void => {
  res.status(status).json({ error, error_description: description });
};

/** A validated request body, or the refusal to send back. */
type ValidatedUpload =
  | { readonly ok: true; readonly image: ImageSource }
  | {
      readonly ok: false;
      readonly status: number;
      readonly error: string;
      readonly description: string;
    };

const refuse = (status: number, error: string, description: string): ValidatedUpload => ({
  ok: false,
  status,
  error,
  description,
});

/**
 * Check an uploaded body against the same constraints the other two image
 * paths enforce: a supported declared type, non-empty, within the size cap, and
 * magic bytes that actually match the declared type.
 */
const validateUploadBody = (req: Request): ValidatedUpload => {
  const contentType = (req.headers['content-type'] ?? '').split(';')[0]?.trim() ?? '';
  if (!SUPPORTED_IMAGE_CONTENT_TYPES.includes(contentType)) {
    return refuse(
      415,
      'unsupported_media_type',
      `Unsupported image type. Supported: ${SUPPORTED_IMAGE_CONTENT_TYPES.join(', ')}.`,
    );
  }

  const imageBuffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (imageBuffer.byteLength === 0) {
    return refuse(400, 'empty_body', 'No image bytes were received.');
  }
  // Re-checked alongside express.raw's own limit so the cap still holds if the
  // body ever arrives by another route.
  if (imageBuffer.byteLength > MAX_IMAGE_BYTES) {
    return refuse(
      413,
      'payload_too_large',
      `Image is ${imageBuffer.byteLength} bytes; maximum supported size is ${MAX_IMAGE_BYTES} bytes (12 MiB).`,
    );
  }
  if (!hasImageSignature(imageBuffer, contentType)) {
    return refuse(
      415,
      'unsupported_media_type',
      `File contents do not match declared image type ${contentType}.`,
    );
  }

  const declaredName = req.headers['x-upload-filename'];
  return {
    ok: true,
    image: {
      imageBuffer,
      filename: sanitizeFilename(
        typeof declaredName === 'string' ? declaredName : undefined,
        contentType,
      ),
      contentType,
    },
  };
};

/**
 * Build the router that serves the upload page and accepts image bytes.
 *
 * @param store - Handle store the uploaded bytes are attached to.
 * @returns Express router to mount on the HTTP transport.
 *
 * @example
 * ```ts
 * app.use(createUploadRouter(uploadHandleStore));
 * ```
 */
export const createUploadRouter = (store: UploadHandleStore): Router => {
  const router = express.Router();

  // Registered before the `:handle` routes so the asset paths are not swallowed
  // by the parameter match.
  router.get('/upload/assets/upload.css', (_req, res) => {
    res.type('text/css').send(UPLOAD_STYLES);
  });

  router.get('/upload/assets/upload.js', (_req, res) => {
    res.type('text/javascript').send(UPLOAD_SCRIPT);
  });

  router.get('/upload/:handle', (req: Request, res: Response) => {
    const handle = readHandleParam(req);
    if (!(HANDLE_PATTERN.test(handle) && store.isAwaitingBytes(handle))) {
      res
        .status(404)
        .type('text/html')
        .send(
          '<!doctype html><meta charset="utf-8"><title>Link expired</title><p>This upload link is invalid, already used, or expired. Ask for a new one in the chat.</p>',
        );
      return;
    }
    res.type('text/html').send(UPLOAD_PAGE);
  });

  router.post(
    '/upload/:handle',
    express.raw({ type: [...SUPPORTED_IMAGE_CONTENT_TYPES], limit: MAX_IMAGE_BYTES }),
    (req: Request, res: Response) => {
      const handle = readHandleParam(req);
      if (!HANDLE_PATTERN.test(handle)) {
        sendRefusal(res, 404, 'not_found', 'Unknown, already-used, or expired upload handle.');
        return;
      }

      const validated = validateUploadBody(req);
      if (!validated.ok) {
        sendRefusal(res, validated.status, validated.error, validated.description);
        return;
      }

      const attached = store.attach(handle, validated.image);
      if (!attached.ok) {
        sendRefusal(res, STATUS_BY_REASON[attached.reason], attached.reason, attached.message);
        return;
      }

      serverLogger.info(
        `Accepted pending image upload (${validated.image.contentType}, ${validated.image.imageBuffer.byteLength} bytes)`,
      );
      res.status(201).json({ status: 'uploaded' });
    },
  );

  // express.raw rejects an oversized body by erroring rather than returning, so
  // the limit has to be turned into a clean 413 here.
  router.use((error: unknown, _req: Request, res: Response, next: NextFunction): void => {
    const isTooLarge =
      typeof error === 'object' &&
      error !== null &&
      (error as { type?: string }).type === 'entity.too.large';

    if (!isTooLarge) {
      next(error);
      return;
    }

    sendRefusal(
      res,
      413,
      'payload_too_large',
      `Image exceeds the maximum supported size of ${MAX_IMAGE_BYTES} bytes (12 MiB).`,
    );
  });

  return router;
};
