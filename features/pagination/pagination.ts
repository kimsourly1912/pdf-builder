export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export type SortOrder = "asc" | "desc";

export type PageQuery<Sort extends string> = {
  page: number;
  pageSize: number;
  offset: number;
  sort: Sort;
  order: SortOrder;
};

export type PageMeta = {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
};

type ParsePageQueryOptions<Sort extends string> = {
  sorts: readonly Sort[];
  defaultSort: Sort;
  defaultOrder?: SortOrder;
  defaultPageSize?: number;
  maxPageSize?: number;
};

export function parsePageQuery<Sort extends string>(
  searchParams: URLSearchParams,
  options: ParsePageQueryOptions<Sort>,
): PageQuery<Sort> {
  const maxPageSize = positiveInteger(options.maxPageSize) ?? MAX_PAGE_SIZE;
  const defaultPageSize = Math.min(
    positiveInteger(options.defaultPageSize) ?? DEFAULT_PAGE_SIZE,
    maxPageSize,
  );
  const page = positiveInteger(searchParams.get("page")) ?? 1;
  const pageSize = Math.min(
    positiveInteger(searchParams.get("pageSize")) ?? defaultPageSize,
    maxPageSize,
  );
  const requestedSort = searchParams.get("sort");
  const sort = requestedSort && options.sorts.includes(requestedSort as Sort)
    ? requestedSort as Sort
    : options.defaultSort;
  const requestedOrder = searchParams.get("order");
  const order = requestedOrder === "asc" || requestedOrder === "desc"
    ? requestedOrder
    : options.defaultOrder ?? "desc";

  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
    sort,
    order,
  };
}

export function createPageMeta(
  totalItems: number,
  query: Pick<PageQuery<string>, "page" | "pageSize">,
): PageMeta {
  const safeTotal = Math.max(0, Math.trunc(totalItems));
  const totalPages = safeTotal === 0 ? 0 : Math.ceil(safeTotal / query.pageSize);
  return {
    page: query.page,
    pageSize: query.pageSize,
    totalItems: safeTotal,
    totalPages,
    hasPreviousPage: query.page > 1,
    hasNextPage: query.page < totalPages,
  };
}

export function pageMetaFromPayload(
  payload: Partial<PageMeta>,
  fallback: PageMeta,
): PageMeta {
  const totalPages = payload.totalPages ?? fallback.totalPages;
  const requestedPage = payload.page ?? fallback.page;
  const page = totalPages === 0 ? 1 : Math.min(requestedPage, totalPages);
  return {
    page,
    pageSize: payload.pageSize ?? fallback.pageSize,
    totalItems: payload.totalItems ?? fallback.totalItems,
    totalPages,
    hasPreviousPage: page > 1,
    hasNextPage: page < totalPages,
  };
}

function positiveInteger(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
