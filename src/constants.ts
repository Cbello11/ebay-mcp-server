export const CHARACTER_LIMIT = 25_000;
export const EBAY_API_VERSION = '1155';
export const EBAY_SITE_ID = '0';
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 200;

export const EBAY_PROD = {
  base:    'https://api.ebay.com',
  trading: 'https://api.ebay.com/ws/api.dll',
};

export const EBAY_SANDBOX = {
  base:    'https://api.sandbox.ebay.com',
  trading: 'https://api.sandbox.ebay.com/ws/api.dll',
};

export const CONDITION_NAMES: Record<string, string> = {
  '1000': 'New',
  '1500': 'New Other (no box)',
  '2000': 'Manufacturer Refurbished',
  '2500': 'Seller Refurbished',
  '3000': 'Used',
  '7000': 'For Parts / Not Working',
};
