// eBay API base URLs
export const EBAY_PROD_BASE  = 'https://api.ebay.com';
export const EBAY_SB_BASE    = 'https://api.sandbox.ebay.com';

// Derived at runtime from EBAY_ENVIRONMENT env var
export const EBAY_BASE = process.env.EBAY_ENVIRONMENT === 'SANDBOX'
  ? EBAY_SB_BASE
  : EBAY_PROD_BASE;

// Trading API (XML) endpoint
export const TRADING_API_URL = process.env.EBAY_ENVIRONMENT === 'SANDBOX'
  ? 'https://api.sandbox.ebay.com/ws/api.dll'
  : 'https://api.ebay.com/ws/api.dll';

// Default marketplace
export const MARKETPLACE_ID = 'EBAY_US';
export const SITE_ID = '0'; // US site

// Category tree ID for US
export const CATEGORY_TREE_ID = '0';

// Response size limits
export const CHARACTER_LIMIT = 50_000;
export const MAX_LISTINGS_PER_PAGE = 200;
export const MAX_ORDERS_PER_PAGE   = 50;
export const MAX_MESSAGES_PER_PAGE = 50;

// Default promoted listings rate
export const DEFAULT_AD_RATE = 13;

// eBay OAuth scopes needed
export const SCOPES_APP = [
  'https://api.ebay.com/oauth/api_scope',
];
export const SCOPES_USER = [
  'https://api.ebay.com/oauth/api_scope/sell.inventory',
  'https://api.ebay.com/oauth/api_scope/sell.account',
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
  'https://api.ebay.com/oauth/api_scope/sell.marketing',
  'https://api.ebay.com/oauth/api_scope/sell.analytics.readonly',
  'https://api.ebay.com/oauth/api_scope/buy.browse',
];
