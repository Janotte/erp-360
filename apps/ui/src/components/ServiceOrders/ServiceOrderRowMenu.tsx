import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import type { ServiceOrderListItem } from '@/services/serviceOrders';

export function ServiceOrderRowMenu({
  cursor,
  onClose,
  onBill,
}: {
  cursor: { row: ServiceOrderListItem; x: number; y: number } | null;
  onClose: () => void;
  onBill: (orderId: string) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!cursor) return;
    const closeOnPointer = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      onClose();
    };
    const closeOnKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', closeOnPointer);
    window.addEventListener('keydown', closeOnKey);
    window.addEventListener('scroll', onClose, true);
    return () => {
      window.removeEventListener('mousedown', closeOnPointer);
      window.removeEventListener('keydown', closeOnKey);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [cursor, onClose]);

  useEffect(() => {
    const el = menuRef.current;
    if (!el || !cursor) return;
    const rect = el.getBoundingClientRect();
    const top =
      rect.bottom > window.innerHeight - 8
        ? Math.max(8, window.innerHeight - rect.height - 8)
        : cursor.y;
    const left =
      rect.right > window.innerWidth - 8
        ? Math.max(8, window.innerWidth - rect.width - 8)
        : cursor.x;
    el.style.top = `${top}px`;
    el.style.left = `${left}px`;
  }, [cursor]);

  if (!cursor) return null;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      className="fixed z-50 min-w-56 rounded-md border bg-white p-1 text-zinc-900 shadow-md"
      style={{ top: cursor.y, left: cursor.x }}
      onMouseDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button
        type="button"
        role="menuitem"
        className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={cursor.row.status !== 'delivered'}
        onClick={() => {
          onBill(cursor.row.id);
          onClose();
        }}
      >
        Gerar financeiro
      </button>
    </div>,
    document.body,
  );
}
