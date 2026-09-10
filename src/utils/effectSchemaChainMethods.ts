import { Schema } from 'effect';
import type { z as zodTypes } from 'zod';
import {
  annotateSchema,
  defaultValueGetter,
  refineInt,
  refineMax,
  refineMin,
  refinePositive,
} from './effectSchemaRefinements.js';
import { attachStringEffectMethods } from './effectSchemaStringMethods.js';
import type { EffectBackedSchema, EffectSchemaState } from './effectSchemaTypes.js';

type ChainableEffectSchema<TZod extends zodTypes.ZodTypeAny> = EffectBackedSchema<TZod> &
  Partial<{
    default: (value: unknown) => zodTypes.ZodTypeAny;
    describe: (description: string) => zodTypes.ZodTypeAny;
    email: (message?: unknown) => zodTypes.ZodTypeAny;
    extend: (shape: zodTypes.ZodRawShape) => zodTypes.ZodTypeAny;
    int: (message?: unknown) => zodTypes.ZodTypeAny;
    max: (value: number, message?: unknown) => zodTypes.ZodTypeAny;
    min: (value: number, message?: unknown) => zodTypes.ZodTypeAny;
    optional: () => zodTypes.ZodTypeAny;
    passthrough: () => zodTypes.ZodTypeAny;
    positive: (message?: string) => zodTypes.ZodTypeAny;
    regex: (pattern: RegExp, message?: unknown) => zodTypes.ZodTypeAny;
    url: (message?: unknown) => zodTypes.ZodTypeAny;
  }>;

type AttachEffectSchema = <TZod extends zodTypes.ZodTypeAny>(
  zodSchema: TZod,
  state: EffectSchemaState,
) => EffectBackedSchema<TZod>;

type BuildObjectEffectSchema = (shape: zodTypes.ZodRawShape) => Schema.Schema.Any;

const patchDescribeMethod = <TZod extends zodTypes.ZodTypeAny>(
  schema: ChainableEffectSchema<TZod>,
  state: EffectSchemaState,
  attachEffectSchema: AttachEffectSchema,
): void => {
  if (typeof schema.describe !== 'function') {
    return;
  }

  const describe = schema.describe.bind(schema);
  schema.describe = (description: string) =>
    attachEffectSchema(describe(description), {
      ...state,
      requiredSchema: annotateSchema(state.requiredSchema, description) as Schema.Schema.Any,
      schema: annotateSchema(state.schema, description),
    });
};

const patchOptionalMethod = <TZod extends zodTypes.ZodTypeAny>(
  schema: ChainableEffectSchema<TZod>,
  state: EffectSchemaState,
  attachEffectSchema: AttachEffectSchema,
): void => {
  if (typeof schema.optional !== 'function') {
    return;
  }

  const optional = schema.optional.bind(schema);
  schema.optional = () =>
    attachEffectSchema(optional(), {
      ...state,
      schema: Schema.optional(state.requiredSchema),
    });
};

const patchDefaultMethod = <TZod extends zodTypes.ZodTypeAny>(
  schema: ChainableEffectSchema<TZod>,
  state: EffectSchemaState,
  attachEffectSchema: AttachEffectSchema,
): void => {
  if (typeof schema.default !== 'function') {
    return;
  }

  const defaultSchema = schema.default.bind(schema);
  schema.default = (value: unknown) =>
    attachEffectSchema(defaultSchema(value), {
      ...state,
      schema: Schema.optionalWith(state.requiredSchema, { default: defaultValueGetter(value) }),
    });
};

const patchPassthroughMethod = <TZod extends zodTypes.ZodTypeAny>(
  schema: ChainableEffectSchema<TZod>,
  state: EffectSchemaState,
  attachEffectSchema: AttachEffectSchema,
): void => {
  if (typeof schema.passthrough !== 'function') {
    return;
  }

  const passthrough = schema.passthrough.bind(schema);
  schema.passthrough = () => {
    const passthroughEffectSchema = Schema.extend(
      state.requiredSchema,
      Schema.Record({ key: Schema.String, value: Schema.Unknown }),
    );

    return attachEffectSchema(passthrough(), {
      kind: state.kind,
      requiredSchema: passthroughEffectSchema,
      schema: passthroughEffectSchema,
    });
  };
};

const patchExtendMethod = <TZod extends zodTypes.ZodTypeAny>(
  schema: ChainableEffectSchema<TZod>,
  state: EffectSchemaState,
  attachEffectSchema: AttachEffectSchema,
  buildObjectEffectSchema: BuildObjectEffectSchema,
): void => {
  if (typeof schema.extend !== 'function') {
    return;
  }

  const extend = schema.extend.bind(schema);
  schema.extend = (shape: zodTypes.ZodRawShape) => {
    const extensionEffectSchema = buildObjectEffectSchema(shape);
    const effectSchema = Schema.extend(state.requiredSchema, extensionEffectSchema);

    return attachEffectSchema(extend(shape), {
      kind: state.kind,
      requiredSchema: effectSchema,
      schema: effectSchema,
    });
  };
};

const patchMinMethod = <TZod extends zodTypes.ZodTypeAny>(
  schema: ChainableEffectSchema<TZod>,
  state: EffectSchemaState,
  attachEffectSchema: AttachEffectSchema,
): void => {
  if (typeof schema.min !== 'function') {
    return;
  }

  const min = schema.min.bind(schema);
  schema.min = (value: number, message?: unknown) => {
    const effectSchema = refineMin(state.requiredSchema, state.kind, value);
    return attachEffectSchema(min(value, message), {
      ...state,
      requiredSchema: effectSchema,
      schema: effectSchema,
    });
  };
};

const patchMaxMethod = <TZod extends zodTypes.ZodTypeAny>(
  schema: ChainableEffectSchema<TZod>,
  state: EffectSchemaState,
  attachEffectSchema: AttachEffectSchema,
): void => {
  if (typeof schema.max !== 'function') {
    return;
  }

  const max = schema.max.bind(schema);
  schema.max = (value: number, message?: unknown) => {
    const effectSchema = refineMax(state.requiredSchema, state.kind, value);
    return attachEffectSchema(max(value, message), {
      ...state,
      requiredSchema: effectSchema,
      schema: effectSchema,
    });
  };
};

const patchPositiveMethod = <TZod extends zodTypes.ZodTypeAny>(
  schema: ChainableEffectSchema<TZod>,
  state: EffectSchemaState,
  attachEffectSchema: AttachEffectSchema,
): void => {
  if (typeof schema.positive !== 'function') {
    return;
  }

  const positive = schema.positive.bind(schema);
  schema.positive = (message?: string) => {
    const effectSchema = refinePositive(state.requiredSchema, state.kind);
    return attachEffectSchema(positive(message), {
      ...state,
      requiredSchema: effectSchema,
      schema: effectSchema,
    });
  };
};

const patchIntMethod = <TZod extends zodTypes.ZodTypeAny>(
  schema: ChainableEffectSchema<TZod>,
  state: EffectSchemaState,
  attachEffectSchema: AttachEffectSchema,
): void => {
  if (typeof schema.int !== 'function') {
    return;
  }

  const int = schema.int.bind(schema);
  schema.int = (message?: unknown) => {
    const effectSchema = refineInt(state.requiredSchema, state.kind);
    return attachEffectSchema(int(message), {
      ...state,
      requiredSchema: effectSchema,
      schema: effectSchema,
    });
  };
};

/**
 * Rebinds chainable Zod compatibility methods so Effect metadata stays attached.
 *
 * @param schemaCarrier - Zod-compatible schema carrier receiving patched chain methods.
 * @param state - Effect metadata that belongs to the current schema carrier.
 * @param attachEffectSchema - Adapter function used to attach metadata to returned schemas.
 * @param buildObjectEffectSchema - Object-shape builder used by `.extend()`.
 * @returns Nothing; the schema carrier is patched in place.
 *
 * @example
 * ```ts
 * attachChainableEffectMethods(schema, state, attachEffectSchema, objectEffectSchema);
 * ```
 */
export const attachChainableEffectMethods = <TZod extends zodTypes.ZodTypeAny>(
  schemaCarrier: EffectBackedSchema<TZod>,
  state: EffectSchemaState,
  attachEffectSchema: AttachEffectSchema,
  buildObjectEffectSchema: BuildObjectEffectSchema,
): void => {
  const schema = schemaCarrier as ChainableEffectSchema<TZod>;

  patchDescribeMethod(schema, state, attachEffectSchema);
  patchOptionalMethod(schema, state, attachEffectSchema);
  patchDefaultMethod(schema, state, attachEffectSchema);
  patchPassthroughMethod(schema, state, attachEffectSchema);
  patchExtendMethod(schema, state, attachEffectSchema, buildObjectEffectSchema);
  patchMinMethod(schema, state, attachEffectSchema);
  patchMaxMethod(schema, state, attachEffectSchema);
  patchPositiveMethod(schema, state, attachEffectSchema);
  patchIntMethod(schema, state, attachEffectSchema);
  attachStringEffectMethods(schema, state, attachEffectSchema);
};
