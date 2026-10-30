import { formatTaxId, parsePersonKind } from '@erp-360/shared';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronRight, ChevronsUpDown, Search, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { type Person, personsService } from '@/services/persons';

function focusNextSequence(current: HTMLElement) {
  const form = current.closest('form');
  if (!form) return;
  const fields = Array.from(form.querySelectorAll<HTMLElement>('[data-enter-sequence]')).filter(
    (field) => !field.hasAttribute('disabled'),
  );
  const index = fields.findIndex((field) => field === current);
  const next = fields[index + 1];
  if (!next) return;
  requestAnimationFrame(() => next.focus());
}

type PersonType = 'cliente' | 'fornecedor' | 'instituicao' | 'colaborador';

interface PersonSearchSelectProps {
  value: string;
  onChange: (id: string) => void;
  type: PersonType | PersonType[];
  placeholder?: string;
  allowClear?: boolean;
  required?: boolean;
  disabled?: boolean;
  /** Inclui o campo na sequência de Enter do formulário. */
  enterSequence?: boolean;
}

export function PersonSearchSelect({
  value,
  onChange,
  type,
  placeholder = 'Buscar por nome ou documento...',
  allowClear = false,
  required = false,
  disabled = false,
  enterSequence = false,
}: PersonSearchSelectProps) {
  const types = Array.isArray(type) ? type : [type];
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [open, setOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [selectedLabel, setSelectedLabel] = useState('');
  const [labelPending, setLabelPending] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchText.trim()), 400);
    return () => clearTimeout(timer);
  }, [searchText]);

  useEffect(() => {
    setActiveIndex(0);
  }, [search]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!value) {
      setSelectedLabel('');
      setLabelPending(false);
      return;
    }
    setOpen(false);
    setLabelPending(true);
    let cancelled = false;
    personsService
      .get(value)
      .then((person) => {
        if (!cancelled) setSelectedLabel(person.name);
      })
      .catch(() => {
        if (!cancelled) setSelectedLabel('');
      })
      .finally(() => {
        if (!cancelled) setLabelPending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [value]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  const { data: response, isFetching } = useQuery({
    queryKey: ['personSearchSelect', types, search],
    enabled: open && !disabled,
    queryFn: () =>
      personsService.list({
        page: 1,
        limit: 20,
        sortField: 'name',
        sortOrder: 'asc',
        type: types,
        search: search || undefined,
      }),
  });

  const results = response?.data ?? [];
  const highlighted = results.length ? Math.min(Math.max(activeIndex, 0), results.length - 1) : -1;

  useEffect(() => {
    if (!open || highlighted < 0) return;
    optionRefs.current[highlighted]?.scrollIntoView({ block: 'nearest' });
  }, [highlighted, open]);

  const pick = (person: Person) => {
    onChange(person.id);
    setSelectedLabel(person.name);
    setSearchText('');
    setSearch('');
    setOpen(false);
  };

  const clear = () => {
    onChange('');
    setSelectedLabel('');
    setSearchText('');
    setSearch('');
  };

  const moveActive = (delta: number) => {
    if (!results.length) return;
    setActiveIndex((current) => {
      const base = Math.min(Math.max(current, 0), results.length - 1);
      const next = base + delta;
      if (next < 0) return results.length - 1;
      if (next >= results.length) return 0;
      return next;
    });
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
      setOpen(false);
      return;
    }
    if (event.key !== 'Enter') return;
    const person = results[highlighted >= 0 ? highlighted : 0];
    if (!open || !person) return;
    event.preventDefault();
    event.stopPropagation();
    const current = event.currentTarget;
    pick(person);
    if (enterSequence) focusNextSequence(current);
  };

  const onSelectedKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setSearchText('');
      setSearch('');
      setOpen(true);
      return;
    }
    if (event.key !== 'Enter' || !enterSequence) return;
    event.preventDefault();
    event.stopPropagation();
    focusNextSequence(event.currentTarget);
  };

  if (disabled) {
    return (
      <div className="flex h-9 items-center rounded-md border border-input bg-zinc-50 px-3 text-sm text-zinc-700">
        <span className="truncate">
          {selectedLabel || (labelPending ? 'Carregando...' : placeholder)}
        </span>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      {value && !open ? (
        <div className="flex h-9 items-center gap-1 rounded-md border border-input bg-transparent px-2 shadow-sm">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 px-1 text-left text-sm"
            data-enter-sequence={enterSequence ? '' : undefined}
            onClick={() => {
              setSearchText('');
              setSearch('');
              setOpen(true);
            }}
            onKeyDown={onSelectedKeyDown}
          >
            <span className={cn('truncate', !selectedLabel && 'text-zinc-500')}>
              {selectedLabel || (labelPending ? 'Carregando...' : placeholder)}
            </span>
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
            ref={inputRef}
            value={searchText}
            placeholder={placeholder}
            className="pl-9"
            required={required && !value}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-activedescendant={highlighted >= 0 ? `${listId}-option-${highlighted}` : undefined}
            autoComplete="off"
            data-enter-sequence={enterSequence ? '' : undefined}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setSearchText(e.target.value);
              setOpen(true);
            }}
            onKeyDown={onSearchKeyDown}
          />
        </div>
      )}

      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-zinc-200 bg-white shadow-md">
        <div
          id={listId}
          role="listbox"
          className="max-h-56 overflow-auto py-1"
        >
          {isFetching ? (
            <p className="px-3 py-2 text-sm text-zinc-500">Buscando...</p>
          ) : results.length ? (
            results.map((person, index) => (
              <button
                key={person.id}
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
                  person.id === value && index !== highlighted && 'bg-zinc-50',
                )}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => pick(person)}
              >
                <ChevronRight
                  className={cn(
                    'h-4 w-4 shrink-0',
                    index === highlighted ? 'opacity-100' : 'opacity-0',
                  )}
                />
                <Check
                  className={cn(
                    'h-4 w-4 shrink-0',
                    person.id === value ? 'opacity-100' : 'opacity-0',
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{person.name}</span>
                  {person.taxId ? (
                    <span className="block truncate text-xs text-zinc-500">
                      {formatTaxId(parsePersonKind(person.type), person.taxId)}
                    </span>
                  ) : null}
                </span>
              </button>
            ))
          ) : (
            <p className="px-3 py-2 text-sm text-zinc-500">
              {search
                ? 'Nenhum resultado para a busca.'
                : 'Digite para buscar ou aguarde a lista inicial.'}
            </p>
          )}
        </div>
          <p className="border-t border-zinc-100 px-3 py-1.5 text-xs text-zinc-400">
            ↑ ↓ navega · Enter seleciona
          </p>
        </div>
      )}
    </div>
  );
}
