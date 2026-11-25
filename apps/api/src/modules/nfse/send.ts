import https from 'node:https';
import { URL } from 'node:url';

import { billingDocuments } from '@erp-360/mod-billing';
import { tenants } from '@erp-360/mod-core';
import { nfseDpsCounters, nfseRequestLines, nfseRequests, nfseSettings } from '@erp-360/mod-nfse';
import { cities, persons } from '@erp-360/mod-persons';
import { serviceOrders } from '@erp-360/mod-service-orders';
import type { NfseEnvironment } from '@erp-360/shared';
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';

import { db } from '../../db/index.ts';
import { trustedCertificates } from '../certificates/trust.ts';
import { nfeEventTimestamp } from '../inbound/dfe-event.ts';
import { certificateMaterial } from '../inbound/dfe-sync.ts';
import { InboundError } from '../inbound/errors.ts';
import {
  buildSignedDps,
  type NfseDpsDraft,
  nfseDpsId,
  nfseSubmissionEndpoint,
  readNfseSubmission,
} from './dps.ts';

const messages = {
  missingOrder: 'Ordem não encontrada.',
  missingDocument: 'Gere o financeiro antes de enviar a NFS-e.',
  missingRequest: 'Solicite a NFS-e antes de enviar.',
  authorized: 'A NFS-e deste documento já foi autorizada.',
  canceled: 'A NFS-e deste documento foi cancelada.',
  busy: 'O envio desta NFS-e já está em andamento.',
  series: 'Informe a série da NFS-e, de 00001 a 49999.',
  city: 'Informe o município da empresa antes de enviar a NFS-e.',
  cnpj: 'O CNPJ da empresa está incompleto.',
  certificateCnpj: 'O certificado A1 não é o CNPJ desta empresa.',
  tomador: 'Informe o CPF ou CNPJ do cliente antes de enviar a NFS-e.',
  foreigner: 'O cliente estrangeiro ainda não entra nesta NFS-e.',
  national: 'Informe o código de tributação nacional do serviço antes de enviar.',
  nationalMixed: 'Os serviços desta nota precisam do mesmo código de tributação nacional.',
  municipalMixed: 'Os serviços desta nota precisam do mesmo código tributário municipal.',
  rateMixed: 'Os serviços desta nota precisam da mesma alíquota de ISS.',
  rateHigh: 'A alíquota do ISS nesta nota não pode passar de 5%.',
  description: 'A discriminação do serviço aceita até 2000 caracteres.',
  doneHomologation: 'NFS-e autorizada em homologação.',
  doneProduction: 'NFS-e autorizada.',
};

const simplesCode = {
  non_optant: '1',
  mei: '2',
  me_epp: '3',
  pending: '4',
} as const;

const assessmentCode = {
  federal_and_municipal: '1',
  federal_by_simples: '2',
  outside_simples: '3',
} as const;

const regimeCode = {
  none: '0',
  cooperative_act: '1',
  estimate: '2',
  municipal_microenterprise: '3',
  notary: '4',
  self_employed: '5',
  professionals_society: '6',
  other: '9',
} as const;

const issqnCode = {
  taxable: '1',
  immunity: '2',
  export: '3',
  non_incidence: '4',
} as const;

export interface NfseTransportResult {
  statusCode: number;
  body: string;
}

export type NfseTransport = (input: {
  endpoint: string;
  body: string;
  certificatePem: string;
  privateKeyPem: string;
}) => Promise<NfseTransportResult>;

export type NfseCertificate = {
  certificatePem: string;
  privateKeyPem: string;
  taxId: string;
};

type CertificateLoader = (
  tenantId: string,
  environment: NfseEnvironment,
) => Promise<NfseCertificate>;

let transport: NfseTransport = postNfse;
let loadCertificate: CertificateLoader = certificateMaterial;

export function setNfseTransportForTests(next: NfseTransport | null) {
  transport = next ?? postNfse;
}

export function setNfseCertificateLoaderForTests(next: CertificateLoader | null) {
  loadCertificate = next ?? certificateMaterial;
}

function httpError(message: string, status: number): never {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  throw error;
}

function certificateMessage(error: unknown): never {
  if (error instanceof InboundError) {
    httpError(error.message.replace(' da NF-e', ''), error.status);
  }
  throw error;
}

function postNfse(input: {
  endpoint: string;
  body: string;
  certificatePem: string;
  privateKeyPem: string;
}) {
  const url = new URL(input.endpoint);
  // A Sefin é IIS com renegociação TLS 1.2: o certificado de cliente só é pedido
  // depois do HTTP. O Agent com TLS 1.2 e sigalgs PKCS#1 é o equivalente prático
  // do SSLLib/HTTPLib do ACBr neste runtime.
  const agent = new https.Agent({
    cert: input.certificatePem,
    key: input.privateKeyPem,
    ca: trustedCertificates(),
    minVersion: 'TLSv1.2',
    maxVersion: 'TLSv1.2',
    sigalgs: 'RSA+SHA256:RSA+SHA384:RSA+SHA512',
  });
  return new Promise<NfseTransportResult>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      callback();
    };
    const request = https.request(
      {
        agent,
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: 'POST',
        rejectUnauthorized: true,
        timeout: 30_000,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          Accept: 'application/json',
          'Content-Length': String(Buffer.byteLength(input.body)),
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          if (size >= 1_000_000) return;
          const piece = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          chunks.push(piece);
          size += piece.length;
        });
        response.on('end', () => {
          agent.destroy();
          finish(() =>
            resolve({
              statusCode: response.statusCode ?? 0,
              body: Buffer.concat(chunks).subarray(0, 1_000_000).toString('utf8'),
            }),
          );
        });
      },
    );
    request.on('timeout', () => {
      request.destroy();
      agent.destroy();
      finish(() => reject(new Error('Tempo esgotado ao conectar no serviço.')));
    });
    request.on('error', (error) => {
      agent.destroy();
      finish(() => reject(error));
    });
    request.write(input.body);
    request.end();
  });
}

function connectionMessage(error: unknown) {
  if (error instanceof Error && error.message === 'Tempo esgotado ao conectar no serviço.') {
    return error.message;
  }
  return 'Não foi possível conectar ao ambiente nacional da NFS-e.';
}

function unreachableMessage(environment: 'homologation' | 'production', statusCode: number) {
  const place = environment === 'homologation' ? 'A homologação' : 'A produção';
  if (statusCode === 401 || statusCode === 403) {
    return `${place} recusou o certificado desta empresa. Nada foi autorizado.`;
  }
  return `${place} não respondeu a declaração. Nada foi autorizado.`;
}

function sameText(values: (string | null)[]) {
  const present = values.filter((value): value is string => value != null);
  if (present.length === 0) return null;
  if (present.length !== values.length) return 'mixed' as const;
  return present.every((value) => value === present[0]) ? present[0] : ('mixed' as const);
}

function sameRate(values: (string | null)[]) {
  if (values.every((value) => value == null)) return null;
  if (values.some((value) => value == null)) return 'mixed' as const;
  const first = Number(values[0]);
  return values.every((value) => Number(value) === first) ? values[0] : ('mixed' as const);
}

async function explainClaimMiss(tenantId: string, requestId: string): Promise<never> {
  const [row] = await db
    .select({ status: nfseRequests.status, claimedAt: nfseRequests.claimedAt })
    .from(nfseRequests)
    .where(and(eq(nfseRequests.id, requestId), eq(nfseRequests.tenantId, tenantId)))
    .limit(1);
  if (!row) httpError(messages.missingRequest, 400);
  if (row.status === 'authorized') httpError(messages.authorized, 409);
  if (row.status === 'canceled') httpError(messages.canceled, 400);
  if (row.claimedAt && row.claimedAt.getTime() > Date.now() - 120_000) {
    httpError(messages.busy, 409);
  }
  httpError(messages.busy, 409);
}

export async function sendServiceOrderNfse(tenantId: string, orderId: string) {
  const [order] = await db
    .select({ id: serviceOrders.id, personId: serviceOrders.personId })
    .from(serviceOrders)
    .where(and(eq(serviceOrders.id, orderId), eq(serviceOrders.tenantId, tenantId)))
    .limit(1);
  if (!order) httpError(messages.missingOrder, 404);

  const [document] = await db
    .select({ id: billingDocuments.id })
    .from(billingDocuments)
    .where(
      and(
        eq(billingDocuments.tenantId, tenantId),
        eq(billingDocuments.serviceOrderId, orderId),
        eq(billingDocuments.commercialStatus, 'issued'),
      ),
    )
    .limit(1);
  if (!document) httpError(messages.missingDocument, 400);

  const [request] = await db
    .select({
      id: nfseRequests.id,
      status: nfseRequests.status,
      serviceAmount: nfseRequests.serviceAmount,
    })
    .from(nfseRequests)
    .where(
      and(eq(nfseRequests.tenantId, tenantId), eq(nfseRequests.billingDocumentId, document.id)),
    )
    .limit(1);
  if (!request) httpError(messages.missingRequest, 400);
  if (request.status === 'authorized') httpError(messages.authorized, 409);
  if (request.status === 'canceled') httpError(messages.canceled, 400);

  const [settings] = await db
    .select()
    .from(nfseSettings)
    .where(eq(nfseSettings.tenantId, tenantId))
    .limit(1);
  if (!settings?.series) httpError(messages.series, 400);

  const lines = await db
    .select({
      description: nfseRequestLines.description,
      nationalServiceCode: nfseRequestLines.nationalServiceCode,
      municipalServiceCode: nfseRequestLines.municipalServiceCode,
      issRate: nfseRequestLines.issRate,
    })
    .from(nfseRequestLines)
    .where(
      and(eq(nfseRequestLines.tenantId, tenantId), eq(nfseRequestLines.requestId, request.id)),
    );
  const national = sameText(lines.map((line) => line.nationalServiceCode));
  if (national == null) httpError(messages.national, 400);
  if (national === 'mixed') httpError(messages.nationalMixed, 400);
  const municipal = sameText(lines.map((line) => line.municipalServiceCode));
  if (municipal === 'mixed') httpError(messages.municipalMixed, 400);
  const issRate = sameRate(lines.map((line) => line.issRate));
  if (issRate === 'mixed') httpError(messages.rateMixed, 400);
  if (issRate && Number(issRate) > 5) httpError(messages.rateHigh, 400);
  const description = lines
    .map((line) => line.description.trim())
    .filter(Boolean)
    .join(' | ');
  if (description.length === 0 || description.length > 2000) httpError(messages.description, 400);

  const [company] = await db
    .select({
      cnpj: tenants.cnpj,
      municipalRegistration: tenants.municipalRegistration,
      cityCode: cities.code,
    })
    .from(tenants)
    .leftJoin(cities, eq(tenants.cityId, cities.id))
    .where(eq(tenants.id, tenantId))
    .limit(1);
  if (!company?.cnpj || !/^[0-9]{14}$/.test(company.cnpj)) httpError(messages.cnpj, 400);
  if (!company.cityCode || !/^[0-9]{7}$/.test(company.cityCode)) httpError(messages.city, 400);

  const [person] = await db
    .select({ type: persons.type, name: persons.name, taxId: persons.taxId })
    .from(persons)
    .where(and(eq(persons.id, order.personId), eq(persons.tenantId, tenantId)))
    .limit(1);
  if (!person) httpError(messages.tomador, 400);
  if (person.type === 'foreigner') httpError(messages.foreigner, 400);
  const taxId = (person.taxId ?? '').replace(/\D/g, '');
  const tomadorKind = taxId.length === 11 ? 'cpf' : taxId.length === 14 ? 'cnpj' : null;
  if (!tomadorKind) httpError(messages.tomador, 400);

  let material: NfseCertificate;
  try {
    material = await loadCertificate(tenantId, settings.environment);
  } catch (error) {
    certificateMessage(error);
  }
  if (material.taxId !== company.cnpj) httpError(messages.certificateCnpj, 400);

  const reserved = await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(nfseRequests)
      .set({ claimedAt: new Date() })
      .where(
        and(
          eq(nfseRequests.id, request.id),
          eq(nfseRequests.tenantId, tenantId),
          inArray(nfseRequests.status, ['pending', 'rejected']),
          or(
            isNull(nfseRequests.claimedAt),
            sql`${nfseRequests.claimedAt} < now() - interval '2 minutes'`,
          ),
        ),
      )
      .returning({
        series: nfseRequests.series,
        dpsNumber: nfseRequests.dpsNumber,
        dpsId: nfseRequests.dpsId,
        environment: nfseRequests.environment,
      });
    if (!claimed) return null;
    if (claimed.dpsNumber && claimed.series && claimed.dpsId && claimed.environment) {
      return claimed;
    }

    await tx
      .insert(nfseDpsCounters)
      .values({ tenantId, series: settings.series, lastNumber: 0 })
      .onConflictDoNothing();
    const [counter] = await tx
      .update(nfseDpsCounters)
      .set({ lastNumber: sql`${nfseDpsCounters.lastNumber} + 1` })
      .where(
        and(eq(nfseDpsCounters.tenantId, tenantId), eq(nfseDpsCounters.series, settings.series)),
      )
      .returning({ lastNumber: nfseDpsCounters.lastNumber });
    if (!counter) throw new Error('Não foi possível numerar a NFS-e.');
    const identity = {
      series: settings.series,
      dpsNumber: counter.lastNumber,
      dpsId: nfseDpsId({
        cityCode: company.cityCode,
        cnpj: company.cnpj,
        series: settings.series,
        dpsNumber: counter.lastNumber,
      }),
      environment: settings.environment,
    };
    await tx
      .update(nfseRequests)
      .set(identity)
      .where(and(eq(nfseRequests.id, request.id), eq(nfseRequests.tenantId, tenantId)));
    return identity;
  });
  if (!reserved || !reserved.series || !reserved.dpsNumber || !reserved.environment) {
    await explainClaimMiss(tenantId, request.id);
  }

  const draft: NfseDpsDraft = {
    environment: reserved.environment,
    emittedAt: nfeEventTimestamp(new Date()),
    series: reserved.series,
    dpsNumber: reserved.dpsNumber,
    cityCode: company.cityCode,
    cnpj: company.cnpj,
    municipalRegistration: company.municipalRegistration,
    simplesNacional: simplesCode[settings.simplesNacional],
    simplesAssessment: settings.simplesAssessment
      ? assessmentCode[settings.simplesAssessment]
      : null,
    specialTaxRegime: regimeCode[settings.specialTaxRegime],
    issqnTaxation: issqnCode[settings.issqnTaxation],
    tomador: { kind: tomadorKind, taxId, name: person.name.slice(0, 150) },
    nationalServiceCode: national,
    municipalServiceCode: municipal,
    description,
    issRate,
    serviceAmountCents: request.serviceAmount,
    privateKeyPem: material.privateKeyPem,
    certificatePem: material.certificatePem,
  };

  let response: NfseTransportResult;
  try {
    const signed = buildSignedDps(draft);
    response = await transport({
      endpoint: nfseSubmissionEndpoint(reserved.environment),
      body: signed.body,
      certificatePem: material.certificatePem,
      privateKeyPem: material.privateKeyPem,
    });
  } catch (error) {
    const message = connectionMessage(error).slice(0, 2000);
    await db
      .update(nfseRequests)
      .set({ claimedAt: null, statusMessage: message })
      .where(and(eq(nfseRequests.id, request.id), eq(nfseRequests.tenantId, tenantId)));
    httpError(message, 502);
  }

  const result = readNfseSubmission(response.statusCode, response.body);
  if (result.outcome === 'unreachable') {
    const message = unreachableMessage(reserved.environment, response.statusCode).slice(0, 2000);
    await db.transaction(async (tx) => {
      await tx
        .update(nfseRequests)
        .set({
          status: 'pending',
          accessKey: null,
          nfseXml: null,
          statusMessage: message,
          sentAt: new Date(),
          claimedAt: null,
        })
        .where(and(eq(nfseRequests.id, request.id), eq(nfseRequests.tenantId, tenantId)));
      await tx
        .update(billingDocuments)
        .set({ fiscalStatus: 'pending' })
        .where(and(eq(billingDocuments.id, document.id), eq(billingDocuments.tenantId, tenantId)));
    });
    httpError(message, 502);
  }

  const statusMessage = result.outcome === 'authorized' ? null : result.message.slice(0, 2000);
  await db.transaction(async (tx) => {
    await tx
      .update(nfseRequests)
      .set({
        status: result.outcome === 'authorized' ? 'authorized' : 'rejected',
        accessKey: result.accessKey,
        nfseXml: result.xml,
        statusMessage,
        sentAt: new Date(),
        claimedAt: null,
      })
      .where(and(eq(nfseRequests.id, request.id), eq(nfseRequests.tenantId, tenantId)));
    await tx
      .update(billingDocuments)
      .set({ fiscalStatus: result.outcome === 'authorized' ? 'authorized' : 'rejected' })
      .where(and(eq(billingDocuments.id, document.id), eq(billingDocuments.tenantId, tenantId)));
  });

  return {
    requestId: request.id,
    message:
      result.outcome === 'authorized'
        ? reserved.environment === 'homologation'
          ? messages.doneHomologation
          : messages.doneProduction
        : result.message,
  };
}
