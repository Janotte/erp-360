import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { catalogItems, measures } from '@erp-360/mod-catalog';
import {
  inboundDocumentInstallments,
  inboundDocumentLines,
  inboundDocuments,
  inboundPricingOverrides,
  operationNatures,
  stockBalances,
} from '@erp-360/mod-inbound';
import { civilDate } from '@erp-360/shared';
import { and, eq } from 'drizzle-orm';

import { db } from '../src/db/index.ts';
import { postInboundDocument } from '../src/modules/inbound/post.ts';
import { ensureInboundSetup } from '../src/modules/inbound/setup.ts';
import { createCompany } from './fixtures.ts';

type Scenario = {
  label: string;
  natureCode: string;
  itemMargin: string | null;
  itemListPrice?: string;
  override?: { grossMargin: string | null };
  lines: Array<{ lineAmount: number }>;
};

async function runScenario(scenario: Scenario) {
  const company = await createCompany(scenario.label);
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
      name: 'ITEM DE PRECO',
      grossMargin: scenario.itemMargin,
      ...(scenario.itemListPrice ? { listPrice: scenario.itemListPrice } : {}),
    })
    .returning({ id: catalogItems.id });
  await db.insert(stockBalances).values({
    tenantId: company.tenantId,
    itemId: item.id,
    quantity: '10.0000',
    averageCost: '50.0000',
  });
  await ensureInboundSetup(company.tenantId);
  const [nature] = await db
    .select({ id: operationNatures.id })
    .from(operationNatures)
    .where(
      and(
        eq(operationNatures.tenantId, company.tenantId),
        eq(operationNatures.code, scenario.natureCode),
      ),
    )
    .limit(1);
  const today = civilDate();
  const total = scenario.lines.reduce((sum, line) => sum + line.lineAmount, 0);
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
      totalAmount: total,
    })
    .returning({ id: inboundDocuments.id });
  for (const [index, line] of scenario.lines.entries()) {
    const quantity = scenario.lines.length === 1 ? '20.0000' : '10.0000';
    await db.insert(inboundDocumentLines).values({
      tenantId: company.tenantId,
      documentId: document.id,
      lineNumber: index + 1,
      supplierCode: `ITEM${index + 1}`,
      description: 'Item de preço',
      xmlCfop: '1102',
      entryCfop: '1102',
      commercialQty: quantity,
      commercialUnit: 'UN',
      factor: '1.000000',
      unitPrice: scenario.lines.length === 1 ? '65.0000' : String(line.lineAmount / 1000),
      lineAmount: line.lineAmount,
      itemId: item.id,
    });
  }
  await db.insert(inboundDocumentInstallments).values({
    tenantId: company.tenantId,
    documentId: document.id,
    number: '001',
    dueOn: today,
    amount: total,
  });
  if (scenario.override) {
    await db.insert(inboundPricingOverrides).values({
      tenantId: company.tenantId,
      documentId: document.id,
      itemId: item.id,
      grossMargin: scenario.override.grossMargin,
    });
  }

  await postInboundDocument(company.tenantId, document.id);

  const [posted] = await db
    .select({
      grossMargin: catalogItems.grossMargin,
      listPrice: catalogItems.listPrice,
    })
    .from(catalogItems)
    .where(eq(catalogItems.id, item.id));
  const [balance] = await db
    .select({
      quantity: stockBalances.quantity,
      averageCost: stockBalances.averageCost,
    })
    .from(stockBalances)
    .where(eq(stockBalances.itemId, item.id));
  return { posted, balance };
}

describe('preço de lista pelo custo médio no lançamento', () => {
  it('calcula o exemplo da especificação', async () => {
    const { posted, balance } = await runScenario({
      label: 'PrecoExemplo',
      natureCode: 'purchase_resale',
      itemMargin: '45.0000',
      lines: [{ lineAmount: 130000 }],
    });
    assert.equal(posted.grossMargin, '45.0000');
    assert.equal(posted.listPrice, '109.0909');
    assert.equal(Number(balance.quantity), 30);
    assert.equal(Number(balance.averageCost), 60);
  });

  it('usa a margem ajustada na nota e grava no item', async () => {
    const { posted } = await runScenario({
      label: 'PrecoAjuste',
      natureCode: 'purchase_resale',
      itemMargin: '10.0000',
      itemListPrice: '1.0000',
      lines: [{ lineAmount: 130000 }],
      override: { grossMargin: '45.0000' },
    });
    assert.equal(posted.grossMargin, '45.0000');
    assert.equal(posted.listPrice, '109.0909');
  });

  it('limpa a margem e mantém o preço quando o ajuste é nulo', async () => {
    const { posted } = await runScenario({
      label: 'PrecoLimpa',
      natureCode: 'purchase_resale',
      itemMargin: '45.0000',
      itemListPrice: '80.0000',
      lines: [{ lineAmount: 130000 }],
      override: { grossMargin: null },
    });
    assert.equal(posted.grossMargin, null);
    assert.equal(posted.listPrice, '80.0000');
  });

  it('não sugere preço em natureza que não sugere preço de lista', async () => {
    const { posted } = await runScenario({
      label: 'PrecoIndustria',
      natureCode: 'purchase_raw',
      itemMargin: null,
      itemListPrice: '80.0000',
      lines: [{ lineAmount: 130000 }],
      override: { grossMargin: '45.0000' },
    });
    assert.equal(posted.grossMargin, '45.0000');
    assert.equal(posted.listPrice, '80.0000');
  });

  it('calcula uma vez pelo custo médio final com duas linhas do mesmo item', async () => {
    const { posted, balance } = await runScenario({
      label: 'PrecoDuasLinhas',
      natureCode: 'purchase_resale',
      itemMargin: '45.0000',
      lines: [{ lineAmount: 80000 }, { lineAmount: 50000 }],
    });
    assert.equal(Number(balance.quantity), 30);
    assert.equal(Number(balance.averageCost), 60);
    assert.equal(posted.listPrice, '109.0909');
  });
});
