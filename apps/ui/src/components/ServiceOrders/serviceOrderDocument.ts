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

function cells(values: string[], align: string[]) {
  return `<tr>${values
    .map((value, index) => `<td class="${align[index] ?? ''}">${value}</td>`)
    .join('')}</tr>`;
}

function emptyRow(columns: number) {
  return `<tr class="empty-row">${'<td></td>'.repeat(columns)}</tr>`;
}

export function serviceOrderDocument(model: ServiceOrderPrint, css: string) {
  const logo = model.logoUrl
    ? `<img alt="" src="${escapeHtml(model.logoUrl)}" />`
    : `<h1>${escapeHtml(model.logoText)}</h1>`;
  const registration = model.tenant.stateRegistration
    ? ` - IE: ${escapeHtml(model.tenant.stateRegistration)}`
    : '';
  const address = [model.tenant.addressLine, model.tenant.cityLine].filter(Boolean).join(' - ');
  const contact = [
    model.tenant.phone,
    model.tenant.mobilePhone,
    model.tenant.whatsapp,
    model.tenant.email,
  ]
    .filter(Boolean)
    .join(' - ');
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
<h3>${escapeHtml(model.tenant.tradeName)}</h3>
<p>CNPJ: ${escapeHtml(model.tenant.cnpj)}${registration}</p>
<p>${escapeHtml(address)}</p>
<p>${escapeHtml(contact)}</p>
</div>
<div class="os-number-badge"><span>Ordem de Serviço</span><strong>Nº ${escapeHtml(model.number)}</strong></div>
</header>
<div class="grid-row">
${field('Atendente', model.openedByName, 3)}
${field('Abertura', model.openedAt, 2)}
${field('Previsão de Entrega', model.promisedAt, 2)}
${marked('Tipo de atendimento', attendance, 2)}
${marked('Situação', escapeHtml(model.statusLabel), 3)}
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
<div class="grid-row">
${model.fields.map((item) => field(item.label, item.value, item.width)).join('')}
</div>
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
<div class="grid-row">
${field('Meio de Pagamento', model.payment.methodDescription, 8)}
${field('Condição', model.payment.installmentsLabel, 4)}
</div>
${notes}
<footer class="os-footer"><div class="grid-row">
<div class="field-group" style="grid-column: span 6"><label>${escapeHtml(model.technicianSignatureLabel)}</label><div class="field-value"><br><p>_________________________________________________________________</p></div></div>
<div class="field-group" style="grid-column: span 6"><label>${escapeHtml(model.customerSignatureLabel)}</label><div class="field-value"><br><p>_________________________________________________________________</p></div></div>
</div></footer>
</div>
</body>
</html>`;
}
