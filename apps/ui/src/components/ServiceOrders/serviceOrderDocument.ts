import { formatCurrency } from '@erp-360/shared';

export type ServiceOrderPrint = {
  number: string;
  logoUrl: string | null;
  logoText: string;
  tenant: {
    tradeName: string;
    name: string;
    cnpj: string;
    stateRegistration: string | null;
    addressLine: string;
    cityLine: string;
    phone: string | null;
    mobilePhone: string | null;
    whatsapp: string | null;
    email: string | null;
  };
  openedByName: string;
  openedAt: string;
  promisedAt: string;
  attendanceLabel: string;
  locationLabel: string;
  statusLabel: string;
  originNumber: string | null;
  customer: {
    taxId: string | null;
    name: string;
    phone: string | null;
    mobilePhone: string | null;
    whatsapp: string | null;
    email: string | null;
    streetLine: string | null;
    neighborhood: string | null;
    cityLine: string | null;
  };
  sectionTitle: string;
  fields: { slot: string; label: string; value: string; width: number }[];
  productsTitle: string;
  servicesTitle: string;
  products: {
    code: string;
    description: string;
    quantity: string;
    unitPrice: number;
    lineAmount: number;
  }[];
  services: {
    description: string;
    technicianName: string | null;
    quantity: string;
    unitPrice: number;
    lineAmount: number;
  }[];
  totals: {
    productsAmount: number;
    servicesAmount: number;
    freightAmount: number;
    adjustmentAmount: number;
    totalAmount: number;
  };
  payment: {
    methodDescription: string | null;
    meansDescription: string | null;
    installmentsLabel: string | null;
  };
  payments?: { methodName: string; dueOn: string; amount: number }[];
  notes: { body: string }[];
  technicianSignatureLabel: string;
  customerSignatureLabel: string;
};

function escapeHtml(value: string | null | undefined) {
  return (value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function money(cents: number) {
  return escapeHtml(formatCurrency(cents));
}

function formatDue(iso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : iso;
}

function paymentSection(model: ServiceOrderPrint) {
  const rows = model.payments ?? [];
  if (rows.length === 0) {
    return `<div class="grid-row">
${field('Meio de Pagamento', model.payment.methodDescription, 8)}
${field('Condição', model.payment.installmentsLabel, 4)}
</div>`;
  }
  const body = rows
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.methodName)}</td><td class="text-center">${escapeHtml(formatDue(row.dueOn))}</td><td class="text-right">${money(row.amount)}</td></tr>`,
    )
    .join('');
  return `<table>
<thead><tr><th>Forma</th><th class="text-center">Vencimento</th><th class="text-right">Valor</th></tr></thead>
<tbody>${body}</tbody>
</table>`;
}

function field(label: string, value: string | null | undefined, span: number) {
  return `<div class="field-group" style="grid-column: span ${span}"><label>${escapeHtml(label)}</label><div class="field-value">${escapeHtml(value)}</div></div>`;
}

function optionalField(label: string, value: string | null | undefined, span: number) {
  if (!value?.trim()) return '';
  return field(label, value, span);
}

function marked(label: string, value: string, span: number) {
  return `<div class="field-group" style="grid-column: span ${span}"><label>${escapeHtml(label)}</label><div class="field-value" style="font-weight: bold; color: #b45309">${value}</div></div>`;
}

function rowsByWidth<T extends { width: number }>(items: T[]) {
  const rows: T[][] = [];
  let row: T[] = [];
  let used = 0;
  for (const item of items) {
    if (row.length > 0 && used + item.width > 12) {
      rows.push(row);
      row = [];
      used = 0;
    }
    row.push(item);
    used += item.width;
  }
  if (row.length > 0) rows.push(row);
  return rows;
}

function cells(values: string[], align: string[]) {
  return `<tr>${values
    .map((value, index) => `<td class="${align[index] ?? ''}">${value}</td>`)
    .join('')}</tr>`;
}

function emptyRow(columns: number) {
  return `<tr class="empty-row">${'<td>&nbsp;</td>'.repeat(columns)}</tr>`;
}

const contactIcons = {
  phone:
    '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.35 1.9.68 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.33 1.85.55 2.81.68A2 2 0 0 1 22 16.92z"/>',
  mobile:
    '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  whatsapp:
    '<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z"/>',
  email: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
} as const;

function contactItem(kind: keyof typeof contactIcons, value: string | null | undefined) {
  const text = value?.trim() ?? '';
  if (!text) return '';
  return `<span class="contact-item"><svg class="contact-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${contactIcons[kind]}</svg>${escapeHtml(text)}</span>`;
}

export function serviceOrderDocument(model: ServiceOrderPrint, css: string) {
  const logo = model.logoUrl
    ? `<img alt="" src="${escapeHtml(model.logoUrl)}" />`
    : `<h1>${escapeHtml(model.logoText)}</h1>`;
  const registration = model.tenant.stateRegistration
    ? ` - IE: ${escapeHtml(model.tenant.stateRegistration)}`
    : '';
  const addressLines = [model.tenant.addressLine, model.tenant.cityLine]
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('');
  const phones = [
    contactItem('phone', model.tenant.phone),
    contactItem('mobile', model.tenant.mobilePhone),
    contactItem('whatsapp', model.tenant.whatsapp),
  ]
    .filter(Boolean)
    .join(' - ');
  const email = contactItem('email', model.tenant.email);
  const attendance = model.originNumber
    ? `${escapeHtml(model.attendanceLabel)}<br>${escapeHtml(model.originNumber)}`
    : escapeHtml(model.attendanceLabel);

  const productRows = model.products
    .map((line) =>
      cells(
        [
          escapeHtml(line.code),
          escapeHtml(line.description),
          escapeHtml(line.quantity),
          money(line.unitPrice),
          money(line.lineAmount),
        ],
        ['', '', 'text-center', 'text-right', 'text-right'],
      ),
    )
    .join('');
  const serviceRows = model.services
    .map((line) =>
      cells(
        [
          escapeHtml(line.description),
          escapeHtml(line.technicianName),
          escapeHtml(line.quantity),
          money(line.unitPrice),
          money(line.lineAmount),
        ],
        ['', 'text-center', 'text-center', 'text-right', 'text-right'],
      ),
    )
    .join('');
  const contacts = [
    optionalField('Telefone', model.customer.phone, 3),
    optionalField('Celular', model.customer.mobilePhone, 3),
    optionalField('WhatsApp', model.customer.whatsapp, 3),
    optionalField('Email', model.customer.email, 3),
  ].join('');
  const contactRow = contacts ? `<div class="grid-row">${contacts}</div>` : '';
  const notes =
    model.notes.length === 0
      ? ''
      : `<div class="grid-row"><div class="field-group" style="grid-column: span 12"><label>Observações Finais</label><div class="field-value">${model.notes
          .map((note) => `<p>${escapeHtml(note.body)}</p>`)
          .join('')}</div></div></div>`;

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<title>Ordem de Serviço</title>
<style>${css}</style>
</head>
<body>
<div class="os-container">
<header class="os-header">
<div class="company-logo">${logo}</div>
<div class="company-info">
<h3>${escapeHtml(model.tenant.name)}</h3>
<p>CNPJ: ${escapeHtml(model.tenant.cnpj)}${registration}</p>
${addressLines}
${phones ? `<p>${phones}</p>` : ''}
${email ? `<p>${email}</p>` : ''}
</div>
<div class="os-number-badge"><span>Ordem de Serviço</span><strong>Nº ${escapeHtml(model.number)}</strong></div>
</header>
<div class="grid-row">
${field('Atendente', model.openedByName, 2)}
${field('Abertura', model.openedAt, 2)}
${field('Previsão de Entrega', model.promisedAt, 2)}
${marked('Tipo de atendimento', attendance, 2)}
${marked('Local de atendimento', escapeHtml(model.locationLabel), 2)}
${marked('Situação', escapeHtml(model.statusLabel), 2)}
</div>
<div class="section-title">Informações do Cliente</div>
<div class="grid-row">
${field('CPF/CNPJ', model.customer.taxId, 3)}
${field('Nome', model.customer.name, 9)}
</div>
${contactRow}
<div class="grid-row">
${field('Logradouro, Número - Complemento', model.customer.streetLine, 6)}
${field('Bairro', model.customer.neighborhood, 3)}
${field('Município', model.customer.cityLine, 3)}
</div>
<div class="section-title">${escapeHtml(model.sectionTitle)}</div>
${rowsByWidth(model.fields)
  .map(
    (row) =>
      `<div class="grid-row">${row.map((item) => field(item.label, item.value, item.width)).join('')}</div>`,
  )
  .join('\n')}
<table>
<thead><tr>
<th style="width: 8%" class="text-center">Código</th>
<th style="width: 57%" class="text-center">${escapeHtml(model.productsTitle)}</th>
<th style="width: 8%" class="text-center">Quant.</th>
<th style="width: 12%" class="text-center">Unitário</th>
<th style="width: 15%" class="text-center">Total</th>
</tr></thead>
<tbody>${productRows}${emptyRow(5)}</tbody>
</table>
<table>
<thead><tr>
<th style="width: 50%" class="text-center">${escapeHtml(model.servicesTitle)}</th>
<th style="width: 15%" class="text-center">Técnico</th>
<th style="width: 8%" class="text-center">Quant.</th>
<th style="width: 12%" class="text-center">Unitário</th>
<th style="width: 15%" class="text-center">Total</th>
</tr></thead>
<tbody>${serviceRows}${emptyRow(5)}</tbody>
</table>
<table>
<thead><tr>
<th style="width: 20%" class="text-center">Subtotal de Produtos</th>
<th style="width: 20%" class="text-center">Subtotal de Serviços</th>
<th style="width: 20%" class="text-center">Frete</th>
<th style="width: 20%" class="text-center">Desconto/Acréscimo</th>
<th style="width: 20%" class="text-center">Total Geral</th>
</tr></thead>
<tbody><tr>
<td class="text-center">${money(model.totals.productsAmount)}</td>
<td class="text-center">${money(model.totals.servicesAmount)}</td>
<td class="text-center">${money(model.totals.freightAmount)}</td>
<td class="text-center">${money(model.totals.adjustmentAmount)}</td>
<td class="text-center">${money(model.totals.totalAmount)}</td>
</tr></tbody>
</table>
${paymentSection(model)}
${notes}
<footer class="os-footer"><div class="grid-row">
<div class="field-group" style="grid-column: span 6"><label>${escapeHtml(model.technicianSignatureLabel)}</label><div class="field-value"></div></div>
<div class="field-group" style="grid-column: span 6"><label>${escapeHtml(model.customerSignatureLabel)}</label><div class="field-value"></div></div>
</div></footer>
</div>
</body>
</html>`;
}
