import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { catalogItems, measures } from '@erp-360/mod-catalog';
import { payables } from '@erp-360/mod-financial';
import {
  inboundDocumentInstallments,
  inboundDocumentLines,
  inboundDocuments,
  operationNatures,
  stockBalances,
} from '@erp-360/mod-inbound';
import { civilDate } from '@erp-360/shared';
import { and, eq } from 'drizzle-orm';

import { db } from '../src/db/index.ts';
import { postInboundDocument, reverseInboundDocument } from '../src/modules/inbound/post.ts';
import { ensureInboundSetup } from '../src/modules/inbound/setup.ts';
import { createCompany } from './fixtures.ts';

describe('confirmação da entrada', () => {
  it('grava a data da última entrada no item e não apaga no estorno', async () => {
    const company = await createCompany('Entrada');
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
        name: 'Item de teste',
        grossMargin: '50.0000',
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
    const today = civilDate();
    const [document] = await db
      .insert(inboundDocuments)
      .values({
        tenantId: company.tenantId,
        status: 'pre_note',
        number: '1',
        series: '1',
        issueOn: today,
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
      dueOn: today,
      amount: 1000,
    });

    await postInboundDocument(company.tenantId, document.id);

    const [posted] = await db
      .select({
        lastInboundOn: catalogItems.lastInboundOn,
        listPrice: catalogItems.listPrice,
      })
      .from(catalogItems)
      .where(eq(catalogItems.id, item.id));
    assert.equal(posted.lastInboundOn, today);
    assert.equal(posted.listPrice, '15.0000');

    const titles = await db
      .select({ documentNumber: payables.documentNumber })
      .from(payables)
      .where(eq(payables.creditorId, company.personId));
    assert.deepEqual(
      titles.map((title) => title.documentNumber),
      ['000000001001'],
    );

    const [balance] = await db
      .select({ quantity: stockBalances.quantity })
      .from(stockBalances)
      .where(eq(stockBalances.itemId, item.id));
    assert.equal(Number(balance.quantity), 1);

    await reverseInboundDocument(company.tenantId, document.id);

    const [reversed] = await db
      .select({ lastInboundOn: catalogItems.lastInboundOn, listPrice: catalogItems.listPrice })
      .from(catalogItems)
      .where(eq(catalogItems.id, item.id));
    assert.equal(reversed.lastInboundOn, today);
    assert.equal(reversed.listPrice, '15.0000');

    const remaining = await db
      .select({ id: payables.id })
      .from(payables)
      .where(eq(payables.creditorId, company.personId));
    assert.equal(remaining.length, 0);
  });
});
