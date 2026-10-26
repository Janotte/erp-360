import { tenants } from '@erp-360/mod-core';
import { dfeCursors, dfeDocuments } from '@erp-360/mod-inbound';
import type { CertificateEnvironment } from '@erp-360/shared';
import { and, eq, sql } from 'drizzle-orm';

import { db, type DbTransaction } from '../../db/index.ts';
import type { DfeDistribution } from './dfe.ts';
import { promoteDfeNotes } from './dfe-promote.ts';

function laterNsu(current: string, incoming: string | null) {
  if (!incoming || !/^[0-9]{15}$/.test(incoming)) return current;
  return incoming > current ? incoming : current;
}

async function ensureCursor(
  client: typeof db | DbTransaction,
  tenantId: string,
  environment: CertificateEnvironment,
) {
  await client.insert(dfeCursors).values({ tenantId, environment }).onConflictDoNothing();
  const [cursor] = await client
    .select()
    .from(dfeCursors)
    .where(
      and(eq(dfeCursors.tenantId, tenantId), eq(dfeCursors.environment, environment)),
    )
    .limit(1);
  if (!cursor)
    throw new Error('Não foi possível abrir o cursor da distribuição de DF-e.');
  return cursor;
}

export async function getOrCreateDfeCursor(
  tenantId: string,
  environment: CertificateEnvironment,
) {
  return ensureCursor(db, tenantId, environment);
}

/** Grava os documentos e só avança o NSU. Uma consulta antiga não recua o cursor. */
export async function saveDfeDistribution(
  tenantId: string,
  environment: CertificateEnvironment,
  distribution: DfeDistribution,
  queriedAt = new Date(),
) {
  return db.transaction(async (tx) => {
    const cursor = await ensureCursor(tx, tenantId, environment);
    if (distribution.documents.length > 0) {
      await tx
        .insert(dfeDocuments)
        .values(
          distribution.documents.map((document) => ({
            tenantId,
            environment,
            nsu: document.nsu,
            schemaName: document.schema.slice(0, 60),
            kind: document.kind,
            accessKey: document.accessKey,
            xml: document.xml,
          })),
        )
        .onConflictDoUpdate({
          target: [dfeDocuments.tenantId, dfeDocuments.environment, dfeDocuments.nsu],
          set: {
            schemaName: sql`excluded.schema_name`,
            kind: sql`excluded.kind`,
            accessKey: sql`excluded.access_key`,
            xml: sql`excluded.xml`,
          },
        });
    }
    const [updated] = await tx
      .update(dfeCursors)
      .set({
        ultNsu: laterNsu(cursor.ultNsu, distribution.ultNsu),
        maxNsu: laterNsu(cursor.maxNsu, distribution.maxNsu),
        lastStatus: distribution.cStat,
        queriedAt,
      })
      .where(
        and(eq(dfeCursors.tenantId, tenantId), eq(dfeCursors.environment, environment)),
      )
      .returning();
    const [tenant] = await tx
      .select({ cnpj: tenants.cnpj })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    await promoteDfeNotes(
      tx,
      tenantId,
      environment,
      tenant?.cnpj ?? '',
      distribution.documents,
    );
    return updated;
  });
}
