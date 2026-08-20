// ─── eBay API response types ──────────────────────────────────────────────────

export interface EbayTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

export interface EbayListing {
  itemId: string;
  title: string;
  price?: { value: string; currency: string };
  quantity?: number;
  quantitySold?: number;
  listingStatus?: string;
  viewItemURL?: string;
  startTime?: string;
  endTime?: string;
  primaryCategory?: { categoryId: string; categoryName: string };
  pictureDetails?: { pictureURL: string[] };
  itemSpecifics?: { nameValueList: Array<{ name: string; value: string[] }> };
  seller?: { feedbackScore: number; positiveFeedbackPercent: string };
  promotedListing?: boolean;
  adRate?: number;
}

export interface EbayOrder {
  orderId: string;
  orderStatus: string;
  creationDate: string;
  lastModifiedDate: string;
  pricingSummary: {
    priceSubtotal: { value: string; currency: string };
    total: { value: string; currency: string };
  };
  buyer: { username: string };
  lineItems: Array<{
    lineItemId: string;
    title: string;
    quantity: number;
    total: { value: string; currency: string };
  }>;
  fulfillmentStartInstructions?: Array<{
    shippingStep?: {
      shippingCarrierCode?: string;
      trackingNumber?: string;
    };
  }>;
  shippingAddress?: {
    fullName: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    stateOrProvince: string;
    postalCode: string;
    countryCode: string;
  };
}

export interface EbayCategorySuggestion {
  category: { categoryId: string; categoryName: string };
  categoryTreeNodeLevel: number;
  relevancy: string;
  ancestorCategorySuggestions: Array<{
    category: { categoryId: string; categoryName: string };
  }>;
}

export interface EbayAspect {
  localizedAspectName: string;
  aspectConstraint: {
    aspectDataType: string;
    aspectMode: string;
    aspectRequired: boolean;
    itemToAspectCardinality: string;
  };
  aspectValues?: Array<{ localizedValue: string }>;
  aspectUsage?: string; // REQUIRED, RECOMMENDED, OPTIONAL
}

export interface EbayMessage {
  messageId: string;
  sender: string;
  subject: string;
  text: string;
  creationDate: string;
  itemId?: string;
  itemTitle?: string;
  flagged: boolean;
  read: boolean;
}

export interface EbayReturn {
  returnId: string;
  orderId: string;
  itemId: string;
  title: string;
  returnStatus: string;
  returnReason: string;
  creationDate: string;
  buyer: { username: string };
}

export interface EbayFeedback {
  feedbackId: string;
  commentingUser: string;
  commentType: string; // Positive, Negative, Neutral
  comment: string;
  commentTime: string;
  itemId?: string;
  itemTitle?: string;
}

export interface EbayPolicy {
  policyId: string;
  name: string;
  description?: string;
  marketplaceId: string;
}

export interface EbayInventoryLocation {
  merchantLocationKey: string;
  name: string;
  locationTypes: string[];
  locationStatus: string;
  location: {
    address: {
      addressLine1: string;
      city: string;
      stateOrProvince: string;
      postalCode: string;
      country: string;
    };
  };
}

export interface EbaySellerSummary {
  feedbackScore: number;
  positiveFeedbackPercent: string;
  feedbackRatingStar: string;
  sellerLevel: string;
  sellerLevelLastEvaluatedOn?: string;
  activeListings?: number;
  userId?: string;
  storeName?: string;
}

export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: unknown;
}
