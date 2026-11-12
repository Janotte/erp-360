import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { catalogItems, measures } from '@erp-360/mod-catalog';
import {
  inboundDocumentInstallments,
  inboundDocumentLines,
  inboundDocuments,
  operationNatures,
  stockMovements,
} from '@erp-360/mod-inbound';
import { and, eq } from 'drizzle-orm';

import { db } from '../src/db/index.ts';
import {
  entryDateMessage,
  inboundListQuery,
  listInboundDocuments,
} from '../src/modules/inbound/inbound.ts';
import { postInboundDocument } from '../src/modules/inbound/post.ts';
import { ensureInboundSetup } from '../src/modules/inbound/setup.ts';
import { createCompany } from './fixtures.ts';

describe('lista e data de entrada', () => {
  it('rejeita ordenação desconhecida', () => {
    const parsed = inboundListQuery.safeParse({ sort: 'foo' });
    assert.equal(parsed.success, false);
  });

  it('ordena pela entrada, separa a fila e expõe o primeiro bloqueio', async () => {
    const company = await createCompany('Lista de entradas');
    const tenantId = company.tenantId;
    await db.insert(inboundDocuments).values([
      {
        tenantId,
        status: 'pre_note',
        number: '20',
        series: '1',
        issueOn: '2026-09-01',
        inboundOn: '2026-11-05',
        supplierName: 'Beta',
        totalAmount: 2000,
        recipientManifestation: 'confirmed',
      },
      {
        tenantId,
        status: 'divergent',
        number: '10',
        series: '1',
        issueOn: '2026-10-01',
        inboundOn: '2026-11-01',
        supplierName: 'Alfa',
        totalAmount: 9000,
        recipientManifestation: 'none',
      },
      {
        tenantId,
        status: 'posted',
        number: '30',
        series: '1',
        issueOn: '2026-11-10',
        supplierName: 'Gama',
        totalAmount: 100,
        recipientManifestation: 'aware',
      },
      {
        tenantId,
        status: 'discovered',
        number: '40',
        series: '1',
        issueOn: '2026-08-01',
        supplierName: 'Delta',
        totalAmount: 50,
        authorizationStatus: 'cancelled',
      },
    ]);

    const listed = await listInboundDocuments(tenantId, {});
    assert.equal(listed.meta.total, 4);
    assert.equal(listed.meta.page, 1);
    assert.equal(listed.meta.limit, 10);
    assert.deepEqual(
      listed.data.map((row) => row.number),
      ['20', '10', '30', '40'],
    );
    assert.equal(
      listed.data.find((row) => row.number === '10')?.postBlocker,
      'Fornecedor não vinculado.',
    );
    assert.equal(listed.data.find((row) => row.number === '30')?.postBlocker, null);
    assert.equal(listed.data.find((row) => row.number === '40')?.postBlocker, null);

    const page = await listInboundDocuments(tenantId, { page: 2, limit: 2 });
    assert.deepEqual(
      page.data.map((row) => row.number),
      ['30', '40'],
    );
    assert.equal(page.meta.total, 4);
    assert.equal(page.meta.totalPages, 2);
    assert.equal(page.meta.page, 2);
    assert.equal(page.meta.limit, 2);

    const queue = await listInboundDocuments(tenantId, { queue: 'to_post', limit: 1 });
    assert.deepEqual(
      queue.data.map((row) => row.number),
      ['20'],
    );
    assert.equal(queue.meta.total, 2);
    assert.equal(queue.meta.totalPages, 2);

    const statusWins = await listInboundDocuments(tenantId, {
      queue: 'to_post',
      status: 'posted',
    });
    assert.deepEqual(
      statusWins.data.map((row) => row.number),
      ['30'],
    );

    const unmanifested = await listInboundDocuments(tenantId, { manifestation: 'none' });
    assert.deepEqual(unmanifested.data.map((row) => row.number).sort(), ['10', '40']);

    const bySupplier = await listInboundDocuments(tenantId, {
      sort: 'supplier',
      dir: 'asc',
    });
    assert.deepEqual(
      bySupplier.data.map((row) => row.supplierName),
      ['Alfa', 'Beta', 'Delta', 'Gama'],
    );

    const byTotal = await listInboundDocuments(tenantId, {
      sort: 'totalAmount',
      dir: 'desc',
    });
    assert.deepEqual(
      byTotal.data.map((row) => row.totalAmount),
      [9000, 2000, 100, 50],
    );
  });

  it('impede entrada anterior à emissão', () => {
    assert.equal(
      entryDateMessage('2026-09-01', '2026-10-01'),
      'A data de entrada não pode ser anterior à emissão.',
    );
    assert.equal(entryDateMessage('2026-10-01', '2026-10-01'), null);
    assert.equal(entryDateMessage(null, '2026-10-01'), null);
  });

  it('lança na data de entrada já gravada', async () => {
    const company = await createCompany('Data de entrada');
    const [measure] = await db
      .insert(measures)
      .values({
        tenantId: company.tenantId,
        name: 'Unidade',
        abbreviation: 'UN',
        measureType: 'unit',
        showOnProduct: true,
      })
      .returning({ id: measures.id });
    const [item] = await db
      .insert(catalogItems)
      .values({
        tenantId: company.tenantId,
        code: '000001',
        type: 'product',
        fiscalItemType: 'resale',
        tracksStock: true,
        measureId: measure.id,
        name: 'ITEM DE TESTE',
      })
      .returning({ id: catalogItems.id });
    await ensureInboundSetup(company.tenantId);
    const [nature] = await db
      .select({ id: operationNatures.id })
      .from(operationNatures)
      .where(
        and(
          eq(operationNatures.tenantId, company.tenantId),
          eq(operationNatures.code, 'purchase_resale'),
        ),
      )
      .limit(1);
    const [document] = await db
      .insert(inboundDocuments)
      .values({
        tenantId: company.tenantId,
        status: 'pre_note',
        number: '1',
        series: '1',
        issueOn: '2026-11-01',
        inboundOn: '2026-12-15',
        supplierId: company.personId,
        natureId: nature.id,
        hasProtocol: true,
        totalAmount: 1000,
      })
      .returning({ id: inboundDocuments.id });
    await db.insert(inboundDocumentLines).values({
      tenantId: company.tenantId,
      documentId: document.id,
      lineNumber: 1,
      supplierCode: 'ITEM',
      description: 'Item de teste',
      xmlCfop: '1102',
      entryCfop: '1102',
      commercialQty: '1.0000',
      commercialUnit: 'UN',
      factor: '1.000000',
      unitPrice: '10.0000',
      lineAmount: 1000,
      itemId: item.id,
    });
    await db.insert(inboundDocumentInstallments).values({
      tenantId: company.tenantId,
      documentId: document.id,
      number: '001',
      dueOn: '2026-12-15',
      amount: 1000,
    });

    await postInboundDocument(company.tenantId, document.id);

    const [saved] = await db
      .select({ inboundOn: inboundDocuments.inboundOn })
      .from(inboundDocuments)
      .where(eq(inboundDocuments.id, document.id));
    const [movement] = await db
      .select({ occurredOn: stockMovements.occurredOn })
      .from(stockMovements)
      .where(eq(stockMovements.documentId, document.id));
    assert.equal(saved.inboundOn, '2026-12-15');
    assert.equal(movement.occurredOn, '2026-12-15');
  });
});
