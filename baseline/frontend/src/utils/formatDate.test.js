import { describe, expect, it } from 'vitest';
import { formatForDatetimeLocal } from './formatDate';

describe('formatForDatetimeLocal', () => {
  it('formats an ISO instant as a datetime-local value in the current timezone', () => {
    const localDate = new Date(2026, 7, 17, 14, 5, 30);

    expect(formatForDatetimeLocal(localDate.toISOString())).toBe('2026-08-17T14:05');
  });

  it('returns an empty value when the source value is absent or invalid', () => {
    expect(formatForDatetimeLocal(null)).toBe('');
    expect(formatForDatetimeLocal('not-a-date')).toBe('');
  });
});
