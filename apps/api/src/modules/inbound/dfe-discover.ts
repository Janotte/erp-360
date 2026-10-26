import { dfeDocuments, inboundDocuments } from '@erp-360/mod-inbound';
import type { CertificateEnvironment } from '@erp-360/shared';
import { and, desc, eq } from 'drizzle-orm';

import { db } from '../../db/index.ts';
import { dfeDistributionRequest, parseDfeDistribution } from './dfe.ts';
import {
  awarenessEventRequest,
  nfeEventTimestamp,
  parseAwarenessEvent,
  recipientManifestDocument,
} from './dfe-event.ts';
import { recordRecipientManifestation } from './dfe-manifest.ts';
import { discoveryAction } from './dfe-note.ts';
import { saveDfeDistribution } from './dfe-store.ts';
import { certificateMaterial, emitterStateCode } from './dfe-sync.ts';
import { InboundError } from './errors.ts';
import { parseNfeXml } from './nfe.ts';
import { getOrCreateNfeSettings } from './nfe-settings.ts';
import { persistParsedNfe } from './persist-nfe.ts';

const awareMessage =
  'A ciência foi registrada. O XML completo ainda não está disponível.';
const downloadMessage = 'O XML completo ainda não está disponível.';
const notDiscovered = 'Esta nota não está descoberta.';

type SefazPost = (request: {
  endpoint: string;
  body: string;
  headers: Record<string, string>;
}) => Promise<string>;

export type InboundDiscovery =
  { outcome: 'imported' } | { outcome: 'aware'; message: string };

async function importCompleteNfe(tenantId: string, documentId: string, xml: string) {
  const parsed = parseNfeXml(xml);
  await db.transaction(async (tx) => {
    await persistParsedNfe(
      tx,
      tenantId,
      parsed,
      Buffer.from(xml, 'utf8'),
      'nfe.xml',
      documentId,
    );
  });
}

async function sefazParties(
  tenantId: string,
  environment: CertificateEnvironment,
  deps?: {
    material?: { certificatePem: string; privateKeyPem: string; taxId: string };
    emitter?: { cnpj: string; cUF: string | null };
  },
) {
  const material = deps?.material ?? (await certificateMaterial(tenantId, environment));
  const emitter = deps?.emitter ?? (await emitterStateCode(tenantId));
  if (!emitter.cUF) {
    throw new InboundError(400, 'Cadastre a UF do emitente para consultar o DF-e.');
  }
  if (material.taxId !== emitter.cnpj) {
    throw new InboundError(400, 'O certificado não é do CNPJ desta empresa.');
  }
  return { material, emitter, cUF: emitter.cUF };
}

export async function discoverInboundDocument(
  tenantId: string,
  documentId: string,
  post: SefazPost,
  deps?: {
    material?: { certificatePem: string; privateKeyPem: string; taxId: string };
    emitter?: { cnpj: string; cUF: string | null };
  },
): Promise<InboundDiscovery> {
  const [document] = await db
    .select({
      id: inboundDocuments.id,
      status: inboundDocuments.status,
      accessKey: inboundDocuments.accessKey,
      authorizationStatus: inboundDocuments.authorizationStatus,
      recipientManifestation: inboundDocuments.recipientManifestation,
    })
    .from(inboundDocuments)
    .where(
      and(eq(inboundDocuments.id, documentId), eq(inboundDocuments.tenantId, tenantId)),
    )
    .limit(1);
  if (!document) throw new InboundError(404, 'Nota não encontrada.');

  const settings = await getOrCreateNfeSettings(tenantId);
  const [archived] = document.accessKey
    ? await db
        .select({ xml: dfeDocuments.xml })
        .from(dfeDocuments)
        .where(
          and(
            eq(dfeDocuments.tenantId, tenantId),
            eq(dfeDocuments.environment, settings.environment),
            eq(dfeDocuments.accessKey, document.accessKey),
            eq(dfeDocuments.kind, 'nfe'),
          ),
        )
        .orderBy(desc(dfeDocuments.nsu))
        .limit(1)
    : [];
  const action = discoveryAction({
    status: document.status,
    authorizationStatus: document.authorizationStatus,
    recipientManifestation: document.recipientManifestation,
    hasCompleteXml: Boolean(archived),
  });
  if (action.kind === 'blocked') throw new InboundError(400, action.message);
  if (action.kind === 'none') throw new InboundError(400, notDiscovered);
  if (action.kind === 'import') {
    if (!archived) throw new InboundError(400, notDiscovered);
    await importCompleteNfe(tenantId, document.id, archived.xml);
    return { outcome: 'imported' };
  }
  if (!document.accessKey) throw new InboundError(400, notDiscovered);

  const { material, emitter, cUF } = await sefazParties(
    tenantId,
    settings.environment,
    deps,
  );
  if (action.kind === 'manifest') {
    const request = awarenessEventRequest({
      environment: settings.environment,
      cnpj: emitter.cnpj,
      accessKey: document.accessKey,
      at: nfeEventTimestamp(new Date()),
      privateKeyPem: material.privateKeyPem,
      certificatePem: material.certificatePem,
    });
    const body = await post(request);
    const event = parseAwarenessEvent(body);
    if (!event.accepted) throw new InboundError(502, event.reason);
    await recordRecipientManifestation(
      tenantId,
      document.id,
      'aware',
      recipientManifestDocument(request.body, body),
    );
  }

  const distribution = parseDfeDistribution(
    await post(
      dfeDistributionRequest({
        cUF,
        cnpj: emitter.cnpj,
        environment: settings.environment,
        query: { kind: 'accessKey', accessKey: document.accessKey },
      }),
    ),
  );
  await saveDfeDistribution(tenantId, settings.environment, distribution);
  const complete = distribution.documents.find((item) => item.kind === 'nfe');
  if (complete) {
    await importCompleteNfe(tenantId, document.id, complete.xml);
    return { outcome: 'imported' };
  }
  return {
    outcome: 'aware',
    message: action.kind === 'download' ? downloadMessage : awareMessage,
  };
}
