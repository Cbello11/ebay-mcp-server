import type { EbayApiClient } from '@/api/client.js';
import {
  buildEndpointParams,
  type EbayApiError,
  type EndpointInputError,
  requestGetEffect,
  requireObjectEffect,
  requireStringEffect,
} from '@/api/shared/request.js';
import { Effect } from 'effect';

/** Input accepted by getDefaultCategoryTreeId. */
export interface GetDefaultCategoryTreeIdInput {
  /** eBay marketplace identifier, such as EBAY_US. */
  readonly marketplaceId: string;
}

/** Input accepted by getCategoryTree. */
export interface GetCategoryTreeInput {
  /** Category tree identifier returned by getDefaultCategoryTreeId. */
  readonly categoryTreeId: string;
}

/** Input accepted by getCategorySubtree. */
export interface GetCategorySubtreeInput {
  /** Category tree identifier returned by getDefaultCategoryTreeId. */
  readonly categoryTreeId: string;
  /** Category identifier that anchors the requested subtree. */
  readonly categoryId: string;
}

/** Input accepted by getCategorySuggestions. */
export interface GetCategorySuggestionsInput {
  /** Category tree identifier returned by getDefaultCategoryTreeId. */
  readonly categoryTreeId: string;
  /** Search text used by eBay to suggest matching categories. */
  readonly query: string;
}

/** Input accepted by getItemAspectsForCategory. */
export interface GetItemAspectsForCategoryInput {
  /** Category tree identifier returned by getDefaultCategoryTreeId. */
  readonly categoryTreeId: string;
  /** Category identifier whose item aspects should be returned. */
  readonly categoryId: string;
}

/** Input accepted by getCompatibilityProperties. */
export interface GetCompatibilityPropertiesInput {
  /** Category tree identifier returned by getDefaultCategoryTreeId. */
  readonly categoryTreeId: string;
  /** Compatibility-enabled category identifier. */
  readonly categoryId: string;
}

/** Input accepted by getCompatibilityPropertyValues. */
export interface GetCompatibilityPropertyValuesInput {
  /** Category tree identifier returned by getDefaultCategoryTreeId. */
  readonly categoryTreeId: string;
  /** Compatibility-enabled category identifier. */
  readonly categoryId: string;
  /** Compatibility property name, such as Make, Model, or Year. */
  readonly compatibilityProperty: string;
}

/**
 * Raw Taxonomy API response payload.
 *
 * The current generated type tree does not include a commerce taxonomy module,
 * so taxonomy endpoints return eBay's payload unchanged instead of inventing an
 * internal response model.
 *
 * @see https://developer.ebay.com/api-docs/commerce/taxonomy/overview.html
 */
type TaxonomyRawResponse = Record<string, unknown>;

/**
 * Response returned by eBay Taxonomy API getDefaultCategoryTreeId.
 *
 * @see https://developer.ebay.com/api-docs/commerce/taxonomy/resources/category_tree/methods/getDefaultCategoryTreeId
 */
export type GetDefaultCategoryTreeIdResponse = TaxonomyRawResponse;

/**
 * Response returned by eBay Taxonomy API getCategoryTree.
 *
 * @see https://developer.ebay.com/api-docs/commerce/taxonomy/resources/category_tree/methods/getCategoryTree
 */
export type GetCategoryTreeResponse = TaxonomyRawResponse;

/**
 * Response returned by eBay Taxonomy API getCategorySubtree.
 *
 * @see https://developer.ebay.com/api-docs/commerce/taxonomy/resources/category_tree/methods/getCategorySubtree
 */
export type GetCategorySubtreeResponse = TaxonomyRawResponse;

/**
 * Response returned by eBay Taxonomy API getCategorySuggestions.
 *
 * @see https://developer.ebay.com/api-docs/commerce/taxonomy/resources/category_tree/methods/getCategorySuggestions
 */
export type GetCategorySuggestionsResponse = TaxonomyRawResponse;

/**
 * Response returned by eBay Taxonomy API getItemAspectsForCategory.
 *
 * @see https://developer.ebay.com/api-docs/commerce/taxonomy/resources/category_tree/methods/getItemAspectsForCategory
 */
export type GetItemAspectsForCategoryResponse = TaxonomyRawResponse;

/**
 * Response returned by eBay Taxonomy API getCompatibilityProperties.
 *
 * @see https://developer.ebay.com/api-docs/commerce/taxonomy/resources/category_tree/methods/getCompatibilityProperties
 */
export type GetCompatibilityPropertiesResponse = TaxonomyRawResponse;

/**
 * Response returned by eBay Taxonomy API getCompatibilityPropertyValues.
 *
 * @see https://developer.ebay.com/api-docs/commerce/taxonomy/resources/category_tree/methods/getCompatibilityPropertyValues
 */
export type GetCompatibilityPropertyValuesResponse = TaxonomyRawResponse;

/** Taxonomy API - category trees, category suggestions, and compatibility metadata. */
export class TaxonomyApi {
  private readonly basePath = '/commerce/taxonomy/v1';

  public constructor(private readonly client: EbayApiClient) {}

  /**
   * Retrieves the default category tree ID for a marketplace.
   *
   * @param input - Marketplace identifier used to select the default tree.
   * @returns An Effect that succeeds with eBay's getDefaultCategoryTreeId response.
   *
   * @example
   * ```ts
   * const tree = await Effect.runPromise(
   *   taxonomyApi.getDefaultCategoryTreeId({ marketplaceId: 'EBAY_US' }),
   * );
   * ```
   *
   * @see https://developer.ebay.com/api-docs/commerce/taxonomy/resources/category_tree/methods/getDefaultCategoryTreeId
   */
  public getDefaultCategoryTreeId = (
    input: GetDefaultCategoryTreeIdInput,
  ): Effect.Effect<GetDefaultCategoryTreeIdResponse, EbayApiError | EndpointInputError> => {
    const client = this.client;
    const path = `${this.basePath}/get_default_category_tree_id`;

    return Effect.gen(function* () {
      const validatedInput = yield* requireObjectEffect<GetDefaultCategoryTreeIdInput>(
        input,
        'input',
      );
      const marketplaceId = yield* requireStringEffect(
        validatedInput.marketplaceId,
        'marketplaceId',
      );
      const params = buildEndpointParams({
        marketplaceId: { wireName: 'marketplace_id', value: marketplaceId },
      });

      return yield* requestGetEffect<GetDefaultCategoryTreeIdResponse>(client, path, params);
    });
  };

  /**
   * Retrieves a full category tree.
   *
   * @param input - Category tree identifier.
   * @returns An Effect that succeeds with eBay's getCategoryTree response.
   *
   * @example
   * ```ts
   * const tree = await Effect.runPromise(taxonomyApi.getCategoryTree({ categoryTreeId: '0' }));
   * ```
   *
   * @see https://developer.ebay.com/api-docs/commerce/taxonomy/resources/category_tree/methods/getCategoryTree
   */
  public getCategoryTree = (
    input: GetCategoryTreeInput,
  ): Effect.Effect<GetCategoryTreeResponse, EbayApiError | EndpointInputError> => {
    const client = this.client;
    const basePath = this.basePath;

    return Effect.gen(function* () {
      const validatedInput = yield* requireObjectEffect<GetCategoryTreeInput>(input, 'input');
      const categoryTreeId = yield* requireStringEffect(
        validatedInput.categoryTreeId,
        'categoryTreeId',
      );

      return yield* requestGetEffect<GetCategoryTreeResponse>(
        client,
        `${basePath}/category_tree/${categoryTreeId}`,
      );
    });
  };

  /**
   * Retrieves a category subtree beneath one category.
   *
   * @param input - Category tree and category identifiers.
   * @returns An Effect that succeeds with eBay's getCategorySubtree response.
   *
   * @example
   * ```ts
   * const subtree = await Effect.runPromise(
   *   taxonomyApi.getCategorySubtree({ categoryTreeId: '0', categoryId: '123' }),
   * );
   * ```
   *
   * @see https://developer.ebay.com/api-docs/commerce/taxonomy/resources/category_tree/methods/getCategorySubtree
   */
  public getCategorySubtree = (
    input: GetCategorySubtreeInput,
  ): Effect.Effect<GetCategorySubtreeResponse, EbayApiError | EndpointInputError> => {
    const client = this.client;
    const basePath = this.basePath;

    return Effect.gen(function* () {
      const validatedInput = yield* requireObjectEffect<GetCategorySubtreeInput>(input, 'input');
      const categoryTreeId = yield* requireStringEffect(
        validatedInput.categoryTreeId,
        'categoryTreeId',
      );
      const categoryId = yield* requireStringEffect(validatedInput.categoryId, 'categoryId');
      const params = buildEndpointParams({
        categoryId: { wireName: 'category_id', value: categoryId },
      });

      return yield* requestGetEffect<GetCategorySubtreeResponse>(
        client,
        `${basePath}/category_tree/${categoryTreeId}/get_category_subtree`,
        params,
      );
    });
  };

  /**
   * Retrieves category suggestions for listing search text.
   *
   * @param input - Category tree identifier and query text.
   * @returns An Effect that succeeds with eBay's getCategorySuggestions response.
   *
   * @example
   * ```ts
   * const suggestions = await Effect.runPromise(
   *   taxonomyApi.getCategorySuggestions({ categoryTreeId: '0', query: 'iPhone' }),
   * );
   * ```
   *
   * @see https://developer.ebay.com/api-docs/commerce/taxonomy/resources/category_tree/methods/getCategorySuggestions
   */
  public getCategorySuggestions = (
    input: GetCategorySuggestionsInput,
  ): Effect.Effect<GetCategorySuggestionsResponse, EbayApiError | EndpointInputError> => {
    const client = this.client;
    const basePath = this.basePath;

    return Effect.gen(function* () {
      const validatedInput = yield* requireObjectEffect<GetCategorySuggestionsInput>(
        input,
        'input',
      );
      const categoryTreeId = yield* requireStringEffect(
        validatedInput.categoryTreeId,
        'categoryTreeId',
      );
      const query = yield* requireStringEffect(validatedInput.query, 'query');
      const params = buildEndpointParams({
        query: { wireName: 'q', value: query },
      });

      return yield* requestGetEffect<GetCategorySuggestionsResponse>(
        client,
        `${basePath}/category_tree/${categoryTreeId}/get_category_suggestions`,
        params,
      );
    });
  };

  /**
   * Retrieves item aspects for a category.
   *
   * @param input - Category tree and category identifiers.
   * @returns An Effect that succeeds with eBay's getItemAspectsForCategory response.
   *
   * @example
   * ```ts
   * const aspects = await Effect.runPromise(
   *   taxonomyApi.getItemAspectsForCategory({ categoryTreeId: '0', categoryId: '123' }),
   * );
   * ```
   *
   * @see https://developer.ebay.com/api-docs/commerce/taxonomy/resources/category_tree/methods/getItemAspectsForCategory
   */
  public getItemAspectsForCategory = (
    input: GetItemAspectsForCategoryInput,
  ): Effect.Effect<GetItemAspectsForCategoryResponse, EbayApiError | EndpointInputError> => {
    const client = this.client;
    const basePath = this.basePath;

    return Effect.gen(function* () {
      const validatedInput = yield* requireObjectEffect<GetItemAspectsForCategoryInput>(
        input,
        'input',
      );
      const categoryTreeId = yield* requireStringEffect(
        validatedInput.categoryTreeId,
        'categoryTreeId',
      );
      const categoryId = yield* requireStringEffect(validatedInput.categoryId, 'categoryId');
      const params = buildEndpointParams({
        categoryId: { wireName: 'category_id', value: categoryId },
      });

      return yield* requestGetEffect<GetItemAspectsForCategoryResponse>(
        client,
        `${basePath}/category_tree/${categoryTreeId}/get_item_aspects_for_category`,
        params,
      );
    });
  };

  /**
   * Retrieves compatibility property names for a category.
   *
   * @param input - Category tree and compatibility-enabled category identifiers.
   * @returns An Effect that succeeds with eBay's getCompatibilityProperties response.
   *
   * @example
   * ```ts
   * const properties = await Effect.runPromise(
   *   taxonomyApi.getCompatibilityProperties({ categoryTreeId: '0', categoryId: '123' }),
   * );
   * ```
   *
   * @see https://developer.ebay.com/api-docs/commerce/taxonomy/resources/category_tree/methods/getCompatibilityProperties
   */
  public getCompatibilityProperties = (
    input: GetCompatibilityPropertiesInput,
  ): Effect.Effect<GetCompatibilityPropertiesResponse, EbayApiError | EndpointInputError> => {
    const client = this.client;
    const basePath = this.basePath;

    return Effect.gen(function* () {
      const validatedInput = yield* requireObjectEffect<GetCompatibilityPropertiesInput>(
        input,
        'input',
      );
      const categoryTreeId = yield* requireStringEffect(
        validatedInput.categoryTreeId,
        'categoryTreeId',
      );
      const categoryId = yield* requireStringEffect(validatedInput.categoryId, 'categoryId');
      const params = buildEndpointParams({
        categoryId: { wireName: 'category_id', value: categoryId },
      });

      return yield* requestGetEffect<GetCompatibilityPropertiesResponse>(
        client,
        `${basePath}/category_tree/${categoryTreeId}/get_compatibility_properties`,
        params,
      );
    });
  };

  /**
   * Retrieves compatibility values for one property within a category.
   *
   * @param input - Category tree, category, and compatibility property identifiers.
   * @returns An Effect that succeeds with eBay's getCompatibilityPropertyValues response.
   *
   * @example
   * ```ts
   * const values = await Effect.runPromise(
   *   taxonomyApi.getCompatibilityPropertyValues({
   *     categoryTreeId: '0',
   *     categoryId: '123',
   *     compatibilityProperty: 'Make',
   *   }),
   * );
   * ```
   *
   * @see https://developer.ebay.com/api-docs/commerce/taxonomy/resources/category_tree/methods/getCompatibilityPropertyValues
   */
  public getCompatibilityPropertyValues = (
    input: GetCompatibilityPropertyValuesInput,
  ): Effect.Effect<GetCompatibilityPropertyValuesResponse, EbayApiError | EndpointInputError> => {
    const client = this.client;
    const basePath = this.basePath;

    return Effect.gen(function* () {
      const validatedInput = yield* requireObjectEffect<GetCompatibilityPropertyValuesInput>(
        input,
        'input',
      );
      const categoryTreeId = yield* requireStringEffect(
        validatedInput.categoryTreeId,
        'categoryTreeId',
      );
      const categoryId = yield* requireStringEffect(validatedInput.categoryId, 'categoryId');
      const compatibilityProperty = yield* requireStringEffect(
        validatedInput.compatibilityProperty,
        'compatibilityProperty',
      );
      const params = buildEndpointParams({
        categoryId: { wireName: 'category_id', value: categoryId },
        compatibilityProperty: {
          wireName: 'compatibility_property',
          value: compatibilityProperty,
        },
      });

      return yield* requestGetEffect<GetCompatibilityPropertyValuesResponse>(
        client,
        `${basePath}/category_tree/${categoryTreeId}/get_compatibility_property_values`,
        params,
      );
    });
  };
}
