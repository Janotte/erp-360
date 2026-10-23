import { civilDate, formatCurrency, formatRawDate } from '@erp-360/shared';

import { emitterService } from '@/services/emitter';
import {
  type FinancialAccount,
  financialService,
  type TitleSortField,
} from '@/services/financials';

export interface TitleReportRequest {
  kind: 'payable' | 'receivable';
  status: string;
  search?: string;
  dueFrom?: string;
  dueTo?: string;
  issueFrom?: string;
  issueTo?: string;
  sortField: TitleSortField;
  sortOrder: 'asc' | 'desc';
}

const pageSize = 100;

const statusLabels: Record<string, string> = {
  todos: 'Todos os status',
  pendente: 'Pendente',
  atrasado: 'Atrasado',
  pago: 'Pago',
  recebido: 'Recebido',
  cancelado: 'Cancelado',
};

const sortLabels: Record<TitleSortField, string> = {
  documentNumber: 'documento',
  personName: 'pessoa',
  description: 'descrição',
  issueOn: 'emissão',
  dueOn: 'vencimento',
  installmentAmount: 'valor',
};

const situationOrder = ['Atrasado', 'Pendente', 'Pago', 'Recebido', 'Cancelado'];

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function situation(account: FinancialAccount, today: string): string {
  if (account.status === 'pago') return 'Pago';
  if (account.status === 'recebido') return 'Recebido';
  if (account.status === 'cancelado') return 'Cancelado';
  if (account.dueOn.slice(0, 10) < today) return 'Atrasado';
  return 'Pendente';
}

function situationColor(label: string): string {
  if (label === 'Pago' || label === 'Recebido') return '#059669';
  if (label === 'Atrasado') return '#dc2626';
  return '#18181b';
}

function periodLabel(from?: string, to?: string): string | null {
  if (from && to) return `${formatRawDate(from)} a ${formatRawDate(to)}`;
  if (from) return `a partir de ${formatRawDate(from)}`;
  if (to) return `até ${formatRawDate(to)}`;
  return null;
}

function filterLines(request: TitleReportRequest): string[] {
  const lines = [`Status: ${statusLabels[request.status] ?? request.status}`];
  if (request.search) lines.push(`Busca: ${request.search}`);
  const due = periodLabel(request.dueFrom, request.dueTo);
  if (due) lines.push(`Vencimento: ${due}`);
  const issue = periodLabel(request.issueFrom, request.issueTo);
  if (issue) lines.push(`Emissão: ${issue}`);
  const direction = request.sortOrder === 'asc' ? 'crescente' : 'decrescente';
  lines.push(`Ordem: ${sortLabels[request.sortField]} ${direction}`);
  return lines;
}

async function loadTitles(request: TitleReportRequest): Promise<FinancialAccount[]> {
  const filters = {
    limit: pageSize,
    sortField: request.sortField,
    sortOrder: request.sortOrder,
    status: request.status === 'todos' ? undefined : request.status,
    search: request.search,
    dueFrom: request.dueFrom,
    dueTo: request.dueTo,
    issueFrom: request.issueFrom,
    issueTo: request.issueTo,
  };
  const first = await financialService.list(request.kind, { ...filters, page: 1 });
  const rows = [...first.data];
  for (let page = 2; page <= first.meta.totalPages; page += 1) {
    const next = await financialService.list(request.kind, { ...filters, page });
    rows.push(...next.data);
  }
  return rows;
}

function renderReport(input: {
  title: string;
  personHeader: string;
  company: string | null;
  filters: string[];
  rows: FinancialAccount[];
  issuedAt: string;
}): string {
  const today = civilDate();
  const groups = new Map<string, { count: number; amount: number }>();
  let total = 0;
  const body = input.rows
    .map((row) => {
      const label = situation(row, today);
      const group = groups.get(label) ?? { count: 0, amount: 0 };
      group.count += 1;
      group.amount += row.installmentAmount;
      groups.set(label, group);
      total += row.installmentAmount;
      const color = situationColor(label);
      return `<tr style="color:${color}">
        <td>${escapeHtml(row.documentNumber || '-')}</td>
        <td>${escapeHtml(row.personName || '-')}</td>
        <td>${escapeHtml(row.description)}</td>
        <td>${escapeHtml(formatRawDate(row.issueOn))}</td>
        <td>${escapeHtml(formatRawDate(row.dueOn))}</td>
        <td>${escapeHtml(label)}</td>
        <td class="num">${escapeHtml(formatCurrency(row.installmentAmount))}</td>
      </tr>`;
    })
    .join('');

  const breakdown = situationOrder
    .flatMap((label) => {
      const group = groups.get(label);
      if (!group) return [];
      const titles = group.count === 1 ? 'título' : 'títulos';
      return [
        `<tr>
        <td colspan="6">${escapeHtml(label)} — ${group.count} ${titles}</td>
        <td class="num">${escapeHtml(formatCurrency(group.amount))}</td>
      </tr>`,
      ];
    })
    .join('');

  const countLabel = `${input.rows.length} ${input.rows.length === 1 ? 'título' : 'títulos'}`;
  const company = input.company
    ? `<p class="company">${escapeHtml(input.company)}</p>`
    : '';
  const filters = input.filters.map((line) => `<li>${escapeHtml(line)}</li>`).join('');
  const empty = input.rows.length
    ? ''
    : '<tr><td colspan="7" class="empty">Nenhum título para os filtros informados.</td></tr>';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(input.title)}</title>
  <style>
    body { margin: 24px; color: #18181b; font: 13px/1.4 Arial, sans-serif; }
    h1 { margin: 0 0 4px; font-size: 20px; }
    .company, .issued { margin: 0; color: #52525b; }
    ul { margin: 12px 0; padding-left: 18px; color: #3f3f46; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 6px 8px; border-bottom: 1px solid #e4e4e7; text-align: left; vertical-align: top; }
    th { font-size: 12px; color: #3f3f46; }
    .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    tfoot td { font-weight: 700; border-bottom: none; }
    .grand td { border-top: 2px solid #18181b; }
    .empty { text-align: center; color: #71717a; padding: 24px; }
    .toolbar { margin-bottom: 16px; }
    button { font: inherit; padding: 6px 12px; }
    @media print {
      body { margin: 0; }
      .toolbar { display: none; }
      tr { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="toolbar"><button onclick="window.print()">Imprimir</button></div>
  <h1>${escapeHtml(input.title)}</h1>
  ${company}
  <p class="issued">Emitido em ${escapeHtml(input.issuedAt)}</p>
  <ul>${filters}</ul>
  <table>
    <thead>
      <tr>
        <th>Documento</th>
        <th>${escapeHtml(input.personHeader)}</th>
        <th>Descrição</th>
        <th>Emissão</th>
        <th>Vencimento</th>
        <th>Situação</th>
        <th class="num">Valor</th>
      </tr>
    </thead>
    <tbody>${body}${empty}</tbody>
    <tfoot>
      ${input.rows.length > 0 && groups.size > 1 ? breakdown : ''}
      <tr class="grand">
        <td colspan="6">Total — ${countLabel}</td>
        <td class="num">${escapeHtml(formatCurrency(total))}</td>
      </tr>
    </tfoot>
  </table>
</body>
</html>`;
}

export async function openTitleReport(request: TitleReportRequest): Promise<void> {
  const popup = window.open('', '_blank');
  if (!popup) {
    throw new Error('O navegador bloqueou a janela do relatório.');
  }
  popup.document.write(
    '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><p>Gerando relatório...</p></body></html>',
  );
  popup.document.close();

  try {
    const [rows, emitter] = await Promise.all([
      loadTitles(request),
      emitterService.get().catch(() => null),
    ]);
    const issuedAt = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date());
    const html = renderReport({
      title: request.kind === 'payable' ? 'Contas a pagar' : 'Contas a receber',
      personHeader: request.kind === 'payable' ? 'Credor' : 'Devedor',
      company: emitter ? emitter.tradeName || emitter.name : null,
      filters: filterLines(request),
      rows,
      issuedAt,
    });
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
    popup.focus();
  } catch (error) {
    popup.close();
    throw error;
  }
}
