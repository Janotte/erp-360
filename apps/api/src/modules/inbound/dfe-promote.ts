import { dfeDocuments, inboundDocuments } from '@erp-360/mod-inbound';
import type { CertificateEnvironment } from '@erp-360/shared';
import { and, eq, inArray } from 'drizzle-orm';

import type { DbClient } from '../../db/index.ts';
import {
  type NfeAuthorizationStatus,
  readDfeNote,
  type RecipientManifestation,
} from './dfe-note.ts';

type DfeNote = ReturnType<typeof readDfeNote>;

export async function promoteDfeNotes(
  client: DbClient,
  tenantId: string,
  environment: CertificateEnvironment,
  tenantCnpj: string,
  documents: { kind: string; accessKey: string | null; xml: string }[],
) {
  const byKey = new Map<string, DfeNote[]>();
  for (const document of documents) {
    const note = readDfeNote(document.kind, document.xml);
    if (!note.accessKey || note.role === 'ignore') continue;
    const group = byKey.get(note.accessKey) ?? [];
    group.push(note);
    byKey.set(note.accessKey, group);
  }

  const keys = [...byKey.keys()];
  if (keys.length > 0) {
    const archived = await client
      .select({
        kind: dfeDocuments.kind,
        xml: dfeDocuments.xml,
      })
      .from(dfeDocuments)
      .where(
        and(
          eq(dfeDocuments.tenantId, tenantId),
          eq(dfeDocuments.environment, environment),
          inArray(dfeDocuments.accessKey, keys),
          inArray(dfeDocuments.kind, ['event', 'event_summary']),
        ),
      );
    for (const document of archived) {
      const note = readDfeNote(document.kind, document.xml);
      if (!note.accessKey || note.role !== 'event') continue;
      byKey.get(note.accessKey)?.push(note);
    }
  }

  for (const [accessKey, notes] of byKey) {
    const nfes = notes.filter((note) => note.role === 'nfe');
    if (nfes.some((note) => note.emitterTaxId === tenantCnpj)) continue;
    const nfe = nfes.find((note) => note.issueOn) ?? nfes[0];
    const events = notes
      .filter((note) => note.role === 'event' && note.manifestation)
      .sort((left, right) => (left.eventAt ?? '').localeCompare(right.eventAt ?? ''));
    const manifestation = events.at(-1)?.manifestation ?? null;
    const [existing] = await client
      .select({
        id: inboundDocuments.id,
        status: inboundDocuments.status,
      })
      .from(inboundDocuments)
      .where(
        and(
          eq(inboundDocuments.tenantId, tenantId),
          eq(inboundDocuments.accessKey, accessKey),
        ),
      )
      .limit(1);

    if (!existing) {
      if (!nfe?.issueOn) continue;
      await client.insert(inboundDocuments).values({
        tenantId,
        status: 'discovered',
        accessKey,
        number: nfe.number || '0',
        series: nfe.series || '0',
        issueOn: nfe.issueOn,
        supplierTaxId: nfe.emitterTaxId,
        supplierName: nfe.emitterName?.slice(0, 120) ?? null,
        totalAmount: nfe.amount ?? 0,
        recipientManifestation: manifestation ?? 'none',
        authorizationStatus: nfe.authorizationStatus,
      });
      continue;
    }

    const patch: {
      recipientManifestation?: RecipientManifestation;
      authorizationStatus?: NfeAuthorizationStatus;
      supplierName?: string;
      totalAmount?: number;
    } = {};
    if (manifestation) patch.recipientManifestation = manifestation;
    if (existing.status === 'discovered' && nfe) {
      patch.authorizationStatus = nfe.authorizationStatus;
      if (nfe.emitterName) patch.supplierName = nfe.emitterName.slice(0, 120);
      if (nfe.amount != null) patch.totalAmount = nfe.amount;
    }
    if (Object.keys(patch).length === 0) continue;
    await client
      .update(inboundDocuments)
      .set(patch)
      .where(eq(inboundDocuments.id, existing.id));
  }
}
