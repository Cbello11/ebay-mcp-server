import type { EbayApiClient } from '@/api/client.js';
import {
  buildEndpointParams,
  type EbayApiError,
  EndpointInputError,
  optionalPositiveNumberEffect,
  optionalStringEffect,
  requestGetEffect,
  requireObjectEffect,
  requireStringEffect,
} from '@/api/shared/request.js';
import type { searchActiveListingsInputSchema } from '@/schemas/other/browse.js';
import type { InferEffectSchema } from '@/utils/effectSchemaTypes.js';
import { isRecord } from '@/utils/typeGuards.js';
import { Effect } from 'effect';

/** Input accepted by searchActiveListings. */
type SearchActiveListingsInput = InferEffectSchema<typeof searchActiveListingsInputSchema>;

/** Default item_summary/search page size when maxResults is omitted. */
const DEFAULT_LIMIT = 20;

/** Hard upper bound accepted by Buy Browse API's `limit` parameter. */
const MAX_LIMIT = 200;

/** Money amount as returned by the Buy Browse API. */
export interface BrowseMoney {
  /** Amount as a decimal string. */
  readonly value: string;
  /** Currency code, defaulting to USD when eBay omits it. */
  readonly currency: string;
}

/** Seller summary attached to a Browse item summary. */
export interface BrowseSeller {
  /** Seller's public eBay username. */
  readonly username: string;
  /** Positive feedback percentage, when reported. */
  readonly feedbackPercentage?: string;
  /** Feedback score, when reported. */
  readonly feedbackScore?: number;
}

/** One active listing cleaned for market/pricing research. */
export interface BrowseItem {
  /** eBay item identifier. */
  readonly itemId: string;
  /** Listing title. */
  readonly title: string;
  /** Current asking price, when present. */
  readonly price?: BrowseMoney;
  /** Condition display name, when present. */
  readonly condition?: string;
  /** Buying options such as FIXED_PRICE or AUCTION. */
  readonly buyingOptions?: string[];
  /** Seller summary, when present. */
  readonly seller?: BrowseSeller;
  /** Shipping cost type of the first shipping option, when present. */
  readonly shippingCostType?: string;
  /** Shipping cost of the first shipping option, when present. */
  readonly shippingCost?: BrowseMoney;
  /** Public view-item URL, when present. */
  readonly itemWebUrl?: string;
}

/** Simple price-distribution stats computed over one search results page. */
export interface BrowsePriceStats {
  /** Number of items with a parseable price on this page. */
  readonly count: number;
  /** Lowest parseable price on this page. */
  readonly min: number;
  /** Highest parseable price on this page. */
  readonly max: number;
  /** Mean parseable price on this page, rounded to 2 decimals. */
  readonly average: number;
  /** Median parseable price on this page, rounded to 2 decimals. */
  readonly median: number;
}

/** Cleaned searchActiveListings result returned to tool callers. */
export interface SearchActiveListingsResult {
  /** Keywords used for the search. */
  readonly query: string;
  /** Active listings matched by the query, cleaned for readability. */
  readonly items: BrowseItem[];
  /** Price stats over the returned page, when at least one item has a parseable price. */
  readonly priceStats?: BrowsePriceStats;
  /** Total matching listings reported by Browse, when available. */
  readonly totalMatching?: number;
}

/**
 * Validate maxResults falls within Browse API's supported range.
 *
 * @param limit - Positive page size already validated as > 0.
 * @returns The same value when in range, or a tagged input error.
 */
const requireLimitInRange = (limit: number): Effect.Effect<number, EndpointInputError> => {
  if (limit > MAX_LIMIT) {
    return Effect.fail(
      new EndpointInputError({
        parameter: 'maxResults',
        message: `maxResults must be between 1 and ${MAX_LIMIT}`,
      }),
    );
  }

  return Effect.succeed(limit);
};

/**
 * Map one raw Browse API itemSummary into a cleaned, LLM-friendly item.
 *
 * Browse API responses are already plain JSON (not XML-derived array
 * wrapping like Finding), so this is a direct field pick rather than the
 * firstString/firstRecord unwrapping Finding needs.
 *
 * @param raw - One entry from `itemSummaries`.
 * @returns Cleaned item, or undefined when itemId/title are missing.
 */
const mapBrowseItem = (raw: unknown): BrowseItem | undefined => {
  if (!isRecord(raw)) {
    return;
  }

  const itemId = typeof raw.itemId === 'string' ? raw.itemId : undefined;
  const title = typeof raw.title === 'string' ? raw.title : undefined;
  if (!(itemId && title)) {
    return;
  }

  const price: BrowseMoney | undefined =
    isRecord(raw.price) && typeof raw.price.value === 'string'
      ? {
          value: raw.price.value,
          currency: typeof raw.price.currency === 'string' ? raw.price.currency : 'USD',
        }
      : undefined;

  const seller: BrowseSeller | undefined =
    isRecord(raw.seller) && typeof raw.seller.username === 'string'
      ? {
          username: raw.seller.username,
          ...(typeof raw.seller.feedbackPercentage === 'string'
            ? { feedbackPercentage: raw.seller.feedbackPercentage }
            : {}),
          ...(typeof raw.seller.feedbackScore === 'number'
            ? { feedbackScore: raw.seller.feedbackScore }
            : {}),
        }
      : undefined;

  const shippingOptions = Array.isArray(raw.shippingOptions) ? raw.shippingOptions : [];
  const firstShipping = isRecord(shippingOptions[0]) ? shippingOptions[0] : undefined;
  const shippingCost: BrowseMoney | undefined =
    firstShipping &&
    isRecord(firstShipping.shippingCost) &&
    typeof firstShipping.shippingCost.value === 'string'
      ? {
          value: firstShipping.shippingCost.value,
          currency:
            typeof firstShipping.shippingCost.currency === 'string'
              ? firstShipping.shippingCost.currency
              : 'USD',
        }
      : undefined;

  return {
    itemId,
    title,
    ...(price === undefined ? {} : { price }),
    ...(typeof raw.condition === 'string' ? { condition: raw.condition } : {}),
    ...(Array.isArray(raw.buyingOptions) ? { buyingOptions: raw.buyingOptions } : {}),
    ...(seller === undefined ? {} : { seller }),
    ...(firstShipping && typeof firstShipping.shippingCostType === 'string'
      ? { shippingCostType: firstShipping.shippingCostType }
      : {}),
    ...(shippingCost === undefined ? {} : { shippingCost }),
    ...(typeof raw.itemWebUrl === 'string' ? { itemWebUrl: raw.itemWebUrl } : {}),
  };
};

/**
 * Compute simple price-distribution stats over one search results page.
 *
 * These stats only cover the items actually returned on this page (not the
 * full `total` match count), which is enough for a quick "what are similar
 * active listings asking" read without a second paginated fetch.
 *
 * @param items - Cleaned items already mapped from the response page.
 * @returns Count/min/max/average/median over parseable prices, or undefined
 * when no item on the page has a parseable price.
 */
const computePriceStats = (items: BrowseItem[]): BrowsePriceStats | undefined => {
  const values = items
    .map((item) => (item.price ? Number(item.price.value) : undefined))
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  if (values.length === 0) {
    return undefined;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((total, value) => total + value, 0);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  const round2 = (value: number) => Math.round(value * 100) / 100;

  return {
    count: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    average: round2(sum / sorted.length),
    median: round2(median),
  };
};

/**
 * Buy Browse API - active listing search for market/pricing research.
 *
 * This is a sibling to `FindingApi`, not a replacement for it: eBay retired
 * the Finding API's sold-item search in Feb 2025 with no direct replacement,
 * so `ebay_find_completed_items` cannot be fixed the same way this tool
 * fixes the "no market research tool works" gap. Browse API only ever
 * returns currently-active listings (asking prices), never sold history —
 * treat this as "what similar items are asking right now," a different
 * (weaker but real) signal than true sold comps.
 */
export class BrowseApi {
  private readonly basePath = '/buy/browse/v1';

  public constructor(private readonly client: EbayApiClient) {}

  /**
   * Search live, active eBay listings across all sellers for market and
   * pricing research.
   *
   * Uses an OAuth token with the base `https://api.ebay.com/oauth/api_scope`
   * scope, which every configured app/user token already carries — no
   * additional scope or eBay approval needed (unlike Marketplace Insights,
   * which requires a separate limited-release grant most accounts don't have).
   *
   * @param input - Search keywords plus optional category/result-count/sort.
   * @returns An Effect that succeeds with cleaned items and page price stats.
   *
   * @example
   * ```ts
   * const comps = await Effect.runPromise(
   *   browseApi.searchActiveListings({ query: 'Crosley Harco radio', maxResults: 25 }),
   * );
   * ```
   *
   * @see https://developer.ebay.com/api-docs/buy/browse/resources/item_summary/methods/search
   */
  public searchActiveListings = (
    input: SearchActiveListingsInput,
  ): Effect.Effect<SearchActiveListingsResult, EbayApiError | EndpointInputError> => {
    const client = this.client;
    const basePath = this.basePath;

    return Effect.gen(function* () {
      const validatedInput = yield* requireObjectEffect<SearchActiveListingsInput>(input, 'input');
      const query = yield* requireStringEffect(validatedInput.query, 'query');
      const categoryId = yield* optionalStringEffect(validatedInput.categoryId, 'categoryId');
      const sort = yield* optionalStringEffect(validatedInput.sort, 'sort');
      const maxResultsRaw = yield* optionalPositiveNumberEffect(
        validatedInput.maxResults,
        'maxResults',
      );
      const limit = yield* requireLimitInRange(maxResultsRaw ?? DEFAULT_LIMIT);

      const params = buildEndpointParams({
        q: { wireName: 'q', value: query },
        limit: { wireName: 'limit', value: String(limit) },
        categoryIds: { wireName: 'category_ids', value: categoryId },
        sort: { wireName: 'sort', value: sort },
      });

      const raw = yield* requestGetEffect<unknown>(
        client,
        `${basePath}/item_summary/search`,
        params,
      );
      const rawItems = isRecord(raw) && Array.isArray(raw.itemSummaries) ? raw.itemSummaries : [];

      const items: BrowseItem[] = [];
      for (const entry of rawItems) {
        const mapped = mapBrowseItem(entry);
        if (mapped) {
          items.push(mapped);
        }
      }

      const priceStats = computePriceStats(items);
      const totalMatching = isRecord(raw) && typeof raw.total === 'number' ? raw.total : undefined;

      return {
        query,
        items,
        ...(priceStats === undefined ? {} : { priceStats }),
        ...(totalMatching === undefined ? {} : { totalMatching }),
      };
    });
  };
}
