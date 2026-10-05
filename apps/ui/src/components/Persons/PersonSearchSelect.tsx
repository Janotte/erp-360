import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Search, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { type Person, personsService } from '@/services/persons';

type PersonType = 'cliente' | 'fornecedor' | 'instituicao' | 'colaborador';

interface PersonSearchSelectProps {
  value: string;
  onChange: (id: string) => void;
  type: PersonType | PersonType[];
  placeholder?: string;
  allowClear?: boolean;
  required?: boolean;
  disabled?: boolean;
}

export function PersonSearchSelect({
  value,
  onChange,
  type,
  placeholder = 'Buscar por nome ou documento...',
  allowClear = false,
  required = false,
  disabled = false,
}: PersonSearchSelectProps) {
  const types = Array.isArray(type) ? type : [type];
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [selectedLabel, setSelectedLabel] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchText.trim()), 400);
    return () => clearTimeout(timer);
  }, [searchText]);

  useEffect(() => {
    if (!value) {
      setSelectedLabel('');
      return;
    }
    let cancelled = false;
    personsService
      .get(value)
      .then((person) => {
        if (!cancelled) setSelectedLabel(person.name);
      })
      .catch(() => {
        if (!cancelled) setSelectedLabel('');
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
          {isFetching ? (
            <p className="px-3 py-2 text-sm text-zinc-500">Buscando...</p>
          ) : results.length ? (
            results.map((person) => (
              <button
                key={person.id}
                type="button"
                role="option"
                aria-selected={person.id === value}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-100',
                  person.id === value && 'bg-zinc-50',
                )}
                onClick={() => pick(person)}
              >
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
                      {person.taxId}
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
      )}
    </div>
  );
}
