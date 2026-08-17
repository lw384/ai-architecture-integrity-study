import { describe, expect, it } from 'vitest';

import { getDefaultAccessiblePath } from './route-access.config';

describe('route access configuration', () => {
  it('returns the first accessible menu path', () => {
    expect(getDefaultAccessiblePath(['companies'])).toBe('/companies');
    expect(getDefaultAccessiblePath(['contacts', 'companies'])).toBe('/contacts');
  });

  it('does not return an unauthorized fallback when no routes are allowed', () => {
    expect(getDefaultAccessiblePath([])).toBeNull();
  });
});
