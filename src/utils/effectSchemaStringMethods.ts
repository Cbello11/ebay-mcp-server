import { Schema } from 'effect';
import type { z as zodTypes } from 'zod';
import { BASIC_EMAIL_PATTERN } from './effectSchemaRefinements.js';
import type { EffectBackedSchema, EffectSchemaState } from './effectSchemaTypes.js';

type AttachEffectSchema = <TZod extends zodTypes.ZodTypeAny>(
  zodSchema: TZod,
  state: EffectSchemaState,
) => EffectBackedSchema<TZod>;

type StringChainableEffectSchema<TZod extends zodTypes.ZodTypeAny> = EffectBackedSchema<TZod> &
  Partial<{
    email: (message?: unknown) => zodTypes.ZodTypeAny;
    regex: (pattern: RegExp, message?: unknown) => zodTypes.ZodTypeAny;
    url: (message?: unknown) => zodTypes.ZodTypeAny;
  }>;

const patchRegexMethod = <TZod extends zodTypes.ZodTypeAny>(
  schema: StringChainableEffectSchema<TZod>,
  state: EffectSchemaState,
  attachEffectSchema: AttachEffectSchema,
): void => {
  if (typeof schema.regex !== 'function') {
    return;
  }

  const regex = schema.regex.bind(schema);
  schema.regex = (pattern: RegExp, message?: unknown) => {
    const effectSchema = Schema.pattern(pattern)(state.requiredSchema as Schema.Schema<string>);
    return attachEffectSchema(regex(pattern, message), {
      ...state,
      requiredSchema: effectSchema,
      schema: effectSchema,
    });
  };
};

const patchEmailMethod = <TZod extends zodTypes.ZodTypeAny>(
  schema: StringChainableEffectSchema<TZod>,
  state: EffectSchemaState,
  attachEffectSchema: AttachEffectSchema,
): void => {
  if (typeof schema.email !== 'function') {
    return;
  }

  const email = schema.email.bind(schema);
  schema.email = (message?: unknown) => {
    const effectSchema = Schema.pattern(BASIC_EMAIL_PATTERN)(
      state.requiredSchema as Schema.Schema<string>,
    );
    return attachEffectSchema(email(message), {
      ...state,
      requiredSchema: effectSchema,
      schema: effectSchema,
    });
  };
};

const patchUrlMethod = <TZod extends zodTypes.ZodTypeAny>(
  schema: StringChainableEffectSchema<TZod>,
  state: EffectSchemaState,
  attachEffectSchema: AttachEffectSchema,
): void => {
  if (typeof schema.url !== 'function') {
    return;
  }

  const url = schema.url.bind(schema);
  schema.url = (message?: unknown) => {
    const effectSchema = Schema.filter((value: string) => URL.canParse(value))(
      state.requiredSchema as Schema.Schema<string>,
    );
    return attachEffectSchema(url(message), {
      ...state,
      requiredSchema: effectSchema,
      schema: effectSchema,
    });
  };
};

/**
 * Rebinds string-oriented chain methods so Effect metadata stays attached.
 *
 * @param schemaCarrier - Zod-compatible string schema carrier to patch.
 * @param state - Effect metadata that belongs to the current schema carrier.
 * @param attachEffectSchema - Adapter function used to attach metadata to returned schemas.
 * @returns Nothing; the schema carrier is patched in place.
 *
 * @example
 * ```ts
 * attachStringEffectMethods(schema, state, attachEffectSchema);
 * ```
 */
export const attachStringEffectMethods = <TZod extends zodTypes.ZodTypeAny>(
  schemaCarrier: EffectBackedSchema<TZod>,
  state: EffectSchemaState,
  attachEffectSchema: AttachEffectSchema,
): void => {
  const schema = schemaCarrier as StringChainableEffectSchema<TZod>;

  patchRegexMethod(schema, state, attachEffectSchema);
  patchEmailMethod(schema, state, attachEffectSchema);
  patchUrlMethod(schema, state, attachEffectSchema);
};
