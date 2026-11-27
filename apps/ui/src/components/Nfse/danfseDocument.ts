import QRCode from 'qrcode';

import type { DanfseParty, DanfseView } from '@/services/nfse';
import liberationMonoRegularUrl from '@/assets/fonts/LiberationMono-Regular.ttf?url';
import liberationSansBoldUrl from '@/assets/fonts/LiberationSans-Bold.ttf?url';
import liberationSansRegularUrl from '@/assets/fonts/LiberationSans-Regular.ttf?url';
import logoUrl from '@/assets/nfse-logo.png';

import template from '../../../../../doc/templates/danfse2.html?raw';

async function fontDataUri(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Falha ao carregar fonte da DANFSe (${response.status}).`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const chunkSize = 0x8000;
  let binary = '';
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return `data:font/ttf;base64,${btoa(binary)}`;
}

let fontFacesPromise: Promise<string> | null = null;

function fontFacesCss() {
  fontFacesPromise ??= (async () => {
    const [sansRegular, sansBold, monoRegular] = await Promise.all([
      fontDataUri(liberationSansRegularUrl),
      fontDataUri(liberationSansBoldUrl),
      fontDataUri(liberationMonoRegularUrl),
    ]);
    return `
@font-face {
  font-family: 'Liberation Sans';
  font-style: normal;
  font-weight: 400;
  font-display: block;
  src: url('${sansRegular}') format('truetype');
}
@font-face {
  font-family: 'Liberation Sans';
  font-style: normal;
  font-weight: 700;
  font-display: block;
  src: url('${sansBold}') format('truetype');
}
@font-face {
  font-family: 'Liberation Mono';
  font-style: normal;
  font-weight: 400;
  font-display: block;
  src: url('${monoRegular}') format('truetype');
}`.trim();
  })();
  return fontFacesPromise;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function display(value: string | null | undefined) {
  const text = (value ?? '').trim();
  return text ? escapeHtml(text) : '—';
}

function cityState(party: DanfseParty) {
  return [party.city, party.state].filter(Boolean).join(' - ');
}

function partyRows(party: DanfseParty) {
  return `<div class="row">
      <div class="col" style="width: 57%">
        <div class="label">Nome / Razão social</div>
        <div class="value">${display(party.name)}</div>
      </div>
      <div class="col" style="width: 25%">
        <div class="label">CPF / CNPJ</div>
        <div class="value">${display(party.taxId)}</div>
      </div>
      <div class="col" style="width: 18%">
        <div class="label">Inscrição municipal</div>
        <div class="value">${display(party.municipalRegistration)}</div>
      </div>
    </div>
    <div class="row">
      <div class="col" style="width: 57%">
        <div class="label">Endereço</div>
        <div class="value-normal">${display(party.address)}</div>
      </div>
      <div class="col" style="width: 25%">
        <div class="label">Município / UF</div>
        <div class="value-normal">${display(cityState(party))}</div>
      </div>
      <div class="col" style="width: 18%">
        <div class="label">CEP</div>
        <div class="value-normal">${display(party.postalCode)}</div>
      </div>
    </div>
    <div class="row">
      <div class="col" style="width: 18%">
        <div class="label">Telefone</div>
        <div class="value-normal">${display(party.phone)}</div>
      </div>
      <div class="col" style="width: 82%">
        <div class="label">E-mail</div>
        <div class="value-normal">${display(party.email)}</div>
      </div>
    </div>`;
}

function issqnRows(view: DanfseView) {
  if (!view.issqnApplicable) {
    return '<div style="padding: 4px">TRIBUTAÇÃO MUNICIPAL (ISSQN) — OPERAÇÃO NÃO SUJEITA AO ISSQN</div>';
  }
  return `<div class="row">
      <div class="col" style="width: 15%">
        <div class="label">Tributação ISSQN</div>
        <div class="value-normal">${display(view.issqn.taxation)}</div>
      </div>
      <div class="col" style="width: 15%">
        <div class="label">Município incidência</div>
        <div class="value-normal">${display(view.issqn.cityLabel)}</div>
      </div>
      <div class="col" style="width: 15%">
        <div class="label">Exigibilidade</div>
        <div class="value-normal">${display(view.issqn.exigibility)}</div>
      </div>
      <div class="col" style="width: 15%">
        <div class="label">Retenção ISSQN</div>
        <div class="value-normal">${display(view.issqn.retention)}</div>
      </div>
      <div class="col" style="width: 15%">
        <div class="label">Base de cálculo</div>
        <div class="value-normal">${display(view.issqn.base)}</div>
      </div>
      <div class="col" style="width: 10%">
        <div class="label">Alíquota</div>
        <div class="value-normal">${display(view.issqn.rate)}</div>
      </div>
      <div class="col" style="width: 15%">
        <div class="label">Valor ISSQN</div>
        <div class="value-normal">${display(view.issqn.amount)}</div>
      </div>
    </div>`;
}

function federalRows(view: DanfseView) {
  if (!view.federalPresent) {
    return '<div style="padding: 4px">—</div>';
  }
  return `<div class="row">
      <div class="col" style="width: 33%">
        <div class="label">IRRF</div>
        <div class="value-normal">${display(view.federal.irrf)}</div>
      </div>
      <div class="col" style="width: 33%">
        <div class="label">Contribuição previdenciária retida</div>
        <div class="value-normal">${display(view.federal.cp)}</div>
      </div>
      <div class="col" style="width: 33%">
        <div class="label">Contribuições sociais retidas</div>
        <div class="value-normal">${display(view.federal.social)}</div>
      </div>
    </div>
    <div class="row">
      <div class="col" style="width: 33%">
        <div class="label">PIS</div>
        <div class="value-normal">${display(view.federal.pis)}</div>
      </div>
      <div class="col" style="width: 33%">
        <div class="label">COFINS</div>
        <div class="value-normal">${display(view.federal.cofins)}</div>
      </div>
      <div class="col" style="width: 33%">
        <div class="label">Total das retenções federais</div>
        <div class="value-normal">${display(view.federalRetentionTotal)}</div>
      </div>
    </div>`;
}

function ibsCbsRows(view: DanfseView) {
  if (!view.ibsCbsPresent) {
    return '<div style="padding: 4px">—</div>';
  }
  const entries = Object.entries(view.ibsCbs);
  if (entries.length === 0) return '<div style="padding: 4px">—</div>';
  return `<div style="padding: 4px">${entries
    .map(([key, value]) => `<div>${escapeHtml(key)}: ${display(value)}</div>`)
    .join('')}</div>`;
}

export async function danfseDocument(view: DanfseView): Promise<string> {
  const [qrDataUrl, fontFaces] = await Promise.all([
    QRCode.toDataURL(view.qrCodeUrl, {
      margin: 0,
      width: 120,
      errorCorrectionLevel: 'M',
    }),
    fontFacesCss(),
  ]);
  const logoImg = `<img src="${logoUrl}" alt="NFS-e" />`;
  const qrImg = `<img src="${qrDataUrl}" alt="QR Code" width="74" height="74" />`;
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

  const values: Record<string, string> = {
    logo: logoImg,
    qrImage: qrImg,
    homologationBanner,
    accessKey: escapeHtml(view.accessKey),
    nfseNumber: display(view.nfseNumber),
    competence: display(view.competence),
    nfseIssuedAt: display(view.nfseIssuedAt),
    dpsNumber: display(view.dpsNumber),
    dpsSeries: display(view.dpsSeries),
    dpsIssuedAt: display(view.dpsIssuedAt),
    situation: display(view.situation),
    purpose: display(view.purpose),
    issuerCityName: display(view.issuerCityName),
    environmentGenerator: display(view.environmentGenerator || 'Sistema Nacional NFS-e'),
    environmentType: display(view.environmentType || view.environmentLabel),
    providerName: display(view.provider.name),
    providerTaxId: display(view.provider.taxId),
    providerMunicipalRegistration: display(view.provider.municipalRegistration),
    providerAddressLine: display(view.provider.address),
    providerCityState: display(cityState(view.provider)),
    providerPostalCode: display(view.provider.postalCode),
    providerPhone: display(view.provider.phone),
    providerEmail: display(view.provider.email),
    providerSimplesNacional: display(view.provider.simplesNacional),
    providerSimplesAssessment: display(view.provider.simplesAssessment),
    serviceNationalCode: display(view.service.nationalCode),
    serviceMunicipalCode: display(view.service.municipalCode),
    serviceNbsCode: display(view.service.nbsCode),
    serviceLocation: display(view.service.location),
    serviceDescription: escapeHtml(view.service.description) || '—',
    serviceAmount: display(view.serviceAmount),
    discountAmount: display(view.discountAmount),
    federalRetentionTotal: display(view.federalRetentionTotal),
    ibsCbsTotal: display(view.ibsCbsTotal),
    netAmount: display(view.netAmount),
    complementaryInfo: escapeHtml(view.complementaryInfo) || '—',
    federalBlock: federalRows(view),
    ibsCbsBlock: ibsCbsRows(view),
    takerBlock,
    recipientBlock,
    intermediaryBlock,
    issqnBlock: issqnRows(view),
  };

  const withFonts = template.replaceAll(
    '<!--[fontFaces]-->',
    `<style>\n${fontFaces}\n    </style>`,
  );

  return Object.entries(values).reduce(
    (html, [key, value]) => html.replaceAll(`[${key}]`, value),
    withFonts,
  );
}
