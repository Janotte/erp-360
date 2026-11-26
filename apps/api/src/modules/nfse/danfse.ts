import '../../types/fastify.ts';

import { nfseRequests } from '@erp-360/mod-nfse';
import { and, eq } from 'drizzle-orm';
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
  city: string;
  state: string;
  postalCode: string;
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
    description: string;
  };
  issqn: DanfseIssqn;
  issqnApplicable: boolean;
  federal: {
    irrf: string;
    cp: string;
    social: string;
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

function emptyParty(): DanfseParty {
  return {
    name: '',
    taxId: '',
    municipalRegistration: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    postalCode: '',
  };
}

function taxIdOf(node: Record<string, unknown> | null): string {
  if (!node) return '';
  return text(node.CNPJ) || text(node.CPF) || text(node.NIF) || '';
}

function partyOf(node: Record<string, unknown> | null): DanfseParty {
  if (!node) return emptyParty();
  const end = asRecord(node.end);
  const endNac = asRecord(end?.endNac);
  const street = [text(end?.xLgr), text(end?.nro), text(end?.xCpl), text(end?.xBairro)]
    .filter(Boolean)
    .join(', ');
  return {
    name: text(node.xNome),
    taxId: taxIdOf(node),
    municipalRegistration: text(node.IM),
    email: text(node.email),
    phone: text(node.fone),
    address: street,
    city: text(endNac?.cMun),
    state: '',
    postalCode: text(endNac?.CEP),
  };
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
  const provider = partyOf(asRecord(infDps.prest));
  const takerNode = asRecord(infDps.toma);
  const taker = partyOf(takerNode);
  const serviceNode = asRecord(asRecord(infDps.serv)?.cServ);
  const tribMun = asRecord(asRecord(asRecord(infDps.valores)?.trib)?.tribMun);
  const tribFed = asRecord(asRecord(asRecord(infDps.valores)?.trib)?.tribFed);
  const valoresNfse = asRecord(inf.valores);
  const vServ = text(asRecord(asRecord(infDps.valores)?.vServPrest)?.vServ);

  return {
    accessKey,
    nfseNumber: text(inf.nNFSe) || text(inf.nDFSe),
    competence: text(infDps.dCompet),
    nfseIssuedAt: text(inf.dhProc) || text(infDps.dhEmi),
    dpsNumber: text(infDps.nDPS),
    dpsSeries: text(infDps.serie),
    dpsIssuedAt: text(infDps.dhEmi),
    situation: text(inf.cStat) === '100' ? 'Autorizada' : text(inf.cStat),
    purpose: text(infDps.finNFSe) || 'Normal',
    issuerCityName: text(inf.xLocEmi),
    environment,
    environmentLabel:
      environment === 'production' ? 'Produção' : 'Produção restrita (homologação)',
    provider,
    taker,
    takerPresent: Boolean(takerNode && (taker.name || taker.taxId)),
    recipientSameAsTaker: true,
    intermediaryPresent: false,
    intermediary: emptyParty(),
    service: {
      nationalCode: text(serviceNode?.cTribNac),
      municipalCode: text(serviceNode?.cTribMun),
      description: text(serviceNode?.xDescServ),
    },
    issqn: {
      taxation: text(tribMun?.tribISSQN),
      rate: text(tribMun?.pAliq),
      retention: text(tribMun?.tpRetISSQN),
      cityLabel: '',
      immunityType: text(tribMun?.tpImunidade),
      suspended: '',
      processNumber: '',
      base: '',
      amount: '',
    },
    issqnApplicable: Boolean(tribMun),
    federal: {
      irrf: text(tribFed?.vRetIRRF),
      cp: text(tribFed?.vRetCP),
      social: text(tribFed?.vRetCSLL),
    },
    federalPresent: Boolean(tribFed),
    ibsCbsPresent: false,
    ibsCbs: {},
    serviceAmount: vServ,
    discountAmount: '',
    federalRetentionTotal: '',
    ibsCbsTotal: '',
    netAmount: text(valoresNfse?.vLiq) || vServ,
    complementaryInfo: '',
    qrCodeUrl: `https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=${accessKey}`,
  };
}

function httpError(message: string, status: number): never {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  throw error;
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
  return view;
}

export const nfseDanfseRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('preHandler', fastify.autenticarETenant);

  fastify.get(
    '/:requestId/danfse',
    { schema: { params: z.object({ requestId: z.string().uuid() }) } },
    async (request) => loadDanfse(request.user.tenantId, request.params.requestId),
  );
};
