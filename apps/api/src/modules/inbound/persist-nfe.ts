import { createHash } from 'node:crypto';

import { catalogItems } from '@erp-360/mod-catalog';
import {
  inboundDocumentFiles,
  inboundDocumentInstallments,
  inboundDocumentLines,
  inboundDocuments,
  supplierItemLinks,
} from '@erp-360/mod-inbound';
import { persons } from '@erp-360/mod-persons';
import { and, eq } from 'drizzle-orm';

import type { DbClient } from '../../db/index.ts';
import { InboundError } from './errors.ts';
import type { ParsedNfe } from './nfe.ts';

const occupied = 'Esta nota já está na entrada.';

function documentValues(tenantId: string, parsed: ParsedNfe, supplierId: string | null) {
  return {
    tenantId,
    status: parsed.hasProtocol ? ('pre_note' as const) : ('divergent' as const),
    model: '55',
    accessKey: parsed.accessKey,
    number: parsed.number || '0',
    series: parsed.series || '0',
    issueOn: parsed.issueOn,
    supplierId,
    supplierTaxId: parsed.supplierTaxId,
    supplierName: parsed.supplierName,
    hasProtocol: parsed.hasProtocol,
    totalAmount: parsed.totalAmount,
  };
}

async function insertLines(
  client: DbClient,
  tenantId: string,
  documentId: string,
  parsed: ParsedNfe,
  supplierId: string | null,
) {
  for (const line of parsed.lines) {
    let itemId: string | null = null;
    let factor = '1.000000';
    if (supplierId) {
      const [link] = await client
        .select({
          itemId: supplierItemLinks.itemId,
          factor: supplierItemLinks.factor,
        })
        .from(supplierItemLinks)
        .where(
          and(
            eq(supplierItemLinks.tenantId, tenantId),
            eq(supplierItemLinks.supplierId, supplierId),
            eq(supplierItemLinks.supplierCode, line.supplierCode),
          ),
        )
        .limit(1);
      if (link) {
        itemId = link.itemId;
        factor = link.factor;
      }
    }
    if (!itemId && line.barcode) {
      const [item] = await client
        .select({ id: catalogItems.id })
        .from(catalogItems)
        .where(
          and(
            eq(catalogItems.tenantId, tenantId),
            eq(catalogItems.barcode, line.barcode),
          ),
        )
        .limit(1);
      if (item) itemId = item.id;
    }
    const entryCfop = ['1', '2', '3'].includes(line.xmlCfop[0] ?? '')
      ? line.xmlCfop
      : null;
    await client.insert(inboundDocumentLines).values({
      tenantId,
      documentId,
      ...line,
      factor,
      itemId,
      entryCfop,
    });
  }
}

/** Grava a NF-e lida. Com id, só substitui uma linha que ainda está descoberta. */
export async function persistParsedNfe(
  client: DbClient,
  tenantId: string,
  parsed: ParsedNfe,
  content: Buffer,
  fileName: string,
  documentId?: string,
) {
  const [supplier] = await client
    .select({ id: persons.id })
    .from(persons)
    .where(and(eq(persons.tenantId, tenantId), eq(persons.taxId, parsed.supplierTaxId)))
    .limit(1);
  const supplierId = supplier?.id ?? null;
  const values = documentValues(tenantId, parsed, supplierId);

  let id = documentId;
  if (!id) {
    const [created] = await client
      .insert(inboundDocuments)
      .values(values)
      .returning({ id: inboundDocuments.id });
    id = created.id;
  } else {
    const [updated] = await client
      .update(inboundDocuments)
      .set(values)
      .where(
        and(
          eq(inboundDocuments.id, id),
          eq(inboundDocuments.tenantId, tenantId),
          eq(inboundDocuments.status, 'discovered'),
        ),
      )
      .returning({ id: inboundDocuments.id });
    if (!updated) throw new InboundError(409, occupied);
    await client
      .delete(inboundDocumentInstallments)
      .where(
        and(
          eq(inboundDocumentInstallments.documentId, id),
          eq(inboundDocumentInstallments.tenantId, tenantId),
        ),
      );
    await client
      .delete(inboundDocumentLines)
      .where(
        and(
          eq(inboundDocumentLines.documentId, id),
          eq(inboundDocumentLines.tenantId, tenantId),
        ),
      );
  }

  await client.insert(inboundDocumentFiles).values({
    tenantId,
    documentId: id,
    content,
    sha256: createHash('sha256').update(content).digest('hex'),
    fileName: fileName.slice(0, 255) || 'nfe.xml',
  });
  await insertLines(client, tenantId, id, parsed, supplierId);
  if (parsed.installments.length > 0) {
    await client.insert(inboundDocumentInstallments).values(
      parsed.installments.map((installment) => ({
        tenantId,
        documentId: id,
        ...installment,
      })),
    );
  }
  return { id, supplierId };
}
