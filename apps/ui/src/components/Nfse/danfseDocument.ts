import QRCode from 'qrcode';

import type { DanfseView } from '@/services/nfse';
import logoUrl from '@/assets/nfse-logo.png';

import template from '../../../../../doc/templates/danfse.html?raw';

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function partyRows(party: DanfseView['taker']) {
  return `<div>Nome: ${escapeHtml(party.name)}</div>
     <div>CPF/CNPJ: ${escapeHtml(party.taxId)}</div>
     <div>Endereço: ${escapeHtml(party.address)}</div>
     <div>Município: ${escapeHtml(party.city)}</div>
     <div>CEP: ${escapeHtml(party.postalCode)}</div>
     <div>E-mail: ${escapeHtml(party.email)}</div>
     <div>Telefone: ${escapeHtml(party.phone)}</div>`;
}

export async function danfseDocument(view: DanfseView): Promise<string> {
  const qrDataUrl = await QRCode.toDataURL(view.qrCodeUrl, {
    margin: 0,
    width: 120,
    errorCorrectionLevel: 'M',
  });
  const logoImg = `<img src="${logoUrl}" alt="NFS-e" />`;
  const qrImg = `<img src="${qrDataUrl}" alt="QR Code" width="86" height="86" />`;
  const homologationBanner =
    view.environment === 'homologation'
      ? '<div class="homolog">NFS-e SEM VALIDADE JURÍDICA</div>'
      : '';

  const takerBlock = view.takerPresent
    ? partyRows(view.taker)
    : 'TOMADOR/ADQUIRENTE DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e';
  const recipientBlock = view.recipientSameAsTaker
    ? 'O DESTINATÁRIO É O PRÓPRIO TOMADOR/ADQUIRENTE DA OPERAÇÃO'
    : partyRows(view.taker);
  const intermediaryBlock = view.intermediaryPresent
    ? partyRows(view.intermediary)
    : 'INTERMEDIÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e';
  const issqnBlock = view.issqnApplicable
    ? `<div>Tipo: ${escapeHtml(view.issqn.taxation)}</div>
       <div>Alíquota: ${escapeHtml(view.issqn.rate)}</div>
       <div>Retenção: ${escapeHtml(view.issqn.retention)}</div>`
    : 'TRIBUTAÇÃO MUNICIPAL (ISSQN) - OPERAÇÃO NÃO SUJEITA AO ISSQN';

  const values: Record<string, string> = {
    logo: logoImg,
    qrImage: qrImg,
    homologationBanner,
    accessKey: escapeHtml(view.accessKey),
    nfseNumber: escapeHtml(view.nfseNumber),
    competence: escapeHtml(view.competence),
    nfseIssuedAt: escapeHtml(view.nfseIssuedAt),
    dpsNumber: escapeHtml(view.dpsNumber),
    dpsSeries: escapeHtml(view.dpsSeries),
    dpsIssuedAt: escapeHtml(view.dpsIssuedAt),
    situation: escapeHtml(view.situation),
    purpose: escapeHtml(view.purpose),
    providerName: escapeHtml(view.provider.name),
    providerTaxId: escapeHtml(view.provider.taxId),
    providerAddress: escapeHtml(view.provider.address),
    serviceNationalCode: escapeHtml(view.service.nationalCode),
    serviceMunicipalCode: escapeHtml(view.service.municipalCode),
    serviceDescription: escapeHtml(view.service.description),
    serviceAmount: escapeHtml(view.serviceAmount),
    discountAmount: escapeHtml(view.discountAmount),
    federalRetentionTotal: escapeHtml(view.federalRetentionTotal),
    ibsCbsTotal: escapeHtml(view.ibsCbsTotal),
    netAmount: escapeHtml(view.netAmount),
    complementaryInfo: escapeHtml(view.complementaryInfo) || '—',
    federalBlock: view.federalPresent
      ? `<div>IRRF: ${escapeHtml(view.federal.irrf)}</div>
         <div>CP: ${escapeHtml(view.federal.cp)}</div>
         <div>Sociais: ${escapeHtml(view.federal.social)}</div>`
      : '—',
    ibsCbsBlock: view.ibsCbsPresent
      ? Object.entries(view.ibsCbs)
          .map(([key, value]) => `<div>${escapeHtml(key)}: ${escapeHtml(value)}</div>`)
          .join('')
      : '—',
    takerBlock,
    recipientBlock,
    intermediaryBlock,
    issqnBlock,
    issuerCityName: escapeHtml(view.issuerCityName),
    environmentLabel: escapeHtml(view.environmentLabel),
  };

  return Object.entries(values).reduce(
    (html, [key, value]) => html.replaceAll(`[${key}]`, value),
    template,
  );
}
