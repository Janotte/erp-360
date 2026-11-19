import { type MouseEvent, type ReactNode } from 'react';

import { type StatusTone, statusToneStyle } from '@/components/ui/statusTone';
import { cn } from '@/lib/utils';

export function StatusBadge({
  label,
  pressed,
  tone,
}: {
  label: string;
  pressed?: boolean;
  tone?: StatusTone;
}) {
  return (
    <span
      style={tone ? statusToneStyle(tone) : undefined}
      className={cn(
        'inline-flex max-w-full items-center rounded-[7px] border border-[var(--status-accent)] bg-[var(--status-hover)] px-2 py-[5px] text-xs leading-snug font-bold whitespace-nowrap text-[var(--status-text)]',
        pressed && 'shadow-[inset_0_0_0_1px_var(--status-accent)]',
      )}
    >
      {label}
    </span>
  );
}

export function StatusListHeader({
  columns,
  children,
}: {
  columns: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        columns,
        'items-center gap-3 border-b border-b-[#dfe5ee] border-l-4 border-l-transparent px-3.5 py-3 text-xs font-bold text-[#64748b]',
      )}
    >
      {children}
    </div>
  );
}

export function StatusListRow({
  columns,
  tone,
  label,
  onOpen,
  onContextMenu,
  children,
}: {
  columns: string;
  tone: StatusTone;
  label: string;
  onOpen?: () => void;
  onContextMenu?: (event: MouseEvent<HTMLDivElement>) => void;
  children: ReactNode;
}) {
  return (
    <div
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      aria-label={label}
      className={cn(
        columns,
        'group mt-[5px] items-center gap-3 rounded-[7px] border-l-4 border-l-[var(--status-accent)] bg-[var(--status-bg)] px-3.5 py-3 text-sm text-[#243145] transition-[background-color,box-shadow] duration-150 hover:bg-[var(--status-hover)]',
        onOpen &&
          'cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]',
      )}
      style={statusToneStyle(tone)}
      onClick={onOpen}
      onKeyDown={
        onOpen
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onOpen();
              }
            }
          : undefined
      }
      onContextMenu={onContextMenu}
    >
      {children}
    </div>
  );
}
