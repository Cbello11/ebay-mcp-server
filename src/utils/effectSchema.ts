import { Effect, Schema } from 'effect';
import { z as zod } from 'zod';
import type { z as zodTypes } from 'zod';
import {
  attachEffectSchema,
  enumValues,
  getRequiredEffectSchema,
  literalUnion,
  objectEffectSchema,
} from './effectSchemaAdapter.js';
import {
  EffectSchemaDecodeError,
  getParseMessage,
  getState,
  type AnyEffectSchema,
  type EffectBackedSchema,
  type InferEffectSchema,
} from './effectSchemaTypes.js';

/**
 * Returns true when a schema was created by this module and carries Effect metadata.
 *
 * @param schema - Unknown schema-like value to inspect.
 * @returns Whether the value has an attached Effect Schema.
 *
 * @example
 * ```ts
 * const backed = isEffectBackedSchema(z.string());
 * ```
 */
export const isEffectBackedSchema = (schema: unknown): schema is EffectBackedSchema =>
  getState(schema) !== undefined;

/**
 * Reads the Effect Schema attached to a schema created by this module.
 *
 * @param schema - Effect-backed schema whose Effect metadata should be returned.
 * @returns The attached Effect Schema, or `undefined` when the value is not backed.
 *
 * @example
 * ```ts
 * const schema = getEffectSchema(z.string());
 * ```
 */
export const getEffectSchema = (schema: unknown): AnyEffectSchema | undefined =>
  getState(schema)?.schema;

/**
 * Builds an Effect object schema from an MCP raw-shape object.
 *
 * @param shape - Tool input raw shape where every field was created by this module.
 * @returns Effect Schema that decodes the whole argument object.
 *
 * @example
 * ```ts
 * const argsSchema = effectStructFromShape({ sku: z.string() });
 * ```
 */
export const effectStructFromShape = (shape: zodTypes.ZodRawShape): Schema.Schema.Any =>
  objectEffectSchema(shape);

/**
 * Decodes unknown input through the Effect Schema attached to a schema value.
 *
 * @param schema - Effect-backed schema to decode with.
 * @param value - Unknown runtime value from the MCP/client boundary.
 * @returns Effect producing the decoded value or a tagged decode error.
 *
 * @example
 * ```ts
 * const decoded = await Effect.runPromise(decodeEffectSchema(z.object({ sku: z.string() }), args));
 * ```
 */
export const decodeEffectSchema = <TSchema extends zodTypes.ZodTypeAny>(
  schema: TSchema,
  value: unknown,
): Effect.Effect<InferEffectSchema<TSchema>, EffectSchemaDecodeError> => {
  const effectSchema = getEffectSchema(schema);
  if (!effectSchema || Schema.isPropertySignature(effectSchema)) {
    return Effect.fail(
      new EffectSchemaDecodeError({
        cause: schema,
        message: 'Schema does not carry a decodable Effect Schema',
      }),
    );
  }

  const decodableSchema = effectSchema as Schema.Schema<InferEffectSchema<TSchema>, unknown, never>;

  return Schema.decodeUnknown(decodableSchema)(value).pipe(
    Effect.map((decoded) => decoded as InferEffectSchema<TSchema>),
    Effect.mapError(
      (error) =>
        new EffectSchemaDecodeError({
          cause: error,
          message: getParseMessage(error),
        }),
    ),
  );
};

/**
 * Synchronously decodes unknown input through an attached Effect Schema.
 *
 * @param schema - Effect-backed schema to decode with.
 * @param value - Unknown runtime value from the MCP/client boundary.
 * @returns Decoded value produced by the attached Effect Schema.
 *
 * @example
 * ```ts
 * const args = decodeEffectSchemaSync(z.object({ sku: z.string() }), rawArgs);
 * ```
 */
export const decodeEffectSchemaSync = <TSchema extends zodTypes.ZodTypeAny>(
  schema: TSchema,
  value: unknown,
): InferEffectSchema<TSchema> => Effect.runSync(decodeEffectSchema(schema, value));

/**
 * Zod-shaped schema factory backed by Effect Schema metadata.
 *
 * @example
 * ```ts
 * const schema = z.object({
 *   sku: z.string().describe('Seller-defined SKU'),
 *   limit: z.number().int().positive().optional(),
 * });
 * ```
 */
export const z = {
  array<TSchema extends zodTypes.ZodTypeAny>(
    schema: TSchema,
    options?: Parameters<typeof zod.array>[1],
  ) {
    const effectSchema = Schema.Array(getRequiredEffectSchema(schema));
    const baseSchema = options?.description
      ? effectSchema.annotations({ description: options.description })
      : effectSchema;

    return attachEffectSchema(zod.array(schema, options), {
      kind: 'array',
      requiredSchema: baseSchema,
      schema: baseSchema,
    });
  },

  boolean(options?: Parameters<typeof zod.boolean>[0]) {
    const baseSchema = options?.description
      ? Schema.Boolean.annotations({ description: options.description })
      : Schema.Boolean;

    return attachEffectSchema(zod.boolean(options), {
      kind: 'boolean',
      requiredSchema: baseSchema,
      schema: baseSchema,
    });
  },

  custom<TValue>(check?: (value: unknown) => boolean, params?: Parameters<typeof zod.custom>[1]) {
    const effectSchema = check
      ? Schema.filter((value: unknown) => check(value))(Schema.Unknown)
      : Schema.Unknown;

    return attachEffectSchema(zod.custom<TValue>(check, params), {
      kind: 'unknown',
      requiredSchema: effectSchema as Schema.Schema.Any,
      schema: effectSchema as Schema.Schema.Any,
    });
  },

  enum<const TValues extends [string, ...string[]]>(values: TValues) {
    const effectSchema = literalUnion(values);
    return attachEffectSchema(zod.enum(values), {
      kind: 'string',
      requiredSchema: effectSchema,
      schema: effectSchema,
    });
  },

  nativeEnum<const TEnum extends zodTypes.EnumLike>(enumLike: TEnum) {
    const effectSchema = literalUnion(enumValues(enumLike));
    return attachEffectSchema(zod.nativeEnum(enumLike), {
      kind: 'string',
      requiredSchema: effectSchema,
      schema: effectSchema,
    });
  },

  never() {
    const effectSchema = Schema.Never as unknown as Schema.Schema.Any;
    return attachEffectSchema(zod.never(), {
      kind: 'unknown',
      requiredSchema: effectSchema,
      schema: effectSchema,
    });
  },

  number(options?: Parameters<typeof zod.number>[0]) {
    const effectSchema = Schema.Number;
    return attachEffectSchema(zod.number(options), {
      kind: 'number',
      requiredSchema: effectSchema,
      schema: effectSchema,
    });
  },

  object<TShape extends zodTypes.ZodRawShape>(
    shape: TShape,
    options?: Parameters<typeof zod.object>[1],
  ) {
    const effectSchema = objectEffectSchema(shape);
    const baseSchema = options?.description
      ? effectSchema.annotations({ description: options.description })
      : effectSchema;

    return attachEffectSchema(zod.object(shape, options), {
      kind: 'object',
      requiredSchema: baseSchema,
      schema: baseSchema,
    });
  },

  record<TKey extends zodTypes.ZodTypeAny, TValue extends zodTypes.ZodTypeAny>(
    keyOrValue: TKey | TValue,
    valueSchema?: TValue,
  ) {
    const schema = valueSchema ?? (keyOrValue as TValue);
    const effectSchema = Schema.Record({
      key: valueSchema ? getRequiredEffectSchema(keyOrValue) : Schema.String,
      value: getRequiredEffectSchema(schema),
    });

    return attachEffectSchema(
      valueSchema ? zod.record(keyOrValue as TKey, valueSchema) : zod.record(schema),
      {
        kind: 'record',
        requiredSchema: effectSchema,
        schema: effectSchema,
      },
    );
  },

  string(options?: Parameters<typeof zod.string>[0]) {
    const baseSchema = options?.description
      ? Schema.String.annotations({ description: options.description })
      : Schema.String;

    return attachEffectSchema(zod.string(options), {
      kind: 'string',
      requiredSchema: baseSchema,
      schema: baseSchema,
    });
  },

  union<
    TOptions extends readonly [zodTypes.ZodTypeAny, zodTypes.ZodTypeAny, ...zodTypes.ZodTypeAny[]],
  >(options: TOptions) {
    const effectSchema = Schema.Union(...options.map((option) => getRequiredEffectSchema(option)));
    return attachEffectSchema(zod.union(options), {
      kind: 'unknown',
      requiredSchema: effectSchema,
      schema: effectSchema,
    });
  },

  unknown() {
    return attachEffectSchema(zod.unknown(), {
      kind: 'unknown',
      requiredSchema: Schema.Unknown,
      schema: Schema.Unknown,
    });
  },
};
