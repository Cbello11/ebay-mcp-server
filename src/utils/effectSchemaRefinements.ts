import { Schema } from 'effect';
import type { AnyEffectSchema, SchemaKind } from './effectSchemaTypes.js';

/** Basic email pattern used to mirror the existing Zod email compatibility behavior. */
export const BASIC_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Adds a description annotation to an Effect Schema.
 *
 * @param schema - Effect Schema or property signature to annotate.
 * @param description - Human-readable description copied from the schema carrier.
 * @returns The annotated Effect Schema value.
 *
 * @example
 * ```ts
 * annotateSchema(Schema.String, 'Seller-defined SKU');
 * ```
 */
export const annotateSchema = (schema: AnyEffectSchema, description: string): AnyEffectSchema =>
  schema.annotations({ description });

/**
 * Applies a minimum constraint that matches the schema family.
 *
 * @param schema - Required Effect Schema to refine.
 * @param kind - Schema family that selects the matching Effect refinement.
 * @param value - Minimum length, item count, or numeric value.
 * @returns Refined schema when supported, otherwise the original schema.
 *
 * @example
 * ```ts
 * refineMin(Schema.String, 'string', 3);
 * ```
 */
export const refineMin = (
  schema: Schema.Schema.Any,
  kind: SchemaKind,
  value: number,
): Schema.Schema.Any => {
  if (kind === 'string') {
    return Schema.minLength(value)(schema as Schema.Schema<string>);
  }
  if (kind === 'array') {
    return Schema.minItems(value)(schema as Schema.Schema<readonly unknown[]>);
  }
  if (kind === 'number') {
    return Schema.greaterThanOrEqualTo(value)(schema as Schema.Schema<number>);
  }
  return schema;
};

/**
 * Applies a maximum constraint that matches the schema family.
 *
 * @param schema - Required Effect Schema to refine.
 * @param kind - Schema family that selects the matching Effect refinement.
 * @param value - Maximum length, item count, or numeric value.
 * @returns Refined schema when supported, otherwise the original schema.
 *
 * @example
 * ```ts
 * refineMax(Schema.Number, 'number', 100);
 * ```
 */
export const refineMax = (
  schema: Schema.Schema.Any,
  kind: SchemaKind,
  value: number,
): Schema.Schema.Any => {
  if (kind === 'string') {
    return Schema.maxLength(value)(schema as Schema.Schema<string>);
  }
  if (kind === 'array') {
    return Schema.maxItems(value)(schema as Schema.Schema<readonly unknown[]>);
  }
  if (kind === 'number') {
    return Schema.lessThanOrEqualTo(value)(schema as Schema.Schema<number>);
  }
  return schema;
};

/**
 * Applies the positive-number refinement when the schema is numeric.
 *
 * @param schema - Required Effect Schema to refine.
 * @param kind - Schema family that controls whether the refinement applies.
 * @returns Refined numeric schema, or the original schema for non-numeric values.
 *
 * @example
 * ```ts
 * refinePositive(Schema.Number, 'number');
 * ```
 */
export const refinePositive = (schema: Schema.Schema.Any, kind: SchemaKind): Schema.Schema.Any =>
  kind === 'number' ? Schema.positive()(schema as Schema.Schema<number>) : schema;

/**
 * Applies the integer refinement when the schema is numeric.
 *
 * @param schema - Required Effect Schema to refine.
 * @param kind - Schema family that controls whether the refinement applies.
 * @returns Refined integer schema, or the original schema for non-numeric values.
 *
 * @example
 * ```ts
 * refineInt(Schema.Number, 'number');
 * ```
 */
export const refineInt = (schema: Schema.Schema.Any, kind: SchemaKind): Schema.Schema.Any =>
  kind === 'number' ? Schema.int()(schema as Schema.Schema<number>) : schema;

/**
 * Converts a Zod default value or default factory into a factory callback.
 *
 * @param value - Static default value or function returning one.
 * @returns Function that returns the default value.
 *
 * @example
 * ```ts
 * const getDefault = defaultValueGetter('ACTIVE');
 * ```
 */
export const defaultValueGetter = (value: unknown): (() => unknown) =>
  typeof value === 'function' ? (value as () => unknown) : () => value;
