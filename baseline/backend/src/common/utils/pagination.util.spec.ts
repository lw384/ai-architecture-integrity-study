import {
  buildPaginatedResult,
  resolvePagination,
} from './pagination.util';

describe('pagination.util', () => {
  it('uses default page and pageSize', () => {
    // Verifies the default pagination values.
    expect(resolvePagination({})).toEqual({
      page: 1,
      pageSize: 10,
      skip: 0,
      take: 10,
    });
  });

  it('caps pageSize at 100', () => {
    // Verifies the maximum pageSize limit.
    expect(resolvePagination({ page: 2, pageSize: 999 })).toEqual({
      page: 2,
      pageSize: 100,
      skip: 100,
      take: 100,
    });
  });

  it('falls back for invalid values', () => {
    // Verifies fallback behavior for invalid pagination input.
    expect(resolvePagination({ page: 0, pageSize: 'NaN' })).toEqual({
      page: 1,
      pageSize: 10,
      skip: 0,
      take: 10,
    });
  });

  it('calculates skip and take from valid input', () => {
    // Verifies skip/take calculation for a valid page request.
    expect(resolvePagination({ page: '3', pageSize: '25' })).toEqual({
      page: 3,
      pageSize: 25,
      skip: 50,
      take: 25,
    });
  });

  it('returns zero totalPages for empty results', () => {
    // Verifies pagination metadata for an empty result set.
    expect(
      buildPaginatedResult({
        items: [],
        page: 4,
        pageSize: 10,
        total: 0,
      }),
    ).toEqual({
      items: [],
      page: 4,
      pageSize: 10,
      total: 0,
      totalPages: 0,
    });
  });
});
