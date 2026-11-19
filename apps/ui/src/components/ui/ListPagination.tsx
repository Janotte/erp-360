import { listPageSizes, type ListPageSize } from '@erp-360/shared';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';

function pageWindow(current: number, total: number): (number | 'gap')[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const pages = [1, total, current - 1, current, current + 1].filter(
    (page) => page >= 1 && page <= total,
  );
  const unique = [...new Set(pages)].sort((left, right) => left - right);
  const window: (number | 'gap')[] = [];
  for (const page of unique) {
    const previous = window.at(-1);
    if (typeof previous === 'number' && page - previous > 1) window.push('gap');
    window.push(page);
  }
  return window;
}

export function ListPagination({
  page,
  limit,
  total,
  totalPages,
  onPageChange,
  onLimitChange,
}: {
  page: number;
  limit: ListPageSize;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: ListPageSize) => void;
}) {
  useEffect(() => {
    if (totalPages > 0 && page > totalPages) onPageChange(totalPages);
  }, [onPageChange, page, totalPages]);

  const rangeStart = total > 0 ? (page - 1) * limit + 1 : 0;
  const rangeEnd = Math.min(page * limit, total);
  const pages = pageWindow(page, totalPages);

  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-[#dfe5ee] pt-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-4">
        <p className="text-[13px] text-[#64748b]" aria-live="polite">
          Exibindo {rangeStart}–{rangeEnd} de {total}
        </p>
        <label className="flex items-center gap-2 text-[13px] text-[#64748b]">
          Por página
          <select
            className="h-8 rounded-md border border-[#cbd5e1] bg-white px-2 text-sm text-[#172337]"
            value={limit}
            aria-label="Quantidade por página"
            onChange={(event) => onLimitChange(Number(event.target.value) as ListPageSize)}
          >
            {listPageSizes.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="h-4 w-4" /> Anterior
        </Button>
        {pages.map((item, index) =>
          item === 'gap' ? (
            <span key={`gap-${index}`} className="px-1 text-sm text-[#64748b]">
              …
            </span>
          ) : (
            <Button
              key={item}
              type="button"
              variant={item === page ? 'default' : 'outline'}
              size="sm"
              className="min-w-8 px-2"
              aria-current={item === page ? 'page' : undefined}
              onClick={() => onPageChange(item)}
            >
              {item}
            </Button>
          ),
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1"
          disabled={totalPages === 0 || page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Próxima <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
