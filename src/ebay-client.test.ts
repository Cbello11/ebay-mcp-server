/**
 * Unit tests for ebay-client helpers and tool input validation.
 */

import { describe, it, expect } from 'vitest';
import { AxiosError } from 'axios';
import { xmlVal, xmlAll, checkTradingAck, xmlEscape, formatError } from './services/ebay-client.js';

// ─── xmlEscape ────────────────────────────────────────────────────────────────

describe('xmlEscape', () => {
  it('escapes ampersands', () => {
    expect(xmlEscape('A & B')).toBe('A &amp; B');
  });
  it('escapes angle brackets', () => {
    expect(xmlEscape('<script>')).toBe('&lt;script&gt;');
  });
  it('escapes double quotes', () => {
    expect(xmlEscape('"hello"')).toBe('&quot;hello&quot;');
  });
  it('escapes single quotes', () => {
    expect(xmlEscape("it's")).toBe('it&apos;s');
  });
  it('leaves safe strings unchanged', () => {
    expect(xmlEscape('iPhone 15 Pro 256GB')).toBe('iPhone 15 Pro 256GB');
  });
  it('handles empty string', () => {
    expect(xmlEscape('')).toBe('');
  });
});

// ─── xmlVal ───────────────────────────────────────────────────────────────────

describe('xmlVal', () => {
  it('returns text content of a tag', () => {
    const xml = '<GetItemResponse><Title>Vintage Camera</Title></GetItemResponse>';
    expect(xmlVal(xml, 'Title')).toBe('Vintage Camera');
  });

  it('returns empty string when tag is absent', () => {
    const xml = '<GetItemResponse><Title>Test</Title></GetItemResponse>';
    expect(xmlVal(xml, 'Price')).toBe('');
  });

  it('handles CDATA sections', () => {
    const xml = '<Root><Description><![CDATA[<b>Hello</b>]]></Description></Root>';
    expect(xmlVal(xml, 'Description')).toBe('<b>Hello</b>');
  });

  it('extracts nested tag', () => {
    const xml = '<Root><Item><ItemID>12345</ItemID></Item></Root>';
    expect(xmlVal(xml, 'ItemID')).toBe('12345');
  });

  it('handles numeric values', () => {
    const xml = '<Root><FeedbackScore>4872</FeedbackScore></Root>';
    expect(xmlVal(xml, 'FeedbackScore')).toBe('4872');
  });
});

// ─── xmlAll ───────────────────────────────────────────────────────────────────

describe('xmlAll', () => {
  it('returns all matching tag values', () => {
    const xml = `<Root>
      <LongMessage>Error one</LongMessage>
      <LongMessage>Error two</LongMessage>
    </Root>`;
    const msgs = xmlAll(xml, 'LongMessage');
    expect(msgs).toContain('Error one');
    expect(msgs).toContain('Error two');
    expect(msgs.length).toBeGreaterThanOrEqual(2);
  });

  it('returns empty array when tag is absent', () => {
    const xml = '<Root><Title>Test</Title></Root>';
    expect(xmlAll(xml, 'LongMessage')).toEqual([]);
  });
});

// ─── checkTradingAck ──────────────────────────────────────────────────────────

describe('checkTradingAck', () => {
  it('does not throw on Success ack', () => {
    const xml = '<GetItemResponse><Ack>Success</Ack></GetItemResponse>';
    expect(() => checkTradingAck(xml)).not.toThrow();
  });

  it('throws on Failure ack with message', () => {
    const xml = `<GetItemResponse>
      <Ack>Failure</Ack>
      <Errors><LongMessage>Item not found</LongMessage></Errors>
    </GetItemResponse>`;
    expect(() => checkTradingAck(xml)).toThrowError('Item not found');
  });

  it('throws with fallback message when no LongMessage', () => {
    const xml = '<GetItemResponse><Ack>Failure</Ack></GetItemResponse>';
    expect(() => checkTradingAck(xml)).toThrowError('eBay Trading API returned Failure');
  });
});

// ─── formatError ─────────────────────────────────────────────────────────────

describe('formatError', () => {
  it('handles a plain Error', () => {
    expect(formatError(new Error('something went wrong'))).toBe('Error: something went wrong');
  });

  it('handles a non-Error value', () => {
    expect(formatError('raw string')).toBe('Error: raw string');
  });

  it('handles AxiosError with 401 status', () => {
    const err = new AxiosError('Unauthorized');
    err.response = { status: 401 } as never;
    expect(formatError(err)).toContain('Authentication failed');
  });

  it('handles AxiosError with 429 status', () => {
    const err = new AxiosError('Too Many Requests');
    err.response = { status: 429 } as never;
    expect(formatError(err)).toContain('rate limit');
  });

  it('handles AxiosError timeout', () => {
    const err = new AxiosError('timeout');
    err.code = 'ECONNABORTED';
    expect(formatError(err)).toContain('timed out');
  });
});
