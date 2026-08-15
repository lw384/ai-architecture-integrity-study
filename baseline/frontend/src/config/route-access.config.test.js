import { describe, expect, it } from 'vitest';

import {
  defaultAllowedRouteIds,
  getDefaultAccessiblePath,
  normalizeAllowedRouteIds,
} from './route-access.config';

describe('route access configuration', () => {
  it('uses default permissions when no permission array is provided', () => {
    expect(normalizeAllowedRouteIds(undefined)).toEqual(defaultAllowedRouteIds);
  });

  it('filters unknown route ids and removes duplicates', () => {
    expect(normalizeAllowedRouteIds(['companies', 'unknown', 'companies'])).toEqual(['companies']);
  });

  it('preserves an explicit empty permission array', () => {
    expect(normalizeAllowedRouteIds([])).toEqual([]);
  });

  it('returns the first accessible menu path', () => {
    expect(getDefaultAccessiblePath(['companies'])).toBe('/companies');
    expect(getDefaultAccessiblePath(['contacts', 'companies'])).toBe('/contacts');
  });

  it('does not return an unauthorized fallback when no routes are allowed', () => {
    expect(getDefaultAccessiblePath([])).toBeNull();
  });
});
