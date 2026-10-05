import { Check, ChevronsUpDown, Search, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { CatalogOption } from '@/services/financials';

interface CatalogSearchSelectProps {
  value: string;
  onChange: (id: string) => void;
  options: CatalogOption[];
  placeholder?: string;
  emptyMessage?: string;
  allowClear?: boolean;
  required?: boolean;
  isLoading?: boolean;
  disabled?: boolean;
}

export function CatalogSearchSelect({
  value,
  onChange,
  options,
  placeholder = 'Buscar...',
  emptyMessage = 'Nenhum item encontrado.',
  allowClear = false,
  required = false,
  isLoading = false,
  disabled = false,
}: CatalogSearchSelectProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [selectedLabel, setSelectedLabel] = useState('');

  useEffect(() => {
    if (!value) {
      setSelectedLabel('');
      return;
    }
    const match = options.find((item) => item.id === value);
    if (match) setSelectedLabel(match.label);
  }, [value, options]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  const results = useMemo(() => {
    const term = searchText.trim().toLowerCase();
    if (!term) return options;
    return options.filter((item) => item.label.toLowerCase().includes(term));
  }, [options, searchText]);

  const pick = (item: CatalogOption) => {
    onChange(item.id);
    setSelectedLabel(item.label);
    setSearchText('');
    setOpen(false);
  };

  const clear = () => {
    onChange('');
    setSelectedLabel('');
    setSearchText('');
  };

  if (disabled) {
    return (
      <div className="flex h-9 items-center rounded-md border border-input bg-zinc-50 px-3 text-sm text-zinc-700">
        <span className="truncate">{selectedLabel || placeholder}</span>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      {value && selectedLabel && !open ? (
        <div className="flex h-9 items-center gap-1 rounded-md border border-input bg-transparent px-2 shadow-sm">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 px-1 text-left text-sm"
            onClick={() => setOpen(true)}
          >
            <span className="truncate">{selectedLabel}</span>
            <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
          </button>
          {allowClear && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={clear}
              aria-label="Limpar seleção"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-zinc-400" />
          <Input
            value={searchText}
            placeholder={placeholder}
            className="pl-9"
            required={required && !value}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            autoComplete="off"
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setSearchText(e.target.value);
              setOpen(true);
            }}
          />
        </div>
      )}

      {open && (
        <div
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border border-zinc-200 bg-white py-1 shadow-md"
        >
          {isLoading ? (
            <p className="px-3 py-2 text-sm text-zinc-500">Carregando...</p>
          ) : results.length ? (
            results.map((item) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={item.id === value}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-100',
                  item.id === value && 'bg-zinc-50',
                )}
                onClick={() => pick(item)}
              >
                <Check
                  className={cn(
                    'h-4 w-4 shrink-0',
                    item.id === value ? 'opacity-100' : 'opacity-0',
                  )}
                />
                <span className="truncate font-medium">{item.label}</span>
              </button>
            ))
          ) : (
            <p className="px-3 py-2 text-sm text-zinc-500">
              {searchText.trim() ? 'Nenhum resultado para a busca.' : emptyMessage}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
