import {
  formatTaxId,
  type ListPageSize,
  listPageSizes,
  parsePersonKind,
  type PersonKind,
  personKindLabels,
  personKinds,
} from '@erp-360/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ArrowUpDown, Plus } from 'lucide-react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';

import { Button } from '@/components/ui/button';
import { ListPagination } from '@/components/ui/ListPagination';
import {
  ListFilter,
  ListMessage,
  ListPageHeader,
  ListPanel,
  ListSearch,
} from '@/components/ui/ListShell';
import { StatusBadge, StatusListHeader, StatusListRow } from '@/components/ui/StatusList';
import { type StatusTone } from '@/components/ui/statusTone';
import { useDebouncedSearch } from '@/hooks/useDebouncedSearch';
import { type Person, personsService } from '@/services/persons';

const columns =
  'grid grid-cols-[minmax(180px,1.5fr)_minmax(140px,0.8fr)_108px_minmax(180px,1.1fr)_104px_132px]';

const activeTone: StatusTone = {
  background: '#EFF6FF',
  hover: '#DBEAFE',
  border: '#2563EB',
  text: '#1D4ED8',
};

const inactiveTone: StatusTone = {
  background: '#F8FAFC',
  hover: '#F1F5F9',
  border: '#64748B',
  text: '#334155',
};

const profileTones = {
  client: {
    background: '#EFF6FF',
    hover: '#DBEAFE',
    border: '#2563EB',
    text: '#1D4ED8',
  },
  supplier: {
    background: '#FFFBEB',
    hover: '#FEF3C7',
    border: '#D97706',
    text: '#92400E',
  },
  employee: {
    background: '#F5F3FF',
    hover: '#EDE9FE',
    border: '#7C3AED',
    text: '#6D28D9',
  },
  institution: {
    background: '#F0FDFA',
    hover: '#CCFBF1',
    border: '#0D9488',
    text: '#0F766E',
  },
} satisfies Record<string, StatusTone>;

const profiles = ['cliente', 'fornecedor', 'colaborador', 'instituicao'] as const;
type PersonProfile = (typeof profiles)[number];

const profileLabels: Record<PersonProfile, string> = {
  cliente: 'Clientes',
  fornecedor: 'Fornecedores',
  colaborador: 'Colaboradores',
  instituicao: 'Instituições',
};

type SortField = 'name' | 'createdAt';

function readPage(params: URLSearchParams) {
  const page = Number(params.get('page') ?? '1');
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function readSort(params: URLSearchParams): SortField {
  return params.get('sortField') === 'createdAt' ? 'createdAt' : 'name';
}

function readOrder(params: URLSearchParams): 'asc' | 'desc' {
  return params.get('sortOrder') === 'desc' ? 'desc' : 'asc';
}

function readLimit(params: URLSearchParams): ListPageSize {
  const value = Number(params.get('limit'));
  if ((listPageSizes as readonly number[]).includes(value)) return value as ListPageSize;
  return 10;
}

function readKind(params: URLSearchParams): PersonKind | 'all' {
  const value = params.get('tipo');
  return personKinds.includes(value as PersonKind) ? (value as PersonKind) : 'all';
}

function readProfile(params: URLSearchParams): PersonProfile | 'all' {
  const value = params.get('perfil');
  return profiles.includes(value as PersonProfile) ? (value as PersonProfile) : 'all';
}

function formatDate(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('pt-BR');
}

function profileBadges(person: Person) {
  const items: { label: string; tone: StatusTone }[] = [];
  if (person.isClient) items.push({ label: 'Cliente', tone: profileTones.client });
  if (person.isSupplier) items.push({ label: 'Fornecedor', tone: profileTones.supplier });
  if (person.isEmployee)
    items.push({ label: 'Colaborador', tone: profileTones.employee });
  if (person.isFinancialInstitution) {
    items.push({ label: 'Instituição', tone: profileTones.institution });
  }
  return items;
}

export function ListPersons() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const page = readPage(params);
  const limit = readLimit(params);
  const sortField = readSort(params);
  const sortOrder = readOrder(params);
  const search = params.get('busca') ?? '';
  const kind = readKind(params);
  const profile = readProfile(params);
  const from = `/persons${location.search}`;
  const { text: searchText, setText: setSearchText } = useDebouncedSearch(
    (next) => {
      setParams(
        (current) => {
          const updated = new URLSearchParams(current);
          if ((updated.get('busca') ?? '') === next) return current;
          if (next) updated.set('busca', next);
          else updated.delete('busca');
          updated.delete('page');
          return updated;
        },
        { replace: true },
      );
    },
    400,
    search,
  );

  const list = useQuery({
    queryKey: [
      'listaPessoas',
      { page, limit, search, kind, profile, sortField, sortOrder },
    ],
    placeholderData: keepPreviousData,
    queryFn: () =>
      personsService.list({
        page,
        limit,
        sortField,
        sortOrder,
        kind: kind === 'all' ? undefined : kind,
        type: profile === 'all' ? undefined : profile,
        search: search || undefined,
      }),
  });

  const changeSort = (field: SortField) => {
    const next = new URLSearchParams(params);
    const order = sortField === field && sortOrder === 'asc' ? 'desc' : 'asc';
    if (field === 'name') next.delete('sortField');
    else next.set('sortField', field);
    if (order === 'asc') next.delete('sortOrder');
    else next.set('sortOrder', order);
    next.delete('page');
    setParams(next, { replace: true });
  };

  const changeKind = (nextKind: PersonKind | 'all') => {
    const next = new URLSearchParams(params);
    if (nextKind === 'all') next.delete('tipo');
    else next.set('tipo', nextKind);
    next.delete('page');
    setParams(next, { replace: true });
  };

  const changeProfile = (nextProfile: PersonProfile | 'all') => {
    const next = new URLSearchParams(params);
    if (nextProfile === 'all') next.delete('perfil');
    else next.set('perfil', nextProfile);
    next.delete('page');
    setParams(next, { replace: true });
  };

  const setPage = (nextPage: number) => {
    const next = new URLSearchParams(params);
    if (nextPage <= 1) next.delete('page');
    else next.set('page', String(nextPage));
    setParams(next, { replace: true });
  };

  const setLimit = (nextLimit: ListPageSize) => {
    const next = new URLSearchParams(params);
    if (nextLimit === 10) next.delete('limit');
    else next.set('limit', String(nextLimit));
    next.delete('page');
    setParams(next, { replace: true });
  };

  const sortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="h-3.5 w-3.5" />;
    return sortOrder === 'asc' ? (
      <ArrowUp className="h-3.5 w-3.5" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5" />
    );
  };

  const rows = list.data?.data ?? [];
  const meta = list.data?.meta;
  const filtered = Boolean(search || kind !== 'all' || profile !== 'all');

  return (
    <div className="space-y-4">
      <ListPageHeader title="Pessoas" description="Nome, documento, perfil e situação.">
        <Button asChild>
          <Link to="/persons/new" state={{ from }}>
            <Plus className="h-4 w-4" />
            Nova pessoa
          </Link>
        </Button>
      </ListPageHeader>

      <ListPanel
        title="Lista de pessoas"
        description="Clique na linha para abrir. O hover mantém a cor de cada situação."
        toolbar={
          <>
            <ListSearch
              value={searchText}
              onChange={setSearchText}
              placeholder="Buscar por nome ou documento..."
              label="Pesquisar pessoas"
            />
            <ListFilter
              value={kind}
              onValueChange={changeKind}
              label="Filtrar por tipo"
              allLabel="Todos os tipos"
              options={personKinds.map((value) => ({
                value,
                label: personKindLabels[value],
              }))}
            />
            <ListFilter
              value={profile}
              onValueChange={changeProfile}
              label="Filtrar por perfil"
              allLabel="Todos os perfis"
              options={profiles.map((value) => ({
                value,
                label: profileLabels[value],
              }))}
            />
          </>
        }
      >
        <div className="overflow-x-auto">
          <div className="min-w-[980px]">
            <StatusListHeader columns={columns}>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-left"
                onClick={() => changeSort('name')}
              >
                Nome
                {sortIcon('name')}
              </button>
              <span>Documento</span>
              <span>Tipo</span>
              <span>Perfis</span>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-left"
                onClick={() => changeSort('createdAt')}
              >
                Cadastro
                {sortIcon('createdAt')}
              </button>
              <span>Situação</span>
            </StatusListHeader>

            {list.isLoading ? (
              <ListMessage>Carregando as pessoas...</ListMessage>
            ) : list.isError ? (
              <ListMessage tone="error">
                Não foi possível carregar as pessoas.
              </ListMessage>
            ) : rows.length === 0 ? (
              <ListMessage>
                {filtered ? 'Nenhuma pessoa encontrada.' : 'Ainda não há pessoa.'}
              </ListMessage>
            ) : (
              rows.map((person) => {
                const status = person.isActive ? 'Ativa' : 'Inativa';
                const kindLabel = personKindLabels[parsePersonKind(person.type)];
                const document = person.taxId
                  ? formatTaxId(parsePersonKind(person.type), person.taxId)
                  : '—';
                const badges = profileBadges(person);
                return (
                  <StatusListRow
                    key={person.id}
                    columns={columns}
                    tone={person.isActive ? activeTone : inactiveTone}
                    label={`${person.name}, ${document}, ${kindLabel}, ${status}`}
                    onOpen={() => navigate(`/persons/${person.id}`, { state: { from } })}
                  >
                    <span className="min-w-0 truncate font-bold">{person.name}</span>
                    <span className="min-w-0 truncate">{document}</span>
                    <span className="min-w-0 truncate">{kindLabel}</span>
                    <span className="flex min-w-0 flex-wrap gap-1">
                      {badges.length ? (
                        badges.map((badge) => (
                          <StatusBadge
                            key={badge.label}
                            label={badge.label}
                            tone={badge.tone}
                          />
                        ))
                      ) : (
                        <span>—</span>
                      )}
                    </span>
                    <span>{formatDate(person.createdAt)}</span>
                    <span>
                      <StatusBadge label={status} />
                    </span>
                  </StatusListRow>
                );
              })
            )}
          </div>
        </div>
        {meta ? (
          <ListPagination
            page={page}
            limit={limit}
            total={meta.total}
            totalPages={meta.totalPages}
            onPageChange={setPage}
            onLimitChange={setLimit}
          />
        ) : null}
      </ListPanel>
    </div>
  );
}
