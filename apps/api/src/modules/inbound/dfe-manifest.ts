import { createHash } from 'node:crypto';

import {
  dfeDocuments,
  inboundDocumentFiles,
  inboundDocuments,
} from '@erp-360/mod-inbound';
import { and, desc, eq, inArray, ne } from 'drizzle-orm';

import { db } from '../../db/index.ts';
import { type DanfeView, readDanfe } from './dfe-danfe.ts';
import {
  nfeEventTimestamp,
  parseAwarenessEvent,
  recipientEventRequest,
  recipientManifestDocument,
  type RecipientManifestKind,
} from './dfe-event.ts';
import { type InboundEventView, readInboundEvent } from './dfe-note.ts';
import { certificateMaterial, emitterStateCode } from './dfe-sync.ts';
import { InboundError } from './errors.ts';
import { getOrCreateNfeSettings } from './nfe-settings.ts';

export const manifestationFileName = 'erp360-manifestacao-destinatario.xml';

const manifestationCodes = ['210200', '210210', '210220', '210240'] as const;

type SefazPost = (request: {
  endpoint: string;
  body: string;
  headers: Record<string, string>;
}) => Promise<string>;

function xmlText(content: unknown) {
  if (typeof content === 'string') return content;
  if (Buffer.isBuffer(content)) return content.toString('utf8');
  if (content instanceof Uint8Array) return Buffer.from(content).toString('utf8');
  return '';
}

async function requireNote(tenantId: string, documentId: string) {
  const [document] = await db
    .select({
      id: inboundDocuments.id,
      accessKey: inboundDocuments.accessKey,
      authorizationStatus: inboundDocuments.authorizationStatus,
    })
    .from(inboundDocuments)
    .where(
      and(eq(inboundDocuments.id, documentId), eq(inboundDocuments.tenantId, tenantId)),
    )
    .limit(1);
  if (!document) throw new InboundError(404, 'Nota não encontrada.');
  return document;
}

function requireAccessKey(accessKey: string | null) {
  if (!accessKey) throw new InboundError(400, 'Esta nota não tem chave de acesso.');
  return accessKey;
}

export function requiredJustification(value: string | undefined) {
  const text = (value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length < 15 || text.length > 255) {
    throw new InboundError(
      400,
      'A justificativa da operação não realizada precisa ter entre 15 e 255 caracteres.',
    );
  }
  return text;
}

export async function recordRecipientManifestation(
  tenantId: string,
  documentId: string,
  kind: RecipientManifestKind,
  xml: string,
) {
  const content = Buffer.from(xml, 'utf8');
  await db.transaction(async (tx) => {
    await tx
      .update(inboundDocuments)
      .set({ recipientManifestation: kind })
      .where(
        and(eq(inboundDocuments.id, documentId), eq(inboundDocuments.tenantId, tenantId)),
      );
    await tx
      .delete(inboundDocumentFiles)
      .where(
        and(
          eq(inboundDocumentFiles.documentId, documentId),
          eq(inboundDocumentFiles.tenantId, tenantId),
          eq(inboundDocumentFiles.fileName, manifestationFileName),
        ),
      );
    await tx.insert(inboundDocumentFiles).values({
      tenantId,
      documentId,
      content,
      sha256: createHash('sha256').update(content).digest('hex'),
      fileName: manifestationFileName,
    });
  });
}

async function readManifestationFile(tenantId: string, documentId: string) {
  const [file] = await db
    .select({ content: inboundDocumentFiles.content })
    .from(inboundDocumentFiles)
    .where(
      and(
        eq(inboundDocumentFiles.documentId, documentId),
        eq(inboundDocumentFiles.tenantId, tenantId),
        eq(inboundDocumentFiles.fileName, manifestationFileName),
      ),
    )
    .limit(1);
  if (!file) return null;
  return xmlText(file.content) || null;
}

async function distributedEvents(tenantId: string, accessKey: string) {
  const settings = await getOrCreateNfeSettings(tenantId);
  return db
    .select({ xml: dfeDocuments.xml })
    .from(dfeDocuments)
    .where(
      and(
        eq(dfeDocuments.tenantId, tenantId),
        eq(dfeDocuments.environment, settings.environment),
        eq(dfeDocuments.accessKey, accessKey),
        inArray(dfeDocuments.kind, ['event', 'event_summary']),
      ),
    )
    .orderBy(desc(dfeDocuments.createdAt));
}

export async function listInboundEvents(
  tenantId: string,
  documentId: string,
): Promise<InboundEventView[]> {
  const document = await requireNote(tenantId, documentId);
  const xmls: string[] = [];
  if (document.accessKey) {
    const rows = await distributedEvents(tenantId, document.accessKey);
    xmls.push(...rows.map((row) => row.xml));
  }
  const local = await readManifestationFile(tenantId, documentId);
  if (local) xmls.push(local);

  const events: InboundEventView[] = [];
  const seen = new Set<string>();
  for (const xml of xmls) {
    const event = readInboundEvent(xml);
    if (!event) continue;
    const id = `${event.code}|${event.at ?? ''}|${event.protocol ?? ''}`;
    if (seen.has(id)) continue;
    seen.add(id);
    events.push(event);
  }
  events.sort((left, right) => (right.at ?? '').localeCompare(left.at ?? ''));
  return events;
}

export async function loadManifestationXml(tenantId: string, documentId: string) {
  const document = await requireNote(tenantId, documentId);
  const local = await readManifestationFile(tenantId, documentId);
  if (local) return local;
  if (!document.accessKey) {
    throw new InboundError(
      404,
      'Não há XML de manifestação do destinatário para esta nota.',
    );
  }
  const rows = await distributedEvents(tenantId, document.accessKey);
  const found = rows.find((row) =>
    manifestationCodes.some((code) => row.xml.includes(`<tpEvento>${code}</tpEvento>`)),
  );
  if (!found) {
    throw new InboundError(
      404,
      'Não há XML de manifestação do destinatário para esta nota.',
    );
  }
  return found.xml;
}

async function completeNfeXml(
  tenantId: string,
  documentId: string,
  accessKey: string | null,
) {
  const files = await db
    .select({ content: inboundDocumentFiles.content })
    .from(inboundDocumentFiles)
    .where(
      and(
        eq(inboundDocumentFiles.documentId, documentId),
        eq(inboundDocumentFiles.tenantId, tenantId),
        ne(inboundDocumentFiles.fileName, manifestationFileName),
      ),
    )
    .limit(5);
  for (const file of files) {
    const xml = xmlText(file.content);
    if (xml.includes('infNFe')) return xml;
  }
  if (!accessKey) return null;
  const settings = await getOrCreateNfeSettings(tenantId);
  const [row] = await db
    .select({ xml: dfeDocuments.xml })
    .from(dfeDocuments)
    .where(
      and(
        eq(dfeDocuments.tenantId, tenantId),
        eq(dfeDocuments.environment, settings.environment),
        eq(dfeDocuments.accessKey, accessKey),
        eq(dfeDocuments.kind, 'nfe'),
      ),
    )
    .orderBy(desc(dfeDocuments.nsu))
    .limit(1);
  return row?.xml ?? null;
}

export async function loadInboundDanfe(
  tenantId: string,
  documentId: string,
): Promise<DanfeView> {
  const document = await requireNote(tenantId, documentId);
  const xml = await completeNfeXml(tenantId, documentId, document.accessKey);
  if (!xml) {
    throw new InboundError(404, 'O XML completo desta NF-e ainda não está disponível.');
  }
  const danfe = readDanfe(xml);
  if (!danfe) throw new InboundError(400, 'O XML desta nota não contém um DANFE.');
  return danfe;
}

export async function manifestInboundDocument(
  tenantId: string,
  documentId: string,
  input: { kind: RecipientManifestKind; justification?: string },
  post: SefazPost,
) {
  const document = await requireNote(tenantId, documentId);
  const accessKey = requireAccessKey(document.accessKey);
  if (document.authorizationStatus === 'cancelled') {
    throw new InboundError(400, 'Esta NF-e está cancelada na SEFAZ.');
  }
  if (document.authorizationStatus === 'denied') {
    throw new InboundError(400, 'Esta NF-e está denegada na SEFAZ.');
  }
  const justification =
    input.kind === 'not_performed'
      ? requiredJustification(input.justification)
      : undefined;

  const settings = await getOrCreateNfeSettings(tenantId);
  const material = await certificateMaterial(tenantId, settings.environment);
  const emitter = await emitterStateCode(tenantId);
  if (material.taxId !== emitter.cnpj) {
    throw new InboundError(400, 'O certificado não é do CNPJ desta empresa.');
  }
  const request = recipientEventRequest({
    environment: settings.environment,
    cnpj: emitter.cnpj,
    accessKey,
    at: nfeEventTimestamp(new Date()),
    kind: input.kind,
    justification,
    privateKeyPem: material.privateKeyPem,
    certificatePem: material.certificatePem,
  });
  const body = await post(request);
  const event = parseAwarenessEvent(body);
  if (!event.accepted) throw new InboundError(502, event.reason);
  await recordRecipientManifestation(
    tenantId,
    document.id,
    input.kind,
    recipientManifestDocument(request.body, body),
  );
  return {
    recipientManifestation: input.kind,
    status: event.status,
    reason: event.reason,
  };
}
