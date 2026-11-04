import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { catalogItems, measures } from '@erp-360/mod-catalog';
import { companyCards, payables } from '@erp-360/mod-financial';
import {
  inboundDocumentInstallments,
  inboundDocumentLines,
  inboundDocuments,
  operationNatures,
  stockBalances,
} from '@erp-360/mod-inbound';
import { persons } from '@erp-360/mod-persons';
import { civilDate } from '@erp-360/shared';
import { and, eq } from 'drizzle-orm';

import { db } from '../src/db/index.ts';
import {
  postInboundDocument,
  reverseInboundDocument,
} from '../src/modules/inbound/post.ts';
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
        name: 'ITEM DE TESTE',
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
      .select({
        lastInboundOn: catalogItems.lastInboundOn,
        listPrice: catalogItems.listPrice,
      })
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

  it('lança a compra no emissor do cartão e não abre título para o fornecedor', async () => {
    const company = await createCompany('Cartao');
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
        fiscalItemType: 'consumable',
        tracksStock: false,
        measureId: measure.id,
        name: 'KIT DE IMPRESSAO',
      })
      .returning({ id: catalogItems.id });
    const [issuer] = await db
      .insert(persons)
      .values({
        tenantId: company.tenantId,
        name: 'Emissor do cartao',
        isFinancialInstitution: true,
      })
      .returning({ id: persons.id });
    const [card] = await db
      .insert(companyCards)
      .values({
        tenantId: company.tenantId,
        name: 'Empresarial',
        issuerId: issuer.id,
        closingDay: 1,
        dueDay: 10,
      })
      .returning({ id: companyCards.id });
    await ensureInboundSetup(company.tenantId);
    const [nature] = await db
      .select({ id: operationNatures.id })
      .from(operationNatures)
      .where(
        and(
          eq(operationNatures.tenantId, company.tenantId),
          eq(operationNatures.code, 'purchase_use'),
        ),
      )
      .limit(1);
    const today = civilDate();
    const [document] = await db
      .insert(inboundDocuments)
      .values({
        tenantId: company.tenantId,
        status: 'pre_note',
        number: '122',
        series: '1',
        issueOn: today,
        supplierId: company.personId,
        natureId: nature.id,
        hasProtocol: true,
        totalAmount: 399800,
        xmlPaymentCode: '90',
        xmlPaymentAmount: 0,
        financialStatus: 'classified',
        paymentKind: 'card',
        companyCardId: card.id,
      })
      .returning({ id: inboundDocuments.id });
    await db.insert(inboundDocumentLines).values({
      tenantId: company.tenantId,
      documentId: document.id,
      lineNumber: 1,
      supplierCode: 'KIT',
      description: 'Kit de impressao',
      xmlCfop: '6102',
      entryCfop: '2556',
      commercialQty: '1.0000',
      commercialUnit: 'UN',
      factor: '1.000000',
      unitPrice: '3998.0000',
      lineAmount: 399800,
      itemId: item.id,
    });
    await db.insert(inboundDocumentInstallments).values({
      tenantId: company.tenantId,
      documentId: document.id,
      number: '001',
      dueOn: today,
      amount: 399800,
    });

    await postInboundDocument(company.tenantId, document.id);

    const supplierTitles = await db
      .select({ id: payables.id })
      .from(payables)
      .where(eq(payables.creditorId, company.personId));
    assert.equal(supplierTitles.length, 0);
    const cardTitles = await db
      .select({
        amount: payables.installmentAmount,
        companyCardId: payables.companyCardId,
        status: payables.status,
      })
      .from(payables)
      .where(eq(payables.creditorId, issuer.id));
    assert.deepEqual(cardTitles, [
      { amount: 399800, companyCardId: card.id, status: 'pendente' },
    ]);
  });

  it('não lança a nota enquanto o pagamento está sem classificação', async () => {
    const company = await createCompany('Pendente');
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
        fiscalItemType: 'consumable',
        tracksStock: false,
        measureId: measure.id,
        name: 'ITEM PENDENTE',
      })
      .returning({ id: catalogItems.id });
    await ensureInboundSetup(company.tenantId);
    const [nature] = await db
      .select({ id: operationNatures.id })
      .from(operationNatures)
      .where(
        and(
          eq(operationNatures.tenantId, company.tenantId),
          eq(operationNatures.code, 'purchase_use'),
        ),
      )
      .limit(1);
    const today = civilDate();
    const [document] = await db
      .insert(inboundDocuments)
      .values({
        tenantId: company.tenantId,
        status: 'pre_note',
        number: '2',
        series: '1',
        issueOn: today,
        supplierId: company.personId,
        natureId: nature.id,
        hasProtocol: true,
        totalAmount: 1000,
        financialStatus: 'pending',
        paymentKind: null,
      })
      .returning({ id: inboundDocuments.id });
    await db.insert(inboundDocumentLines).values({
      tenantId: company.tenantId,
      documentId: document.id,
      lineNumber: 1,
      supplierCode: 'ITEM',
      description: 'Item pendente',
      xmlCfop: '6102',
      entryCfop: '2556',
      commercialQty: '1.0000',
      commercialUnit: 'UN',
      factor: '1.000000',
      unitPrice: '10.0000',
      lineAmount: 1000,
      itemId: item.id,
    });

    await assert.rejects(
      () => postInboundDocument(company.tenantId, document.id),
      /Classifique o pagamento/,
    );
  });

  it('efetiva a entrada sem título quando o financeiro é dispensado', async () => {
    const company = await createCompany('Dispensa');
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
        fiscalItemType: 'consumable',
        tracksStock: false,
        measureId: measure.id,
        name: 'ITEM DISPENSADO',
      })
      .returning({ id: catalogItems.id });
    await ensureInboundSetup(company.tenantId);
    const [nature] = await db
      .select({ id: operationNatures.id })
      .from(operationNatures)
      .where(
        and(
          eq(operationNatures.tenantId, company.tenantId),
          eq(operationNatures.code, 'purchase_use'),
        ),
      )
      .limit(1);
    const today = civilDate();
    const [document] = await db
      .insert(inboundDocuments)
      .values({
        tenantId: company.tenantId,
        status: 'pre_note',
        number: '3',
        series: '1',
        issueOn: today,
        supplierId: company.personId,
        natureId: nature.id,
        hasProtocol: true,
        totalAmount: 1000,
        financialStatus: 'waived',
        paymentKind: null,
        waiverReason: 'Sem obrigação financeira',
      })
      .returning({ id: inboundDocuments.id });
    await db.insert(inboundDocumentLines).values({
      tenantId: company.tenantId,
      documentId: document.id,
      lineNumber: 1,
      supplierCode: 'ITEM',
      description: 'Item dispensado',
      xmlCfop: '6102',
      entryCfop: '2556',
      commercialQty: '1.0000',
      commercialUnit: 'UN',
      factor: '1.000000',
      unitPrice: '10.0000',
      lineAmount: 1000,
      itemId: item.id,
    });

    await postInboundDocument(company.tenantId, document.id);

    const titles = await db
      .select({ id: payables.id })
      .from(payables)
      .where(eq(payables.tenantId, company.tenantId));
    assert.equal(titles.length, 0);
    const [posted] = await db
      .select({
        status: inboundDocuments.status,
        createsPayable: inboundDocuments.createsPayable,
      })
      .from(inboundDocuments)
      .where(eq(inboundDocuments.id, document.id));
    assert.equal(posted.status, 'posted');
    assert.equal(posted.createsPayable, false);
  });
});
