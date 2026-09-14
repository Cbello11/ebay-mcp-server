/**
 * Metadata cache for eBay taxonomy, categories, and aspects
 * Reduces API calls by 30-50% for common preflight checks
 */

import { apiLogger } from '@/utils/logger.js';

/**
 * Cache entry with TTL
 */
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Simple in-memory cache with TTL support
 */
class MetadataCache {
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private readonly defaultTtlMs: number;

  constructor(ttlMinutes: number = 120) {
    this.defaultTtlMs = ttlMinutes * 60 * 1000;
  }

  /**
   * Get a value from cache if it exists and hasn't expired
   */
  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;

    if (!entry) {
      return undefined;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      apiLogger.debug(`Cache expired for key: ${key}`);
      return undefined;
    }

    apiLogger.debug(`Cache hit for key: ${key}`);
    return entry.value;
  }

  /**
   * Set a value in cache with optional custom TTL
   */
  set<T>(key: string, value: T, ttlMs?: number): void {
    const expiresAt = Date.now() + (ttlMs ?? this.defaultTtlMs);
    this.cache.set(key, { value, expiresAt });
    apiLogger.debug(`Cached key: ${key} (expires in ${((expiresAt - Date.now()) / 1000 / 60).toFixed(1)} min)`);
  }

  /**
   * Clear a specific key
   */
  clear(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clear all cache
   */
  clearAll(): void {
    this.cache.clear();
    apiLogger.info('Metadata cache cleared');
  }

  /**
   * Get cache statistics
   */
  getStats() {
    let expiredCount = 0;
    const now = Date.now();

    for (const entry of this.cache.values()) {
      if (now > entry.expiresAt) {
        expiredCount++;
      }
    }

    return {
      totalEntries: this.cache.size,
      expiredEntries: expiredCount,
      activeEntries: this.cache.size - expiredCount,
    };
  }
}

/**
 * Singleton instance of the metadata cache
 * 2-hour default TTL for category/aspect data
 */
export const metadataCache = new MetadataCache(120);

/**
 * Cache key builders for common eBay metadata
 */
export const cacheKeys = {
  categoryTree: (marketplaceId: string) => `category_tree:${marketplaceId}`,
  categoryAspects: (categoryId: string, marketplaceId: string) =>
    `category_aspects:${categoryId}:${marketplaceId}`,
  itemConditions: (marketplaceId: string) => `item_conditions:${marketplaceId}`,
  returnPolicies: (marketplaceId: string) => `return_policies:${marketplaceId}`,
  taxJurisdictions: (marketplaceId: string) => `tax_jurisdictions:${marketplaceId}`,
  suggestedCategories: (keywords: string, marketplaceId: string) =>
    `category_suggestions:${keywords}:${marketplaceId}`,
};

/**
 * Example usage in a tool:
 *
 * ```ts
 * import { metadataCache, cacheKeys } from '@/utils/metadataCache.js';
 *
 * // Try cache first
 * let aspects = metadataCache.get(cacheKeys.categoryAspects(categoryId, marketplaceId));
 *
 * // Fetch from API if not cached
 * if (!aspects) {
 *   aspects = await api.taxonomy.getItemAspectsForCategory(categoryId, marketplaceId);\n *   // Cache for 4 hours
 *   metadataCache.set(cacheKeys.categoryAspects(categoryId, marketplaceId), aspects, 4 * 60 * 60 * 1000);
 * }
 *
 * return aspects;
 * ```
 */

