import {
  formatCnpj,
  formatCpf,
  formatCurrencyInput,
  formatPhone,
  formatPostalCode,
} from '@erp-360/shared';

import type { DanfeDuplicate, DanfeItem, DanfeView } from '@/services/inbound';

import template from '../../../../../doc/templates/nfe_vertical.html?raw';

const htmlFields = new Set(['logo', 'duplicatas', 'itens']);

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function money(value: number | null | undefined) {
  if (value == null) return '';
  return formatCurrencyInput(value);
}

function formatRate(value: string) {
  if (!value) return '';
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  return number.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

function formatQty(value: string) {
  if (!value) return '';
  const number = Number(value);
  if (!Number.isFinite(number)) return value.replace('.', ',');
  return number.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
}

function formatDate(value: string) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-');
    return `${day}/${month}/${year}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function formatTime(value: string) {
  if (!value) return '';
  if (/^\d{2}:\d{2}/.test(value)) return value.slice(0, 8);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function documentNumber(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 14) return formatCnpj(digits);
  if (digits.length === 11) return formatCpf(digits);
  return value;
}

function groupKey(value: string) {
  return value.replace(/(\d{4})(?=\d)/g, '$1 ');
}

function decimal(value: string) {
  if (!value) return '';
  return value.replace('.', ',');
}

function itemRows(items: DanfeItem[]) {
  if (items.length === 0) {
    return '<tr><td colspan="14">Nenhum item no XML.</td></tr>';
  }
  return items
    .map(
      (item) => `<tr>
        <td>${escapeHtml(item.code)}</td>
        <td>${escapeHtml(item.description)}</td>
        <td class="center">${escapeHtml(item.ncm)}</td>
        <td class="center">${escapeHtml(item.cst)}</td>
        <td class="center">${escapeHtml(item.cfop)}</td>
        <td class="center">${escapeHtml(item.unit)}</td>
        <td class="right">${escapeHtml(formatQty(item.quantity))}</td>
        <td class="right">${escapeHtml(money(item.unitPrice))}</td>
        <td class="right">${escapeHtml(money(item.amount))}</td>
        <td class="right">${escapeHtml(money(item.icmsBase))}</td>
        <td class="right">${escapeHtml(money(item.icmsAmount))}</td>
        <td class="right">${escapeHtml(money(item.ipiAmount))}</td>
        <td class="right">${escapeHtml(formatRate(item.icmsRate))}</td>
        <td class="right">${escapeHtml(formatRate(item.ipiRate))}</td>
      </tr>`,
    )
    .join('');
}

function duplicateTable(duplicates: DanfeDuplicate[]) {
  const cells =
    duplicates.length === 0
      ? '<td>&nbsp;</td>'
      : duplicates
          .map(
            (item) => `<td>
              <span class="nf-label">Número</span><span class="info">${escapeHtml(item.number)}</span>
              <span class="nf-label">Vencimento</span><span class="info">${escapeHtml(formatDate(item.dueOn))}</span>
              <span class="nf-label">Valor</span><span class="info">${escapeHtml(money(item.amount))}</span>
            </td>`,
          )
          .join('');
  return `<table><tbody><tr>${cells}</tr></tbody></table>`;
}

function protocolText(view: DanfeView) {
  if (!view.protocol) return '';
  const when = view.protocolAt
    ? `${formatDate(view.protocolAt)} ${formatTime(view.protocolAt)}`.trim()
    : '';
  return [view.protocol, when].filter(Boolean).join('  ');
}

export function danfeDocument(view: DanfeView) {
  const emitter = view.emitter;
  const recipient = view.recipient;
  const transport = view.transport;
  const fields: Record<string, string> = {
    logo: '',
    pagina: '1',
    total_paginas: '1',
    numero: view.number,
    serie: view.series,
    tipo_operacao: view.operationType,
    chave: groupKey(view.accessKey),
    natureza: view.operation,
    protocolo: protocolText(view),
    data_emissao: formatDate(view.issuedAt),
    data_entrada_saida: formatDate(view.entryAt),
    hora_entrada_saida: view.entryAt.includes('T')
      ? formatTime(view.entryAt)
      : formatTime(view.entryTime),
    emitente_nome: emitter.name,
    emitente_logradouro: emitter.street,
    emitente_bairro: emitter.neighborhood,
    emitente_cep: formatPostalCode(emitter.postalCode),
    emitente_municipio: emitter.city,
    emitente_uf: emitter.state,
    emitente_telefone: formatPhone(emitter.phone),
    emitente_ie: emitter.stateRegistration ?? '',
    emitente_ie_st: emitter.stateRegistrationSt ?? '',
    emitente_cnpj: documentNumber(emitter.taxId),
    emitente_im: emitter.municipalRegistration ?? '',
    destinatario_nome: recipient.name,
    destinatario_cnpj: documentNumber(recipient.taxId),
    destinatario_logradouro: recipient.street,
    destinatario_bairro: recipient.neighborhood,
    destinatario_cep: formatPostalCode(recipient.postalCode),
    destinatario_municipio: recipient.city,
    destinatario_telefone: formatPhone(recipient.phone),
    destinatario_uf: recipient.state,
    destinatario_ie: recipient.stateRegistration ?? '',
    duplicatas: duplicateTable(view.duplicates),
    base_icms: money(view.icmsBase),
    valor_icms: money(view.icmsAmount),
    base_icms_st: money(view.icmsStBase),
    valor_icms_st: money(view.icmsStAmount),
    valor_importacao: money(view.importAmount),
    valor_icms_remetente: money(view.icmsSenderAmount),
    valor_fcp: money(view.fcpAmount),
    valor_pis: money(view.pisAmount),
    valor_produtos: money(view.productsAmount),
    valor_frete: money(view.freightAmount),
    valor_seguro: money(view.insuranceAmount),
    valor_desconto: money(view.discountAmount),
    valor_outras: money(view.otherAmount),
    valor_ipi: money(view.ipiAmount),
    valor_icms_destino: money(view.icmsDestinationAmount),
    valor_tributos: money(view.taxAmount),
    valor_cofins: money(view.cofinsAmount),
    valor_total: money(view.totalAmount),
    valor_servicos: money(view.servicesAmount),
    base_issqn: money(view.issqnBase),
    valor_issqn: money(view.issqnAmount),
    transportador_nome: transport.carrierName,
    frete: transport.freightType,
    transportador_antt: transport.anttCode,
    transportador_placa: transport.plate,
    transportador_placa_uf: transport.plateState,
    transportador_cnpj: documentNumber(transport.taxId),
    transportador_logradouro: transport.address,
    transportador_municipio: transport.city,
    transportador_uf: transport.state,
    transportador_ie: transport.stateRegistration,
    volumes_quantidade: transport.volumeQuantity,
    volumes_especie: transport.volumeSpecies,
    volumes_marca: transport.volumeBrand,
    volumes_numeracao: transport.volumeNumber,
    peso_bruto: decimal(transport.grossWeight),
    peso_liquido: decimal(transport.netWeight),
    itens: itemRows(view.items),
    informacoes_complementares: view.additionalInfo,
  };

  return template.replace(/\[([a-z0-9_]+)\]/g, (token, key: string) => {
    const value = fields[key];
    if (value == null) return '';
    return htmlFields.has(key) ? value : escapeHtml(value);
  });
}
