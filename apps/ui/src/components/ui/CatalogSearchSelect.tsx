import { Check, ChevronsUpDown, Search, X } from 'lucide-react';
import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { CatalogOption } from '@/services/financials';

function fold(value: string) {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR');
}

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
  id?: string;
  enterSequence?: boolean;
  /** Quando informado, a busca vai para quem chamou em vez de filtrar as opções locais. */
  onSearch?: (term: string) => void;
  /** Rótulo fixo sobre a borda, no mesmo desenho dos campos flutuantes. */
  label?: string;
  className?: string;
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
  id,
  enterSequence = false,
  onSearch,
  label,
  className,
}: CatalogSearchSelectProps) {
  const listId = useId();
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [open, setOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [selectedLabel, setSelectedLabel] = useState('');
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const framed = Boolean(label);
  const controlHeight = framed ? 'h-11' : 'h-9';

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

  const onSearchRef = useRef(onSearch);
  onSearchRef.current = onSearch;

  useEffect(() => {
    if (!onSearch) return;
    const timer = setTimeout(() => onSearchRef.current?.(searchText.trim()), 400);
    return () => clearTimeout(timer);
  }, [onSearch, searchText]);

  const results = useMemo(() => {
    if (onSearch) return options;
    const term = fold(searchText.trim());
    if (!term) return options;
    return options.filter((item) => fold(item.label).includes(term));
  }, [onSearch, options, searchText]);
  const highlighted =
    activeIndex >= 0 && results.length ? Math.min(activeIndex, results.length - 1) : -1;

  useEffect(() => {
    setActiveIndex(-1);
  }, [searchText]);

  useEffect(() => {
    if (!open || highlighted < 0) return;
    optionRefs.current[highlighted]?.scrollIntoView({ block: 'nearest' });
  }, [highlighted, open]);

  useEffect(() => {
    if (open && !disabled) inputRef.current?.focus();
  }, [open, disabled]);

  const moveActive = (delta: number) => {
    if (!results.length) return;
    setActiveIndex((current) => {
      if (current < 0) return delta > 0 ? 0 : results.length - 1;
      const next = current + delta;
      if (next < 0) return results.length - 1;
      if (next >= results.length) return 0;
      return next;
    });
  };

  const pick = (item: CatalogOption) => {
    onChange(item.id);
    setSelectedLabel(item.label);
    setSearchText('');
    setOpen(false);
  };

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      moveActive(1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      moveActive(-1);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      return;
    }
    if (event.key !== 'Enter') return;
    const match = highlighted >= 0 ? results[highlighted] : results[0];
    if (!open || !searchText.trim() || !match) return;
    event.preventDefault();
    pick(match);
  };

  const clear = () => {
    onChange('');
    setSelectedLabel('');
    setSearchText('');
  };

  if (disabled && !framed) {
    return (
      <div className="flex h-9 items-center rounded-md border border-input bg-zinc-50 px-3 text-sm text-zinc-700">
        <span className="truncate">{selectedLabel || placeholder}</span>
      </div>
    );
  }

  const control = disabled ? (
    <div id={fieldId} className="flex h-11 items-center px-3 text-sm text-zinc-800">
      <span className="truncate">{selectedLabel || placeholder}</span>
    </div>
  ) : value && selectedLabel && !open ? (
    <div
      className={cn(
        'flex items-center gap-1 bg-transparent px-2',
        controlHeight,
        framed ? undefined : 'rounded-md border border-input shadow-sm',
      )}
    >
      <button
        type="button"
        id={fieldId}
        {...(enterSequence ? { 'data-enter-sequence': '' } : {})}
        className="flex min-w-0 flex-1 items-center gap-2 px-1 text-left text-sm"
        onClick={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
          event.preventDefault();
          setSearchText('');
          setOpen(true);
        }}
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
      <Search
        className={cn(
          'pointer-events-none absolute left-2.5 h-4 w-4 text-zinc-400',
          framed ? 'top-1/2 -translate-y-1/2' : 'top-2.5',
        )}
      />
      <Input
        ref={inputRef}
        id={fieldId}
        {...(enterSequence ? { 'data-enter-sequence': '' } : {})}
        value={searchText}
        placeholder={placeholder}
        className={cn('pl-9', framed && 'h-11 border-0 shadow-none focus-visible:ring-0')}
        required={required && !value}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={
          highlighted >= 0 ? `${listId}-option-${highlighted}` : undefined
        }
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 150);
        }}
        onChange={(e) => {
          setSearchText(e.target.value);
          setOpen(true);
        }}
        onKeyDown={onSearchKeyDown}
      />
    </div>
  );

  return (
    <div
      ref={rootRef}
      className={cn('relative', className)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
    >
      {framed ? (
        <div
          className={cn(
            'relative rounded-md border bg-transparent transition-colors',
            focused ? 'border-primary' : 'border-input',
            disabled && 'border-zinc-300',
          )}
        >
          {control}
          <label
            htmlFor={fieldId}
            className={cn(
              'absolute top-0 left-2.5 z-10 max-w-[calc(100%-1.25rem)] -translate-y-1/2 truncate bg-white px-1 text-xs leading-none font-medium',
              focused
                ? 'text-primary'
                : disabled
                  ? 'text-zinc-700'
                  : 'text-muted-foreground',
            )}
          >
            {label}
          </label>
        </div>
      ) : (
        control
      )}

      {open && !disabled ? (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-zinc-200 bg-white shadow-md">
          <div id={listId} role="listbox" className="max-h-56 overflow-auto py-1">
            {isLoading ? (
              <p className="px-3 py-2 text-sm text-zinc-500">Carregando...</p>
            ) : results.length ? (
              results.map((item, index) => (
                <button
                  key={item.id}
                  id={`${listId}-option-${index}`}
                  ref={(node) => {
                    optionRefs.current[index] = node;
                  }}
                  type="button"
                  role="option"
                  aria-selected={index === highlighted}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-100',
                    index === highlighted && 'bg-zinc-100',
                    item.id === value && index !== highlighted && 'bg-zinc-50',
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
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
          {results.length ? (
            <div className="border-t border-zinc-100 px-3 py-1.5">
              <p className="text-xs text-zinc-400">↑ ↓ navega · Enter seleciona</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
