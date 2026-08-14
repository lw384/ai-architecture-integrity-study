import type { PaginatedResult } from '../types/paginated-result.type';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

export type PaginationQueryInput = {
  page?: number | string;
  pageSize?: number | string;
};

export function resolvePagination(query: PaginationQueryInput) {
  const page = normalizePositiveInteger(query.page, DEFAULT_PAGE);
  const pageSize = Math.min(
    normalizePositiveInteger(query.pageSize, DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE,
  );

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}

export function buildPaginatedResult<TItem>(args: {
  items: TItem[];
  page: number;
  pageSize: number;
  total: number;
}): PaginatedResult<TItem> {
  const { items, page, pageSize, total } = args;

  return {
    items,
    page,
    pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
  };
}

function normalizePositiveInteger(
  value: number | string | undefined,
  fallback: number,
) {
  const parsedValue =
    typeof value === 'number' ? value : Number.parseInt(value ?? '', 10);

  if (!Number.isFinite(parsedValue) || parsedValue < 1) {
    return fallback;
  }

  return parsedValue;
}
