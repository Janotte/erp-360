export const listPageSizes = [5, 10, 20, 50] as const;

export type ListPageSize = (typeof listPageSizes)[number];

export interface ListPageMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export function listPageMeta(total: number, page: number, limit?: number): ListPageMeta {
  if (!limit) return { total, page: 1, limit: total, totalPages: 1 };
  return {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}
