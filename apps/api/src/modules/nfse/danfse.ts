import '../../types/fastify.ts';

import { billingDocuments } from '@erp-360/mod-billing';
import { tenants } from '@erp-360/mod-core';
import { nfseRequests } from '@erp-360/mod-nfse';
import {
  cities,
  personAddresses,
  personContacts,
  persons,
  states,
} from '@erp-360/mod-persons';
import { serviceOrders } from '@erp-360/mod-service-orders';
import { formatCnpj, formatCpf, formatPhone, formatPostalCode } from '@erp-360/shared';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { XMLParser } from 'fast-xml-parser';
import { z } from 'zod';

import { db } from '../../db/index.ts';

export type DanfseParty = {
  name: string;
  taxId: string;
  municipalRegistration: string;
  email: string;
  phone: string;
  address: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  postalCode: string;
  /** opSimpNac — Simples Nacional na data de competência. */
  simplesNacional: string;
  /** regApTribSN — regime de apuração tributária pelo SN. */
  simplesAssessment: string;
};

export type DanfseIssqn = {
  taxation: string;
  rate: string;
  retention: string;
  cityLabel: string;
  immunityType: string;
  suspended: string;
  processNumber: string;
  base: string;
  amount: string;
  exigibility: string;
};

export type DanfseView = {
  accessKey: string;
  nfseNumber: string;
  competence: string;
  nfseIssuedAt: string;
  dpsNumber: string;
  dpsSeries: string;
  dpsIssuedAt: string;
  situation: string;
  purpose: string;
  issuerCityName: string;
  environment: 'homologation' | 'production';
  environmentGenerator: string;
  environmentType: string;
  environmentLabel: string;
  provider: DanfseParty;
  taker: DanfseParty;
  takerPresent: boolean;
  recipientSameAsTaker: boolean;
  intermediaryPresent: boolean;
  intermediary: DanfseParty;
  service: {
    nationalCode: string;
    municipalCode: string;
    nbsCode: string;
    description: string;
    location: string;
  };
  issqn: DanfseIssqn;
  issqnApplicable: boolean;
  federal: {
    irrf: string;
    cp: string;
    social: string;
    pis: string;
    cofins: string;
  };
  federalPresent: boolean;
  ibsCbsPresent: boolean;
  ibsCbs: Record<string, string>;
  serviceAmount: string;
  discountAmount: string;
  federalRetentionTotal: string;
  ibsCbsTotal: string;
  netAmount: string;
  complementaryInfo: string;
  qrCodeUrl: string;
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
});

const simplesNacionalLabels: Record<string, string> = {
  '1': 'Não optante',
  '2': 'Optante - MEI',
  '3': 'Optante - MicroEmpresa EPP',
  '4': 'Optante - MicroEmpresa EPP em início',
};

const simplesAssessmentLabels: Record<string, string> = {
  '1': 'Federais e Municipal pelo SN',
  '2': 'Federais pelo SN e ISSQN fora',
  '3': 'Fora do SN',
};

const issqnTaxationLabels: Record<string, string> = {
  '1': 'Operação tributável',
  '2': 'Imunidade',
  '3': 'Exportação de serviço',
  '4': 'Não incidência',
};

const issqnRetentionLabels: Record<string, string> = {
  '1': 'Não retido',
  '2': 'Retido pelo tomador',
  '3': 'Retido pelo intermediário',
};

const purposeLabels: Record<string, string> = {
  '0': 'Normal',
  '1': 'Normal',
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  return '';
}

function labeled(code: string, labels: Record<string, string>) {
  if (!code) return '';
  return labels[code] ? `${code} - ${labels[code]}` : code;
}

/** Data civil YYYY-MM-DD → DD/MM/AAAA. */
function formatDanfseDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return value;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

/** Data/hora ISO com fuso → DD/MM/AAAA HH:MM:SS, sem deslocar o horário fiscal. */
function formatDanfseDateTime(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (!match) return formatDanfseDate(value);
  return `${match[3]}/${match[2]}/${match[1]} ${match[4]}:${match[5]}:${match[6]}`;
}

/** Local da prestação no formato Município/UF - País. */
export function formatServiceLocation(
  cityName: string,
  stateAbbreviation: string,
  country = 'BR',
) {
  const city = cityName.trim();
  const state = stateAbbreviation.trim().toUpperCase();
  const nation = (country.trim() || 'BR').toUpperCase();
  if (city && state) return `${city}/${state} - ${nation}`;
  if (city) return `${city} - ${nation}`;
  return '';
}

async function resolveServiceLocation(
  location: string,
  fallback: { cityName?: string; stateAbbreviation?: string },
) {
  const current = location.trim();
  const code = current.replace(/\D/g, '');
  if (/^[0-9]{7}$/.test(code) && (current === code || !current.includes('/'))) {
    const [city] = await db
      .select({
        name: cities.name,
        stateAbbreviation: states.abbreviation,
      })
      .from(cities)
      .leftJoin(states, eq(cities.stateId, states.id))
      .where(eq(cities.code, code))
      .limit(1);
    if (city?.name) {
      return (
        formatServiceLocation(city.name, city.stateAbbreviation ?? '', 'BR') ||
        current
      );
    }
  }
  if (current.includes('/') && current.includes(' - ')) return current;
  const cityName = fallback.cityName?.trim() || current;
  const state = fallback.stateAbbreviation?.trim() || '';
  if (cityName && state && !/^[0-9]{7}$/.test(cityName)) {
    return formatServiceLocation(cityName, state, 'BR');
  }
  return current;
}

function emptyParty(): DanfseParty {
  return {
    name: '',
    taxId: '',
    municipalRegistration: '',
    email: '',
    phone: '',
    address: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: '',
    postalCode: '',
    simplesNacional: '',
    simplesAssessment: '',
  };
}

function taxIdOf(node: Record<string, unknown> | null): string {
  if (!node) return '';
  return text(node.CNPJ) || text(node.CPF) || text(node.NIF) || '';
}

function formatDanfseTaxId(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11) return formatCpf(digits);
  if (digits.length === 14) return formatCnpj(digits);
  return value;
}

function addressLine(party: Pick<DanfseParty, 'street' | 'number' | 'complement' | 'neighborhood'>) {
  const street = [party.street, party.number, party.complement].filter(Boolean).join(', ');
  return [street, party.neighborhood].filter(Boolean).join(' - ');
}

function presentParty(party: DanfseParty): DanfseParty {
  return {
    ...party,
    taxId: formatDanfseTaxId(party.taxId),
    phone: party.phone ? formatPhone(party.phone) : '',
    postalCode: party.postalCode ? formatPostalCode(party.postalCode) : '',
  };
}

function partyOf(node: Record<string, unknown> | null): DanfseParty {
  if (!node) return emptyParty();
  const end = asRecord(node.end);
  const endNac = asRecord(end?.endNac);
  const regTrib = asRecord(node.regTrib);
  const street = text(end?.xLgr);
  const number = text(end?.nro);
  const complement = text(end?.xCpl);
  const neighborhood = text(end?.xBairro);
  const city = text(endNac?.cMun);
  const postalCode = text(endNac?.CEP);
  const party: DanfseParty = {
    name: text(node.xNome),
    taxId: taxIdOf(node),
    municipalRegistration: text(node.IM),
    email: text(node.email),
    phone: text(node.fone),
    street,
    number,
    complement,
    neighborhood,
    city,
    state: '',
    postalCode,
    address: '',
    simplesNacional: simplesNacionalLabels[text(regTrib?.opSimpNac)] ?? text(regTrib?.opSimpNac),
    simplesAssessment:
      simplesAssessmentLabels[text(regTrib?.regApTribSN)] ?? text(regTrib?.regApTribSN),
  };
  party.address = addressLine(party);
  return presentParty(party);
}

function moneySum(...values: string[]) {
  let total = 0;
  let any = false;
  for (const value of values) {
    if (!value) continue;
    const amount = Number(value.replace(',', '.'));
    if (!Number.isFinite(amount)) continue;
    total += amount;
    any = true;
  }
  return any ? total.toFixed(2) : '';
}

/** Lê o XML autorizado da NFS-e nacional para a DANFSe. */
export function readDanfse(xml: string): DanfseView | null {
  let root: Record<string, unknown>;
  try {
    root = parser.parse(xml) as Record<string, unknown>;
  } catch {
    return null;
  }
  const nfse = asRecord(root.NFSe) ?? root;
  const inf = asRecord(nfse.infNFSe);
  if (!inf) return null;
  const dpsWrap = asRecord(inf.DPS);
  const infDps = asRecord(dpsWrap?.infDPS) ?? asRecord(inf.DPS);
  if (!infDps) return null;

  const accessKey = text(inf['@_Id']).replace(/^NFS/, '') || text(inf.chNFSe);
  if (!/^[0-9]{50}$/.test(accessKey)) return null;

  const tpAmb = text(infDps.tpAmb);
  const environment = tpAmb === '1' ? 'production' : 'homologation';
  const environmentType =
    environment === 'production' ? 'Produção' : 'Produção restrita (homologação)';
  const provider = partyOf(asRecord(infDps.prest));
  const takerNode = asRecord(infDps.toma);
  const taker = partyOf(takerNode);
  const intermediaryNode = asRecord(infDps.interm);
  const intermediary = partyOf(intermediaryNode);
  const serv = asRecord(infDps.serv);
  const serviceNode = asRecord(serv?.cServ);
  const locPrest = asRecord(serv?.locPrest);
  const tribMun = asRecord(asRecord(asRecord(infDps.valores)?.trib)?.tribMun);
  const tribFed = asRecord(asRecord(asRecord(infDps.valores)?.trib)?.tribFed);
  const totTrib = asRecord(asRecord(asRecord(infDps.valores)?.trib)?.totTrib);
  const valoresNfse = asRecord(inf.valores);
  const vServPrest = asRecord(asRecord(infDps.valores)?.vServPrest);
  const vServ = text(vServPrest?.vServ);
  const vDesc = text(vServPrest?.vDescIncond) || text(vServPrest?.vDescCond) || text(valoresNfse?.vDesc);
  const federal = {
    irrf: text(tribFed?.vRetIRRF),
    cp: text(tribFed?.vRetCP),
    social: text(tribFed?.vRetCSLL),
    pis: text(tribFed?.vPis) || text(tribFed?.vRetPIS),
    cofins: text(tribFed?.vCofins) || text(tribFed?.vRetCOFINS),
  };
  const federalRetentionTotal = moneySum(federal.irrf, federal.cp, federal.social, federal.pis, federal.cofins);
  const purposeCode = text(infDps.finNFSe);
  const serviceLocation = text(locPrest?.cLocPrestacao) || text(inf.xLocPrestacao) || text(infDps.cLocEmi);
  const pTotTribSn = text(totTrib?.pTotTribSN);
  const vTotTrib = text(totTrib?.vTotTrib);
  const complementaryInfo = pTotTribSn
    ? `Valor aproximado dos tributos (Lei 12.741/2012): ${pTotTribSn}%.`
    : vTotTrib
      ? `Valor aproximado dos tributos (Lei 12.741/2012): ${vTotTrib}.`
      : '';

  return {
    accessKey,
    nfseNumber: text(inf.nNFSe) || text(inf.nDFSe),
    competence: formatDanfseDate(text(infDps.dCompet)),
    nfseIssuedAt: formatDanfseDateTime(text(inf.dhProc) || text(infDps.dhEmi)),
    dpsNumber: text(infDps.nDPS),
    dpsSeries: text(infDps.serie),
    dpsIssuedAt: formatDanfseDateTime(text(infDps.dhEmi)),
    situation: text(inf.cStat) === '100' ? 'Autorizada' : text(inf.cStat),
    purpose: purposeLabels[purposeCode] ?? (purposeCode || 'Normal'),
    issuerCityName: text(inf.xLocEmi),
    environment,
    environmentGenerator: 'Sistema Nacional NFS-e',
    environmentType,
    environmentLabel: environmentType,
    provider,
    taker,
    takerPresent: Boolean(takerNode && (taker.name || taker.taxId)),
    recipientSameAsTaker: !asRecord(infDps.dest),
    intermediaryPresent: Boolean(intermediaryNode && (intermediary.name || intermediary.taxId)),
    intermediary,
    service: {
      nationalCode: text(serviceNode?.cTribNac),
      municipalCode: text(serviceNode?.cTribMun),
      nbsCode: text(serviceNode?.cNBS),
      description: text(serviceNode?.xDescServ),
      location: serviceLocation,
    },
    issqn: {
      taxation: labeled(text(tribMun?.tribISSQN), issqnTaxationLabels),
      rate: text(tribMun?.pAliq),
      retention: labeled(text(tribMun?.tpRetISSQN), issqnRetentionLabels),
      cityLabel: text(tribMun?.cLocIncid) || serviceLocation,
      immunityType: text(tribMun?.tpImunidade),
      suspended: text(tribMun?.tpSusp),
      processNumber: text(tribMun?.nProcesso),
      base: text(valoresNfse?.vBC) || text(tribMun?.vBC),
      amount: text(valoresNfse?.vISSQN) || text(tribMun?.vISSQN),
      exigibility: text(tribMun?.exigibilidadeISSQN) || text(tribMun?.tpExigibilidadeISSQN),
    },
    issqnApplicable: Boolean(tribMun),
    federal,
    federalPresent: Boolean(tribFed),
    ibsCbsPresent: false,
    ibsCbs: {},
    serviceAmount: vServ,
    discountAmount: vDesc,
    federalRetentionTotal,
    ibsCbsTotal: '',
    netAmount: text(valoresNfse?.vLiq) || vServ,
    complementaryInfo,
    qrCodeUrl: `https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=${accessKey}`,
  };
}

function httpError(message: string, status: number): never {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  throw error;
}

function fillBlank(current: string, next: string | null | undefined) {
  return current.trim() ? current : (next ?? '').trim();
}

function mergeParty(party: DanfseParty, patch: Partial<DanfseParty>): DanfseParty {
  const merged: DanfseParty = {
    name: fillBlank(party.name, patch.name),
    taxId: fillBlank(party.taxId, patch.taxId),
    municipalRegistration: fillBlank(party.municipalRegistration, patch.municipalRegistration),
    email: fillBlank(party.email, patch.email),
    phone: fillBlank(party.phone, patch.phone),
    street: fillBlank(party.street, patch.street),
    number: fillBlank(party.number, patch.number),
    complement: fillBlank(party.complement, patch.complement),
    neighborhood: fillBlank(party.neighborhood, patch.neighborhood),
    city: fillBlank(party.city, patch.city),
    state: fillBlank(party.state, patch.state),
    postalCode: fillBlank(party.postalCode, patch.postalCode),
    address: party.address,
    simplesNacional: fillBlank(party.simplesNacional, patch.simplesNacional),
    simplesAssessment: fillBlank(party.simplesAssessment, patch.simplesAssessment),
  };
  merged.address = addressLine(merged) || fillBlank(party.address, patch.address);
  return presentParty(merged);
}

/** Completa prestador/tomador com o cadastro local quando o XML autorizado veio enxuto. */
async function enrichDanfse(tenantId: string, requestId: string, view: DanfseView) {
  const [company] = await db
    .select({
      name: tenants.name,
      cnpj: tenants.cnpj,
      municipalRegistration: tenants.municipalRegistration,
      email: tenants.email,
      phone: tenants.phone,
      mobilePhone: tenants.mobilePhone,
      postalCode: tenants.postalCode,
      street: tenants.street,
      number: tenants.number,
      complement: tenants.complement,
      neighborhood: tenants.neighborhood,
      cityName: cities.name,
      stateAbbreviation: states.abbreviation,
    })
    .from(tenants)
    .leftJoin(cities, eq(tenants.cityId, cities.id))
    .leftJoin(states, eq(cities.stateId, states.id))
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (company) {
    view.provider = mergeParty(view.provider, {
      name: company.name,
      taxId: company.cnpj,
      municipalRegistration: company.municipalRegistration ?? '',
      email: company.email ?? '',
      phone: company.phone || company.mobilePhone || '',
      street: company.street ?? '',
      number: company.number ?? '',
      complement: company.complement ?? '',
      neighborhood: company.neighborhood ?? '',
      city: company.cityName ?? '',
      state: company.stateAbbreviation ?? '',
      postalCode: company.postalCode ?? '',
    });
  }

  view.service.location = await resolveServiceLocation(view.service.location, {
    cityName: company?.cityName || view.issuerCityName,
    stateAbbreviation: company?.stateAbbreviation || view.provider.state,
  });

  const [link] = await db
    .select({ personId: serviceOrders.personId })
    .from(nfseRequests)
    .innerJoin(
      billingDocuments,
      and(
        eq(billingDocuments.id, nfseRequests.billingDocumentId),
        eq(billingDocuments.tenantId, nfseRequests.tenantId),
      ),
    )
    .innerJoin(
      serviceOrders,
      and(
        eq(serviceOrders.id, billingDocuments.serviceOrderId),
        eq(serviceOrders.tenantId, billingDocuments.tenantId),
      ),
    )
    .where(and(eq(nfseRequests.id, requestId), eq(nfseRequests.tenantId, tenantId)))
    .limit(1);
  if (!link?.personId) return view;

  const [person] = await db
    .select({
      name: persons.name,
      taxId: persons.taxId,
      nfeEmail: persons.nfeEmail,
    })
    .from(persons)
    .where(and(eq(persons.id, link.personId), eq(persons.tenantId, tenantId)))
    .limit(1);
  const addressRows = await db
    .select({
      type: personAddresses.type,
      postalCode: personAddresses.postalCode,
      street: personAddresses.street,
      number: personAddresses.number,
      complement: personAddresses.complement,
      neighborhood: personAddresses.neighborhood,
      cityName: cities.name,
      stateAbbreviation: states.abbreviation,
    })
    .from(personAddresses)
    .innerJoin(cities, eq(personAddresses.cityId, cities.id))
    .leftJoin(states, eq(cities.stateId, states.id))
    .where(and(eq(personAddresses.personId, link.personId), eq(personAddresses.tenantId, tenantId)))
    .orderBy(asc(personAddresses.type), asc(personAddresses.id));
  const address =
    addressRows.find((row) => row.type === 'Principal') ??
    addressRows.find((row) => row.type === 'Faturamento') ??
    addressRows[0] ??
    null;
  const [contact] = await db
    .select({
      email: personContacts.email,
      phone: personContacts.phone,
      mobilePhone: personContacts.mobilePhone,
      whatsapp: personContacts.whatsapp,
    })
    .from(personContacts)
    .where(and(eq(personContacts.personId, link.personId), eq(personContacts.tenantId, tenantId)))
    .orderBy(
      sql`case when ${personContacts.type} = 'Principal' then 0 else 1 end`,
      asc(personContacts.id),
    )
    .limit(1);

  if (person || address || contact) {
    view.taker = mergeParty(view.taker, {
      name: person?.name ?? '',
      taxId: (person?.taxId ?? '').replace(/\D/g, ''),
      email: person?.nfeEmail || contact?.email || '',
      phone: contact?.phone || contact?.mobilePhone || contact?.whatsapp || '',
      street: address?.street ?? '',
      number: address?.number ?? '',
      complement: address?.complement ?? '',
      neighborhood: address?.neighborhood ?? '',
      city: address?.cityName ?? '',
      state: address?.stateAbbreviation ?? '',
      postalCode: address?.postalCode ?? '',
    });
    view.takerPresent = Boolean(view.taker.name || view.taker.taxId);
  }
  return view;
}

export async function loadDanfse(tenantId: string, requestId: string): Promise<DanfseView> {
  const [row] = await db
    .select({
      status: nfseRequests.status,
      nfseXml: nfseRequests.nfseXml,
      accessKey: nfseRequests.accessKey,
    })
    .from(nfseRequests)
    .where(and(eq(nfseRequests.tenantId, tenantId), eq(nfseRequests.id, requestId)))
    .limit(1);
  if (!row) httpError('Pedido de NFS-e não encontrado.', 404);
  if (row.status !== 'authorized') {
    httpError('A DANFSe só está disponível para NFS-e autorizada.', 400);
  }
  if (!row.nfseXml?.trim()) {
    httpError('XML da NFS-e não está disponível para a DANFSe.', 400);
  }
  const view = readDanfse(row.nfseXml);
  if (!view) httpError('Não foi possível montar a DANFSe a partir do XML.', 400);
  return enrichDanfse(tenantId, requestId, view);
}

export const nfseDanfseRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('preHandler', fastify.autenticarETenant);

  fastify.get(
    '/:requestId/danfse',
    { schema: { params: z.object({ requestId: z.string().uuid() }) } },
    async (request) => loadDanfse(request.user.tenantId, request.params.requestId),
  );
};
