/**
 * Shared eBay API client — handles auth, Trading API XML, Browse API, Fulfillment API.
 */

import axios, { AxiosError } from 'axios';
import { EBAY_API_VERSION, EBAY_SITE_ID, EBAY_PROD, EBAY_SANDBOX as EBAY_SANDBOX_URLS } from '../constants.js';
import type { EbayConfig } from '../types.js';

// ─── Config ──────────────────────────────────────────────────────────────────

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

export function getConfig(): EbayConfig {
  const sandbox = process.env.EBAY_SANDBOX === 'true';
  const urls = sandbox ? EBAY_SANDBOX_URLS : EBAY_PROD;
  return {
    appId:      requireEnv('EBAY_APP_ID'),
    certId:     requireEnv('EBAY_CERT_ID'),
    devId:      requireEnv('EBAY_DEV_ID'),
    userToken:  requireEnv('EBAY_USER_TOKEN'),
    sandbox,
    baseUrl:    urls.base,
    tradingUrl: urls.trading,
  };
}

// ─── App token cache ──────────────────────────────────────────────────────────

let _appToken: string | null = null;
let _appTokenExpiry = 0;

export async function getAppToken(cfg: EbayConfig): Promise<string> {
  if (_appToken && Date.now() < _appTokenExpiry) return _appToken;

  const encoded = Buffer.from(`${cfg.appId}:${cfg.certId}`).toString('base64');
  const resp = await axios.post(
    `${cfg.baseUrl}/identity/v1/oauth2/token`,
    'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope',
    {
      headers: {
        Authorization: `Basic ${encoded}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 15_000,
    }
  );

  _appToken = resp.data.access_token as string;
  _appTokenExpiry = Date.now() + (resp.data.expires_in - 60) * 1000;
  return _appToken;
}

// ─── Browse API (public search, no user token) ────────────────────────────────

export async function browseGet<T>(
  cfg:    EbayConfig,
  path:   string,
  params: Record<string, string>
): Promise<T> {
  const token = await getAppToken(cfg);
  const resp = await axios.get(`${cfg.baseUrl}${path}`, {
    params,
    headers: {
      Authorization: `Bearer ${token}`,
      'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
    },
    timeout: 15_000,
  });
  return resp.data as T;
}

// ─── Sell REST API (user token) ───────────────────────────────────────────────

export async function sellRequest<T>(
  cfg:    EbayConfig,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path:   string,
  body?:  unknown,
  params?: Record<string, string>
): Promise<T> {
  const resp = await axios({
    method,
    url:     `${cfg.baseUrl}${path}`,
    data:    body,
    params,
    headers: {
      Authorization:  `Bearer ${cfg.userToken}`,
      'Content-Type': 'application/json',
      Accept:         'application/json',
    },
    timeout: 20_000,
  });
  return resp.data as T;
}

// ─── Trading API (XML) ────────────────────────────────────────────────────────

export async function tradingRequest(
  cfg:      EbayConfig,
  callName: string,
  xmlBody:  string
): Promise<string> {
  const envelope = `<?xml version="1.0" encoding="utf-8"?>
<${callName}Request xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken>${cfg.userToken}</eBayAuthToken>
  </RequesterCredentials>
  ${xmlBody}
</${callName}Request>`;

  const resp = await axios.post(cfg.tradingUrl, envelope, {
    headers: {
      'X-EBAY-API-COMPATIBILITY-LEVEL': EBAY_API_VERSION,
      'X-EBAY-API-DEV-NAME':  cfg.devId,
      'X-EBAY-API-APP-NAME':  cfg.appId,
      'X-EBAY-API-CERT-NAME': cfg.certId,
      'X-EBAY-API-CALL-NAME': callName,
      'X-EBAY-API-SITEID':    EBAY_SITE_ID,
      'Content-Type':         'text/xml',
    },
    timeout: 20_000,
  });
  return resp.data as string;
}

// ─── XML helpers ──────────────────────────────────────────────────────────────

export function xmlVal(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return m ? m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1').trim() : '';
}

export function xmlAll(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'g');
  const results: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    results.push(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1').trim());
  }
  return results;
}

export function checkTradingAck(xml: string): void {
  if (xml.includes('<Ack>Failure</Ack>')) {
    const msgs = xmlAll(xml, 'LongMessage');
    throw new Error(msgs.join('; ') || 'eBay Trading API returned Failure');
  }
}

// ─── Error formatting ─────────────────────────────────────────────────────────

export function formatError(error: unknown): string {
  if (error instanceof AxiosError) {
    if (error.response) {
      const status = error.response.status;
      if (status === 401) return 'Error: Authentication failed. Check your EBAY_APP_ID and EBAY_CERT_ID.';
      if (status === 403) return 'Error: Access denied. Your credentials may lack the required scope.';
      if (status === 404) return 'Error: Resource not found. Check the ID and try again.';
      if (status === 429) return 'Error: eBay rate limit hit. Wait a moment and try again.';
      return `Error: eBay API returned HTTP ${status}.`;
    }
    if (error.code === 'ECONNABORTED') return 'Error: Request timed out. Try again.';
  }
  if (error instanceof Error) return `Error: ${error.message}`;
  return `Error: ${String(error)}`;
}
