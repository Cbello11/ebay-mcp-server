export interface EbayConfig {
  appId:      string;
  certId:     string;
  devId:      string;
  userToken:  string;
  sandbox:    boolean;
  baseUrl:    string;
  tradingUrl: string;
}

export interface SearchItem {
  itemId:    string;
  title:     string;
  price:     string;
  condition: string;
  seller:    string;
  location:  string;
  url:       string;
}

export interface ListingSummary {
  itemId:    string;
  title:     string;
  price:     string;
  quantity:  string;
  watchers:  string;
  timeLeft:  string;
}

export interface OrderSummary {
  orderId:     string;
  date:        string;
  buyer:       string;
  total:       string;
  payment:     string;
  fulfillment: string;
  items:       Array<{ lineItemId: string; title: string; qty: string }>;
}

export interface PaginatedResult<T> {
  total:       number;
  count:       number;
  offset:      number;
  has_more:    boolean;
  next_offset?: number;
  items:       T[];
}

export enum ResponseFormat {
  MARKDOWN = 'markdown',
  JSON     = 'json',
}
