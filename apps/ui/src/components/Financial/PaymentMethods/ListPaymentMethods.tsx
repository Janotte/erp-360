import {
  type ListPageSize,
  listPageSizes,
  paymentReceiptKindLabels,
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
import { StatusListHeader, StatusListRow } from '@/components/ui/StatusList';
import { type StatusTone } from '@/components/ui/statusTone';
import { useDebouncedSearch } from '@/hooks/useDebouncedSearch';
import { financialService } from '@/services/financials';
import {
  type PaymentMethod,
  type PaymentMethodChannel,
  type PaymentMethodSortField,
  paymentMethodsService,
} from '@/services/paymentMethods';

const columns =
  'grid grid-cols-[72px_110px_minmax(160px,1.3fr)_minmax(140px,1fr)_minmax(150px,1fr)_120px_minmax(150px,1.1fr)]';

const channels = ['quote', 'sale', 'pos', 'serviceOrder'] as const;

const channelLabels: Record<PaymentMethodChannel, string> = {
  quote: 'Orçamento',
  sale: 'Venda',
  pos: 'PDV',
  serviceOrder: 'Ordem de serviço',
};

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
  text: '#475569',
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

function readSort(params: URLSearchParams): PaymentMethodSortField {
  const value = params.get('sortField');
  if (value === 'code' || value === 'name') return value;
  return 'sortOrder';
}

function readOrder(params: URLSearchParams): 'asc' | 'desc' {
  return params.get('sortOrder') === 'desc' ? 'desc' : 'asc';
}

function readSituation(params: URLSearchParams): 'all' | 'ativa' | 'inativa' {
  const value = params.get('situacao');
  if (value === 'ativa' || value === 'inativa') return value;
  return 'all';
}

function readChannel(params: URLSearchParams): PaymentMethodChannel | 'all' {
  const value = params.get('canal');
  if (
    value === 'quote' ||
    value === 'sale' ||
    value === 'pos' ||
    value === 'serviceOrder'
  ) {
    return value;
  }
  return 'all';
}

function channelsOf(method: PaymentMethod) {
  const labels = [
    method.useInQuote ? channelLabels.quote : null,
    method.useInSale ? channelLabels.sale : null,
    method.useInPos ? channelLabels.pos : null,
    method.useInServiceOrder ? channelLabels.serviceOrder : null,
  ].filter((label): label is string => Boolean(label));
  return labels.join(', ');
}

function termsOf(method: PaymentMethod) {
  return method.terms.map((term) => `${term.installmentCount}x`).join(', ');
}

export function ListPaymentMethods() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const page = readPage(params);
  const limit = readLimit(params);
  const sortField = readSort(params);
  const sortOrder = readOrder(params);
  const situation = readSituation(params);
  const channel = readChannel(params);
  const search = params.get('busca') ?? '';
  const from = `/payment-methods${location.search}`;
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
      'payment-methods',
      { page, limit, search, sortField, sortOrder, situation, channel },
    ],
    placeholderData: keepPreviousData,
    queryFn: () =>
      paymentMethodsService.list({
        page,
        limit,
        sortField,
        sortOrder,
        search: search || undefined,
        isActive: situation === 'all' ? undefined : situation === 'ativa',
        channel: channel === 'all' ? undefined : channel,
      }),
  });

  const means = useQuery({
    queryKey: ['financial', 'means-of-payment'],
    queryFn: () => financialService.listMeansOfPayment(),
  });

  const replaceParams = (change: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(params);
    change(next);
    next.delete('page');
    setParams(next, { replace: true });
  };

  const changeSort = (field: PaymentMethodSortField) => {
    const order = sortField === field && sortOrder === 'asc' ? 'desc' : 'asc';
    replaceParams((next) => {
      if (field === 'sortOrder') next.delete('sortField');
      else next.set('sortField', field);
      if (order === 'asc') next.delete('sortOrder');
      else next.set('sortOrder', order);
    });
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

  const sortIcon = (field: PaymentMethodSortField) => {
    if (sortField !== field) return <ArrowUpDown className="h-3.5 w-3.5" />;
    return sortOrder === 'asc' ? (
      <ArrowUp className="h-3.5 w-3.5" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5" />
    );
  };

  const rows = list.data?.data ?? [];
  const meta = list.data?.meta;
  const meanLabel = (id: string) =>
    means.data?.find((item) => item.id === id)?.label ?? '—';
  const filtered = Boolean(search) || situation !== 'all' || channel !== 'all';

  return (
    <div className="space-y-4">
      <ListPageHeader
        title="Formas de pagamento"
        description="Código, meio e condições. A cor da linha indica a situação."
      >
        <Button asChild>
          <Link to="/payment-methods/new" state={{ from }}>
            <Plus className="h-4 w-4" />
            Nova forma
          </Link>
        </Button>
      </ListPageHeader>

      <ListPanel
        title="Formas"
        description="Clique na linha para abrir."
        toolbar={
          <>
            <ListSearch
              value={searchText}
              onChange={setSearchText}
              placeholder="Buscar por código ou nome..."
              label="Pesquisar formas de pagamento"
            />
            <ListFilter
              value={situation}
              onValueChange={(value) =>
                replaceParams((next) => {
                  if (value === 'all') next.delete('situacao');
                  else next.set('situacao', value);
                })
              }
              label="Filtrar por situação"
              allLabel="Todas as situações"
              options={[
                { value: 'ativa', label: 'Ativas' },
                { value: 'inativa', label: 'Inativas' },
              ]}
            />
            <ListFilter
              value={channel}
              onValueChange={(value) =>
                replaceParams((next) => {
                  if (value === 'all') next.delete('canal');
                  else next.set('canal', value);
                })
              }
              label="Filtrar por canal"
              allLabel="Todos os canais"
              options={channels.map((value) => ({
                value,
                label: channelLabels[value],
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
                onClick={() => changeSort('sortOrder')}
              >
                Ordem
                {sortIcon('sortOrder')}
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-left"
                onClick={() => changeSort('code')}
              >
                Código
                {sortIcon('code')}
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-left"
                onClick={() => changeSort('name')}
              >
                Nome
                {sortIcon('name')}
              </button>
              <span>Meio</span>
              <span>Recebimento</span>
              <span>Condições</span>
              <span>Uso</span>
            </StatusListHeader>

            {list.isLoading ? (
              <ListMessage>Carregando as formas de pagamento...</ListMessage>
            ) : list.isError ? (
              <ListMessage tone="error">
                Não foi possível carregar as formas de pagamento.
              </ListMessage>
            ) : rows.length === 0 ? (
              <ListMessage>
                {filtered
                  ? 'Nenhuma forma de pagamento encontrada.'
                  : 'Ainda não há forma de pagamento.'}
              </ListMessage>
            ) : (
              rows.map((method) => (
                <StatusListRow
                  key={method.id}
                  columns={columns}
                  tone={method.isActive ? activeTone : inactiveTone}
                  label={`${method.code}, ${method.name}, ${method.isActive ? 'ativa' : 'inativa'}`}
                  onOpen={() =>
                    navigate(`/payment-methods/${method.id}`, { state: { from } })
                  }
                >
                  <span className="min-w-0 truncate text-[var(--status-text)]">
                    {method.sortOrder}
                  </span>
                  <span className="min-w-0 truncate font-bold text-[var(--status-text)]">
                    {method.code}
                  </span>
                  <span className="min-w-0 truncate text-[var(--status-text)]">
                    {method.name}
                  </span>
                  <span className="min-w-0 truncate text-[var(--status-text)]">
                    {meanLabel(method.meansOfPaymentId)}
                  </span>
                  <span className="min-w-0 truncate text-[var(--status-text)]">
                    {paymentReceiptKindLabels[method.receiptKind]}
                  </span>
                  <span className="min-w-0 truncate text-[var(--status-text)]">
                    {termsOf(method) || '—'}
                  </span>
                  <span className="min-w-0 truncate text-[var(--status-text)]">
                    {channelsOf(method) || '—'}
                  </span>
                </StatusListRow>
              ))
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
