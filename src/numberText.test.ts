import { describe, expect, it } from 'vitest';
import {
  clampNumber,
  formatNumberText,
  parseNumberText,
  sanitizeNumberText,
} from './numberText';

describe('number input text', () => {
  it('keeps partial decimals so typing 12.5 never collapses to 125', () => {
    let text = '';
    const steps = ['1', '12', '12.', '12.5'];
    steps.forEach((step) => {
      text = sanitizeNumberText(step, false);
    });
    expect(text).toBe('12.5');
    expect(parseNumberText('12.')).toBe(12);
    expect(parseNumberText('12.5')).toBe(12.5);
  });

  it('treats in-progress input as no value yet', () => {
    expect(parseNumberText('')).toBeNull();
    expect(parseNumberText('.')).toBeNull();
    expect(parseNumberText('-')).toBeNull();
    expect(parseNumberText('-.')).toBeNull();
    expect(parseNumberText('abc')).toBeNull();
  });

  it('strips letters, extra dots and unwanted signs', () => {
    expect(sanitizeNumberText('12a3', false)).toBe('123');
    expect(sanitizeNumberText('1.2.3', false)).toBe('1.23');
    expect(sanitizeNumberText('-5', false)).toBe('5');
    expect(sanitizeNumberText('-5', true)).toBe('-5');
    expect(sanitizeNumberText('5-6', true)).toBe('56');
    expect(sanitizeNumberText('1e3', false)).toBe('13');
  });

  it('clamps into the allowed range', () => {
    expect(clampNumber(-1, 0)).toBe(0);
    expect(clampNumber(120, 0, 60)).toBe(60);
    expect(clampNumber(30, 0, 60)).toBe(30);
    expect(clampNumber(30)).toBe(30);
  });

  it('formats values for display', () => {
    expect(formatNumberText(12)).toBe('12');
    expect(formatNumberText(12.5)).toBe('12.5');
    expect(formatNumberText(0, true)).toBe('');
    expect(formatNumberText(Number.NaN)).toBe('');
  });
});
