import {
  civilDate,
  formatCurrency,
  formatRawDate,
  type ListPageSize,
  listPageSizes,
} from '@erp-360/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';

import { titleRowTone } from '@/components/Financial/titleRowTone';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ListPagination } from '@/components/ui/ListPagination';
import {
  ListFilter,
  ListMessage,
  ListPageHeader,
  ListPanel,
  ListSearch,
} from '@/components/ui/ListShell';
import { StatusListHeader, StatusListRow } from '@/components/ui/StatusList';
import { type StatusTone } from '@/components/ui/statusTone';
import { useDebouncedSearch } from '@/hooks/useDebouncedSearch';
import {
  type CardStatementEntry,
  type CompanyCard,
  companyCardService,
} from '@/services/companyCards';

const cardColumns = 'grid grid-cols-[minmax(0,1fr)_auto]';
const entryColumns = 'grid grid-cols-[104px_minmax(220px,1.6fr)_104px_120px_130px]';

const selectedTone: StatusTone = {
  background: '#EFF6FF',
  hover: '#DBEAFE',
  border: '#2563EB',
  text: '#1D4ED8',
};

const inactiveTone: StatusTone = {
  background: '#F8FAFC',
  hover: '#F1F5F9',
  border: '#64748B',
  text: '#475569',
};

const plainTone: StatusTone = {
  background: '#FFFFFF',
  hover: '#F8FAFC',
  border: '#94A3B8',
  text: '#172337',
};

const statuses = ['pendente', 'atrasado', 'pago', 'cancelado'] as const;
type ChargeStatus = (typeof statuses)[number];

const statusLabels: Record<ChargeStatus, string> = {
  pendente: 'Pendente',
  atrasado: 'Atrasado',
  pago: 'Pago',
  cancelado: 'Cancelado',
};

function readPage(params: URLSearchParams) {
  const page = Number(params.get('page') ?? '1');
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function readLimit(params: URLSearchParams): ListPageSize {
  const value = Number(params.get('limit'));
  if ((listPageSizes as readonly number[]).includes(value)) return value as ListPageSize;
  return 10;
}

function readDate(params: URLSearchParams, key: string) {
  const value = params.get(key) ?? '';
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
}

function readCardId(params: URLSearchParams) {
  const value = params.get('cartao') ?? '';
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

function readStatus(params: URLSearchParams): ChargeStatus | 'all' {
  const value = params.get('situacao');
  return statuses.includes(value as ChargeStatus) ? (value as ChargeStatus) : 'all';
}

function chargeSituation(entry: CardStatementEntry, today = civilDate()): ChargeStatus {
  if (entry.status === 'pago') return 'pago';
  if (entry.status === 'cancelado') return 'cancelado';
  if (entry.dueOn.slice(0, 10) < today) return 'atrasado';
  return 'pendente';
}

function cardTone(card: CompanyCard, selected: boolean): StatusTone {
  if (selected) return selectedTone;
  if (!card.isActive) return inactiveTone;
  return plainTone;
}

function DateFilter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-[13px] text-[#64748b]">
      {label}
      <Input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-[42px] w-[148px] border-[#cbd5e1]"
        aria-label={label}
      />
    </label>
  );
}

export function CompanyCardsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const page = readPage(params);
  const limit = readLimit(params);
  const search = params.get('busca') ?? '';
  const from = readDate(params, 'from');
  const to = readDate(params, 'to');
  const status = readStatus(params);
  const cardId = readCardId(params);
  const listUrl = `/company-cards${location.search}`;
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

  useEffect(() => {
    setSearchText(search);
  }, [search, setSearchText]);

  const cardsQuery = useQuery({
    queryKey: ['company-cards'],
    queryFn: companyCardService.list,
  });

  const cards = useMemo(() => cardsQuery.data ?? [], [cardsQuery.data]);
  const selected = cards.find((card) => card.id === cardId);
  const openTotal = cards.reduce((sum, card) => sum + (card.openBalance ?? 0), 0);

  const statement = useQuery({
    queryKey: ['company-cards', selected?.id, 'statement'],
    queryFn: () => companyCardService.statement(selected!.id),
    enabled: Boolean(selected),
  });

  const entries = useMemo(() => {
    if (!statement.data || statement.data.card.id !== selected?.id) return [];
    return statement.data.entries;
  }, [selected?.id, statement.data]);
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return entries.filter((entry) => {
      const date = entry.occurredOn.slice(0, 10);
      if (from && date < from) return false;
      if (to && date > to) return false;
      if (status !== 'all' && chargeSituation(entry) !== status) return false;
      if (term && !entry.description.toLocaleLowerCase('pt-BR').includes(term))
        return false;
      return true;
    });
  }, [entries, from, search, status, to]);
  const total = filtered.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  const rows = filtered.slice((page - 1) * limit, page * limit);
  const hasFilter = Boolean(search || from || to || status !== 'all');

  const replaceParams = (change: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(params);
    change(next);
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

  const selectCard = (id: string) => {
    replaceParams((updated) => {
      updated.set('cartao', id);
      updated.delete('busca');
      updated.delete('from');
      updated.delete('to');
      updated.delete('situacao');
    });
  };

  return (
    <div className="space-y-4">
      <ListPageHeader
        title="Cartões da empresa"
        description="Cada compra entra no extrato. A cor da linha indica a situação, e o saldo em aberto é o que ainda não foi pago ao emissor."
      >
        <div className="rounded-[10px] border border-[#dfe5ee] bg-white px-4 py-2 text-right">
          <p className="text-xs text-[#64748b]">Em aberto</p>
          <p className="text-lg font-semibold tabular-nums text-[#172337]">
            {formatCurrency(openTotal)}
          </p>
        </div>
        <Button asChild>
          <Link to="/company-cards/new" state={{ from: listUrl }}>
            Novo cartão
          </Link>
        </Button>
      </ListPageHeader>

      <div className="grid items-start gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <ListPanel title="Cartões" description="Clique no cartão para abrir o extrato.">
          {cardsQuery.isLoading ? (
            <ListMessage>Carregando cartões...</ListMessage>
          ) : cardsQuery.isError ? (
            <ListMessage tone="error">Não foi possível carregar os cartões.</ListMessage>
          ) : cards.length === 0 ? (
            <ListMessage>Nenhum cartão cadastrado.</ListMessage>
          ) : (
            cards.map((card) => (
              <StatusListRow
                key={card.id}
                columns={cardColumns}
                tone={cardTone(card, card.id === selected?.id)}
                label={`${card.name}, ${card.issuerName}, ${card.isActive ? 'ativo' : 'inativo'}, em aberto ${formatCurrency(card.openBalance ?? 0)}`}
                onOpen={() => selectCard(card.id)}
              >
                <span className="min-w-0">
                  <span className="block truncate font-bold text-[var(--status-text)]">
                    {card.name}
                  </span>
                  <span className="block truncate text-xs text-[var(--status-text)]">
                    {card.issuerName}
                  </span>
                </span>
                <span className="text-right text-sm tabular-nums text-[var(--status-text)]">
                  {formatCurrency(card.openBalance ?? 0)}
                </span>
              </StatusListRow>
            ))
          )}
        </ListPanel>

        <ListPanel
          title="Extrato"
          description={
            selected
              ? `${selected.issuerName} · Fecha dia ${selected.closingDay} · Vence dia ${selected.dueDay}${selected.isActive ? '' : ' · Inativo'}. Em aberto ${formatCurrency(statement.data?.openBalance ?? selected.openBalance ?? 0)}.`
              : 'Selecione um cartão para ver o extrato.'
          }
          toolbar={
            selected ? (
              <>
                <Button variant="outline" asChild>
                  <Link to={`/company-cards/${selected.id}`} state={{ from: listUrl }}>
                    Editar
                  </Link>
                </Button>
                <ListSearch
                  value={searchText}
                  onChange={setSearchText}
                  placeholder="Buscar pelo histórico..."
                  label="Pesquisar o extrato"
                />
                <ListFilter
                  value={status}
                  onValueChange={(next) =>
                    replaceParams((updated) => {
                      if (next === 'all') updated.delete('situacao');
                      else updated.set('situacao', next);
                    })
                  }
                  label="Filtrar por situação"
                  allLabel="Todas as situações"
                  options={statuses.map((value) => ({
                    value,
                    label: statusLabels[value],
                  }))}
                />
                <DateFilter
                  label="De"
                  value={from}
                  onChange={(value) =>
                    replaceParams((updated) => {
                      if (value) updated.set('from', value);
                      else updated.delete('from');
                    })
                  }
                />
                <DateFilter
                  label="Até"
                  value={to}
                  onChange={(value) =>
                    replaceParams((updated) => {
                      if (value) updated.set('to', value);
                      else updated.delete('to');
                    })
                  }
                />
              </>
            ) : null
          }
        >
          {!selected ? (
            <ListMessage>Selecione um cartão para ver o extrato.</ListMessage>
          ) : statement.isLoading ? (
            <ListMessage>Carregando o extrato...</ListMessage>
          ) : statement.isError ? (
            <ListMessage tone="error">Não foi possível carregar o extrato.</ListMessage>
          ) : (
            <>
              <div className="overflow-x-auto">
                <div className="min-w-[760px]">
                  <StatusListHeader columns={entryColumns}>
                    <span>Data</span>
                    <span>Histórico</span>
                    <span>Vencimento</span>
                    <span className="text-right">Valor</span>
                    <span className="text-right">Saldo</span>
                  </StatusListHeader>
                  {rows.length === 0 ? (
                    <ListMessage>
                      {hasFilter
                        ? 'Nenhuma compra encontrada.'
                        : 'Nenhuma compra neste cartão.'}
                    </ListMessage>
                  ) : (
                    rows.map((entry) => (
                      <StatusListRow
                        key={entry.id}
                        columns={entryColumns}
                        tone={titleRowTone(entry.status, entry.dueOn)}
                        label={`${formatRawDate(entry.occurredOn)}, ${entry.description}, ${statusLabels[chargeSituation(entry)].toLocaleLowerCase('pt-BR')}`}
                        onOpen={
                          entry.documentId
                            ? () => navigate(`/inbound/${entry.documentId}`)
                            : undefined
                        }
                      >
                        <span className="text-[var(--status-text)]">
                          {formatRawDate(entry.occurredOn)}
                        </span>
                        <span className="min-w-0 truncate font-bold text-[var(--status-text)]">
                          {entry.description}
                        </span>
                        <span className="text-[var(--status-text)]">
                          {formatRawDate(entry.dueOn)}
                        </span>
                        <span className="text-right tabular-nums text-[var(--status-text)]">
                          {formatCurrency(entry.amount)}
                        </span>
                        <span className="text-right font-semibold tabular-nums text-[var(--status-text)]">
                          {formatCurrency(entry.balance)}
                        </span>
                      </StatusListRow>
                    ))
                  )}
                </div>
              </div>
              <ListPagination
                page={page}
                limit={limit}
                total={total}
                totalPages={totalPages}
                onPageChange={setPage}
                onLimitChange={setLimit}
              />
            </>
          )}
        </ListPanel>
      </div>
    </div>
  );
}
