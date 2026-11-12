import type {
  InboundListFilter,
  InboundListItem,
  InboundListSort,
  InboundStatus,
  RecipientManifestation,
} from '@/services/inbound';

const sorts = new Set<InboundListSort>([
  'inboundOn',
  'issueOn',
  'number',
  'supplier',
  'totalAmount',
  'nature',
  'manifestation',
  'status',
]);

export function filterFromSearch(search: string): InboundListFilter {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const status = params.get('status') ?? '';
  const manifestation = params.get('manifestation') ?? '';
  const sort = params.get('sort') ?? '';
  const dir = params.get('dir') ?? '';
  return {
    search: params.get('q') || undefined,
    issueFrom: params.get('issueFrom') || undefined,
    issueTo: params.get('issueTo') || undefined,
    inboundFrom: params.get('inboundFrom') || undefined,
    inboundTo: params.get('inboundTo') || undefined,
    status: (status || undefined) as InboundStatus | undefined,
    manifestation: (manifestation || undefined) as RecipientManifestation | undefined,
    queue: params.get('queue') === 'to_post' ? 'to_post' : undefined,
    sort: sorts.has(sort as InboundListSort) ? (sort as InboundListSort) : undefined,
    dir: dir === 'asc' || dir === 'desc' ? dir : undefined,
  };
}

export function todayInSaoPaulo() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
    new Date(),
  );
}

export function monthRange(iso: string) {
  const [year, month] = iso.split('-');
  const last = new Date(Number(year), Number(month), 0).getDate();
  return {
    from: `${year}-${month}-01`,
    to: `${year}-${month}-${String(last).padStart(2, '0')}`,
  };
}

export function shortKey(value: string | null) {
  if (!value) return '—';
  return `…${value.slice(-8)}`;
}

export function groupKey(value: string) {
  return value.replace(/(\d{4})(?=\d)/g, '$1 ');
}

export function statusDetail(row: InboundListItem) {
  if (row.status === 'discovered' && row.authorizationStatus === 'cancelled') {
    return 'Cancelada na SEFAZ';
  }
  if (row.status === 'discovered' && row.authorizationStatus === 'denied') {
    return 'Denegada na SEFAZ';
  }
  return row.postBlocker;
}

export const freightLabels: Record<string, string> = {
  '0': '0 - Remetente',
  '1': '1 - Destinatário',
  '2': '2 - Terceiros',
  '3': '3 - Próprio do remetente',
  '4': '4 - Próprio do destinatário',
  '9': '9 - Sem frete',
};

export function labeledToken(text: string, label: string) {
  const match = text.match(new RegExp(`${label}\\s*:\\s*(\\S+)`, 'i'));
  return match?.[1] ?? null;
}
