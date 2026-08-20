import { describe, it, expect } from 'vitest';
import { normalizeTextForEmail } from './text-normalizer';

describe('normalizeTextForEmail', () => {
  it('should replace em dashes with double hyphens', () => {
    // Using Unicode escape for em dash
    const input = 'Travelers searching online \u2014 Adil services';
    const expected = 'Travelers searching online -- Adil services';
    expect(normalizeTextForEmail(input)).toBe(expected);
  });

  it('should replace en dashes with double hyphens', () => {
    // Using Unicode escape for en dash
    const input = 'Price range: $100\u2013$200';
    const expected = 'Price range: $100--$200';
    expect(normalizeTextForEmail(input)).toBe(expected);
  });

  it('should replace smart quotes with straight quotes', () => {
    // Using Unicode escapes for smart quotes
    const input = '\u201CHello\u201D and \u2018world\u2019';
    const expected = '"Hello" and \'world\'';
    expect(normalizeTextForEmail(input)).toBe(expected);
  });

  it('should replace ellipsis with three periods', () => {
    const input = 'Wait\u2026';
    const expected = 'Wait...';
    expect(normalizeTextForEmail(input)).toBe(expected);
  });

  it('should replace bullet points with asterisks', () => {
    const input = '\u2022 First item\n\u2022 Second item';
    const expected = '* First item\n* Second item';
    expect(normalizeTextForEmail(input)).toBe(expected);
  });

  it('should replace non-breaking spaces with regular spaces', () => {
    const input = 'Hello\u00A0World';
    const expected = 'Hello World';
    expect(normalizeTextForEmail(input)).toBe(expected);
  });

  it('should handle empty or null input', () => {
    expect(normalizeTextForEmail('')).toBe('');
    expect(normalizeTextForEmail(null as unknown as string)).toBe(null);
    expect(normalizeTextForEmail(undefined as unknown as string)).toBe(undefined);
  });

  it('should replace multiple problematic characters in one string', () => {
    const input = 'Check out our \u201Cspecial\u201D offer \u2014 up to 50% off\u2026 Don\'t miss it!';
    const expected = 'Check out our "special" offer -- up to 50% off... Don\'t miss it!';
    expect(normalizeTextForEmail(input)).toBe(expected);
  });

  it('should handle the actual bug case from the issue', () => {
    // This simulates what the AI might return
    const input = 'Travelers searching online \u2014 Adil services';
    const result = normalizeTextForEmail(input);
    
    // Should not contain any Unicode em dash or garbled UTF-8 sequences
    expect(result).not.toContain('\u2014');
    expect(result).not.toContain('Ã¢Â€Â"');
    expect(result).toContain('--');
    expect(result).toBe('Travelers searching online -- Adil services');
  });
});
