import { Schema } from 'effect';
import type { z as zodTypes } from 'zod';
import { attachChainableEffectMethods } from './effectSchemaChainMethods.js';
import {
  EFFECT_SCHEMA_STATE,
  type AnyEffectSchema,
  type EffectBackedSchema,
  type EffectSchemaState,
} from './effectSchemaTypes.js';

const getEffectState = (schema: unknown): EffectSchemaState | undefined => {
  if (!(typeof schema === 'object' && schema !== null && EFFECT_SCHEMA_STATE in schema)) {
    return;
  }

  return schema[EFFECT_SCHEMA_STATE] as EffectSchemaState;
};

const buildObjectEffectSchema = (shape: zodTypes.ZodRawShape): Schema.Schema.Any => {
  const effectShape: Record<string, AnyEffectSchema> = {};
  for (const [key, fieldSchema] of Object.entries(shape)) {
    effectShape[key] = getFieldEffectSchema(fieldSchema);
  }

  return Schema.Struct(effectShape);
};

/**
 * Reads the required Effect Schema for an adapter-backed schema value.
 *
 * @param schema - Schema value created by the adapter.
 * @returns Required Effect Schema, or `Schema.Unknown` when metadata is missing.
 *
 * @example
 * ```ts
 * const effectSchema = getRequiredEffectSchema(z.string().optional());
 * ```
 */
export const getRequiredEffectSchema = (schema: unknown): Schema.Schema.Any => {
  const state = getEffectState(schema);
  if (!state) {
    return Schema.Unknown;
  }

  return state.requiredSchema;
};

/**
 * Reads the field-level Effect Schema for an adapter-backed schema value.
 *
 * @param schema - Schema value created by the adapter.
 * @returns Current field Effect Schema, preserving optional/default wrappers when present.
 *
 * @example
 * ```ts
 * const fieldSchema = getFieldEffectSchema(z.string().optional());
 * ```
 */
export const getFieldEffectSchema = (schema: unknown): AnyEffectSchema => {
  const state = getEffectState(schema);
  if (!state) {
    return Schema.Unknown;
  }

  return state.schema;
};

/**
 * Builds an Effect object schema from an adapter-backed raw shape.
 *
 * @param shape - Zod-compatible raw shape whose fields carry Effect metadata.
 * @returns Effect Schema struct for the object shape.
 *
 * @example
 * ```ts
 * const effectSchema = objectEffectSchema({ sku: z.string() });
 * ```
 */
export const objectEffectSchema = (shape: zodTypes.ZodRawShape): Schema.Schema.Any =>
  buildObjectEffectSchema(shape);

/**
 * Extracts string values from a TypeScript enum-like object.
 *
 * @param enumLike - Enum-like object accepted by `z.nativeEnum`.
 * @returns Non-empty tuple of unique string enum values.
 *
 * @example
 * ```ts
 * const values = enumValues(MarketplaceId);
 * ```
 */
export const enumValues = (enumLike: Record<string, string | number>): [string, ...string[]] => {
  const values = Object.values(enumLike).filter(
    (value): value is string => typeof value === 'string',
  );
  const [first, ...rest] = [...new Set(values)];
  if (!first) {
    return [''];
  }

  return [first, ...rest];
};

/**
 * Builds an Effect literal union from string values.
 *
 * @param values - Non-empty list of literal string values.
 * @returns Effect Schema accepting exactly those values.
 *
 * @example
 * ```ts
 * const schema = literalUnion(['ACTIVE', 'PAUSED']);
 * ```
 */
export const literalUnion = (values: readonly [string, ...string[]]): Schema.Schema.Any =>
  Schema.Literal(...values);

/**
 * Attaches Effect Schema metadata to a Zod-compatible schema carrier.
 *
 * @param zodSchema - Zod schema object exposed to MCP SDK and JSON-schema tooling.
 * @param state - Effect metadata used for runtime decode and chained refinements.
 * @returns The same schema carrier with hidden Effect metadata attached.
 *
 * @example
 * ```ts
 * const schema = attachEffectSchema(zod.string(), {
 *   kind: 'string',
 *   requiredSchema: Schema.String,
 *   schema: Schema.String,
 * });
 * ```
 */
export const attachEffectSchema = <TZod extends zodTypes.ZodTypeAny>(
  zodSchema: TZod,
  state: EffectSchemaState,
): EffectBackedSchema<TZod> => {
  const schema = zodSchema as EffectBackedSchema<TZod>;

  Object.defineProperty(schema, EFFECT_SCHEMA_STATE, {
    configurable: false,
    enumerable: false,
    value: state,
  });
  attachChainableEffectMethods(schema, state, attachEffectSchema, buildObjectEffectSchema);

  return schema as EffectBackedSchema<TZod>;
};
