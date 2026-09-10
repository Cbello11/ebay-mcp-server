import { Data, type Schema } from 'effect';
import type { z as zodTypes } from 'zod';

/** Effect Schema value accepted by the Zod compatibility carrier. */
export type AnyEffectSchema = Schema.Schema.Any | Schema.PropertySignature.All;

/** Runtime schema category used to apply chainable refinements. */
export type SchemaKind =
  | 'array'
  | 'boolean'
  | 'number'
  | 'object'
  | 'record'
  | 'string'
  | 'unknown';

export interface EffectSchemaState {
  /** Effect Schema used for the current field, including optional/default wrappers. */
  readonly schema: AnyEffectSchema;
  /** Effect Schema for the required version of this field. */
  readonly requiredSchema: Schema.Schema.Any;
  /** Schema family used by refinement methods such as min/max/int. */
  readonly kind: SchemaKind;
}

/** Zod-compatible schema value carrying Effect metadata at runtime. */
export type EffectBackedSchema<TZod extends zodTypes.ZodTypeAny = zodTypes.ZodTypeAny> = TZod;

/** Shape object whose fields are all Effect-backed SDK schemas. */
export type EffectBackedRawShape = zodTypes.ZodRawShape;

/** Type inferred from an Effect-backed schema. */
export type InferEffectSchema<TSchema extends zodTypes.ZodTypeAny> = zodTypes.infer<TSchema>;

/** Type inferred from an Effect-backed raw-shape object. */
export type InferEffectRawShape<TShape extends zodTypes.ZodRawShape> = zodTypes.infer<
  zodTypes.ZodObject<TShape>
>;

/** Hidden metadata slot attached to schema values created by the adapter. */
export const EFFECT_SCHEMA_STATE = Symbol.for('ebayMcp.effectSchemaState');

/** Decode failure raised when an Effect-backed schema rejects unknown input. */
export class EffectSchemaDecodeError extends Data.TaggedError('EffectSchemaDecodeError')<{
  /** Human-readable parse failure from Effect Schema. */
  readonly message: string;
  /** Original parse issue returned by Effect Schema, or the schema value for metadata misses. */
  readonly cause: unknown;
}> {}

/**
 * Checks whether a value is a non-null object.
 *
 * @param value - Unknown runtime value to inspect.
 * @returns Whether the value can safely be read through object keys.
 *
 * @example
 * ```ts
 * const record = isObjectValue(value) ? value : {};
 * ```
 */
export const isObjectValue = (value: unknown): value is Record<PropertyKey, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * Reads hidden Effect Schema metadata from an adapter-created schema value.
 *
 * @param schema - Unknown schema-like value to inspect.
 * @returns Attached schema state, or `undefined` when the value is not backed.
 *
 * @example
 * ```ts
 * const state = getState(schema);
 * ```
 */
export const getState = (schema: unknown): EffectSchemaState | undefined => {
  if (!(isObjectValue(schema) && EFFECT_SCHEMA_STATE in schema)) {
    return;
  }

  return schema[EFFECT_SCHEMA_STATE] as EffectSchemaState;
};

/**
 * Converts an unknown parse error into a human-readable message.
 *
 * @param error - Unknown parse failure value.
 * @returns Error message when available, otherwise the stringified value.
 *
 * @example
 * ```ts
 * const message = getParseMessage(error);
 * ```
 */
export const getParseMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
