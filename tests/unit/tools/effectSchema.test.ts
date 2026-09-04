import { describe, expect, it, vi } from 'vitest';
import { validateToolContracts } from '@/tools/contracts.js';
import { defineTool } from '@/tools/defineTool.js';
import {
  decodeEffectSchemaSync,
  getEffectSchema,
  isEffectBackedSchema,
  z,
} from '@/utils/effectSchema.js';

describe('Effect-backed tool schemas', () => {
  it('keeps Effect schema metadata through common schema chains', () => {
    const schema = z.object({
      enabled: z.boolean().optional().default(true).describe('Whether the feature is enabled'),
      limit: z.number().int().positive().optional().describe('Positive integer page size'),
      name: z.string().min(1).describe('Seller profile name'),
    });

    expect(isEffectBackedSchema(schema)).toBe(true);
    expect(getEffectSchema(schema.shape.name)).toBeDefined();

    const decoded = decodeEffectSchemaSync(schema, { name: 'defaulted' });
    expect(decoded).toEqual({ enabled: true, name: 'defaulted' });

    expect(() => decodeEffectSchemaSync(schema, { name: '', limit: 1 })).toThrow();
    expect(() => decodeEffectSchemaSync(schema, { name: 'invalid-limit', limit: 1.5 })).toThrow();
  });

  it('preserves passthrough fields when the schema asks for passthrough objects', () => {
    const schema = z
      .object({
        known: z.string(),
      })
      .passthrough();

    expect(decodeEffectSchemaSync(schema, { known: 'yes', extra: 1 })).toEqual({
      extra: 1,
      known: 'yes',
    });
  });

  it('lets defineTool validate handler arguments through Effect Schema', () => {
    const entry = defineTool({
      name: 'test_effect_schema_tool',
      description: 'Test Effect-backed validation',
      inputSchema: z.object({
        name: z.string().min(1).describe('Required name'),
      }).shape,
      handler: (_api, args) => ({ name: args.name }),
    });

    expect(entry.handler({} as never, { name: 'valid' })).toEqual({ name: 'valid' });
    expect(() => entry.handler({} as never, { name: '' })).toThrow();
  });

  it('validates registry contracts by Effect schema metadata, not Zod safeParse', () => {
    const field = z.string().describe('Metadata-backed field');
    vi.spyOn(field, 'safeParse').mockImplementation(() => {
      throw new Error('safeParse should not be part of contract validation');
    });

    const entry = defineTool({
      name: 'test_contract_schema_tool',
      description: 'Test contract validation',
      inputSchema: { field },
      handler: (_api, args) => args,
    });

    expect(entry.definition.inputSchema.field).toBe(field);
    expect(isEffectBackedSchema(entry.definition.inputSchema.field)).toBe(true);
    expect(validateToolContracts([entry.definition]).invalidInputSchemaFields).toEqual([]);

    expect(
      validateToolContracts([
        {
          description: 'Fake contract',
          inputSchema: {
            fake: { safeParse: () => ({ success: true }) } as never,
          },
          name: 'fake_contract',
        },
      ]).invalidInputSchemaFields,
    ).toEqual(['fake_contract.fake']);
  });
});
