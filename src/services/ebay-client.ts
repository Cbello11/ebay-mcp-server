/**
 * eBay API client — handles OAuth token management and all HTTP requests.
 *
 * Token strategy:
 *   - Application token (client_credentials): Taxonomy, Browse read-only calls
 *   - User token (refresh_token flow): Sell API write calls (listings, orders, messages)
 *
 * Tokens are cached in memory with 90-second safety buffer before expiry.
 * User tokens are auto-refreshed using EBAY_REFRESH_TOKEN + client credentials.
 */

import https from 'https';

const BASE_URL    = 'https://api.ebay.com';
const SANDBOX_URL = 'https://api.sandbox.ebay.com';
const IDENTITY    = 'https://api.ebay.com/identity/v1/oauth2/token';
const SANDBOX_ID  = 'https://api.sandbox.ebay.com/identity/v1/oauth2/token';

export const MARKETPLACE = process.env.EBAY_MARKETPLACE ?? 'EBAY_US';
export const IS_SANDBOX  = process.env.EBAY_SANDBOX === 'true';
export const API_BASE    = IS_SANDBOX ? SANDBOX_URL : BASE_URL;

// ─── Token cache ──────────────────────────────────────────────────────────────

interface TokenCache {
  token:   string;
  expires: number; // epoch ms
}

let appTokenCache:  TokenCache | null = null;
let userTokenCache: TokenCache | null = null;

export async function getAppToken(): Promise<string> {
  const now = Date.now();
  if (appTokenCache && appTokenCache.expires > now + 90_000) {
    return appTokenCache.token;
  }

  const clientId     = process.env.EBAY_CLIENT_ID!;
  const clientSecret = process.env.EBAY_CLIENT_SECRET!;
  const credentials  = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const body = 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope';

  const data = await httpPost(IS_SANDBOX ? SANDBOX_ID : IDENTITY, body, {
    'Authorization':  `Basic ${credentials}`,
    'Content-Type':   'application/x-www-form-urlencoded',
  });

  appTokenCache = {
    token:   data.access_token as string,
    expires: now + (data.expires_in as number) * 1000,
  };
  return appTokenCache.token;
}

// Scopes needed for seller operations
const USER_SCOPES = [
  'https://api.ebay.com/oauth/api_scope',
  'https://api.ebay.com/oauth/api_scope/sell.marketing.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.marketing',
  'https://api.ebay.com/oauth/api_scope/sell.inventory.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.inventory',
  'https://api.ebay.com/oauth/api_scope/sell.account.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.account',
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
  'https://api.ebay.com/oauth/api_scope/sell.analytics.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.finances',
  'https://api.ebay.com/oauth/api_scope/sell.payment.dispute',
  'https://api.ebay.com/oauth/api_scope/commerce.identity.readonly',
].join(' ');

async function fetchUserToken(): Promise<string> {
  const now = Date.now();
  if (userTokenCache && userTokenCache.expires > now + 90_000) {
    return userTokenCache.token;
  }

  const clientId     = process.env.EBAY_CLIENT_ID!;
  const clientSecret = process.env.EBAY_CLIENT_SECRET!;
  const refreshToken = process.env.EBAY_REFRESH_TOKEN || process.env.EBAY_USER_TOKEN;

  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error('Missing eBay credentials (EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, EBAY_REFRESH_TOKEN)');
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const tokenUrl    = IS_SANDBOX ? SANDBOX_ID : IDENTITY;
  const body = `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}&scope=${encodeURIComponent(USER_SCOPES)}`;

  const data = await httpPost(tokenUrl, body, {
    'Authorization': `Basic ${credentials}`,
    'Content-Type':  'application/x-www-form-urlencoded',
  });

  if (!data.access_token) {
    throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);
  }

  userTokenCache = {
    token:   data.access_token as string,
    expires: now + (data.expires_in as number) * 1000,
  };
  return userTokenCache.token;
}

export function getUserToken(): Promise<string> {
  return fetchUserToken();
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

export interface EbayRequestOptions {
  method?:  'GET' | 'POST' | 'PUT' | 'DELETE';
  path:     string;
  query?:   Record<string, string | number | boolean | undefined>;
  body?:    unknown;
  token?:   string | Promise<string>;
  headers?: Record<string, string>;
}

export async function ebayRequest<T = unknown>(opts: EbayRequestOptions): Promise<T> {
  const token  = opts.token ? await Promise.resolve(opts.token) : await getAppToken();
  const method = opts.method ?? 'GET';

  const qs = opts.query
    ? '?' + Object.entries(opts.query)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : '';

  const url = `${API_BASE}${opts.path}${qs}`;

  const headers: Record<string, string> = {
    'Authorization':           `Bearer ${token}`,
    'Accept':                  'application/json',
    'X-EBAY-C-MARKETPLACE-ID': MARKETPLACE,
    ...opts.headers,
  };

  if (opts.body) {
    headers['Content-Type'] = 'application/json';
  }

  const bodyStr = opts.body ? JSON.stringify(opts.body) : undefined;

  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const reqOpts: https.RequestOptions = {
      hostname: urlObj.hostname,
      port:     443,
      path:     urlObj.pathname + urlObj.search,
      method,
      headers,
    };

    const req = https.request(reqOpts, (res) => {
      let raw = '';
      res.on('data', (chunk: Buffer) => { raw += chunk.toString(); });
      res.on('end', () => {
        if (!raw.trim()) {
          resolve({} as T);
          return;
        }
        try {
          const parsed = JSON.parse(raw) as T;
          const status = res.statusCode ?? 0;
          if (status >= 400) {
            const errData = parsed as Record<string, unknown>;
            const msg = Array.isArray(errData.errors)
              ? (errData.errors as Array<{message?: string}>)[0]?.message ?? raw
              : errData.message ?? raw;
            reject(new Error(`eBay API ${status}: ${String(msg)}`));
          } else {
            resolve(parsed);
          }
        } catch {
          reject(new Error(`eBay API response parse error: ${raw.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

export async function ebayGet<T>(path: string, query?: EbayRequestOptions['query'], token?: string | Promise<string>): Promise<T> {
  return ebayRequest<T>({ path, query, token });
}

export async function ebayPost<T>(path: string, body: unknown, token?: string | Promise<string>): Promise<T> {
  return ebayRequest<T>({ method: 'POST', path, body, token });
}

export async function ebayPut<T>(path: string, body: unknown, token?: string | Promise<string>): Promise<T> {
  return ebayRequest<T>({ method: 'PUT', path, body, token });
}

export async function ebayDelete<T>(path: string, token?: string | Promise<string>): Promise<T> {
  return ebayRequest<T>({ method: 'DELETE', path, token });
}

function httpPost(
  url: string,
  body: string,
  headers: Record<string, string>
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const opts: https.RequestOptions = {
      hostname: urlObj.hostname,
      port:     443,
      path:     urlObj.pathname,
      method:   'POST',
      headers:  { ...headers, 'Content-Length': Buffer.byteLength(body) },
    };
    const req = https.request(opts, (res) => {
      let raw = '';
      res.on('data', (c: Buffer) => { raw += c.toString(); });
      res.on('end', () => {
        try { resolve(JSON.parse(raw) as Record<string, unknown>); }
        catch { reject(new Error(`Token parse error: ${raw}`)); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}
