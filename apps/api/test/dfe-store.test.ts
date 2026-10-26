import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { dfeCursors, dfeDocuments } from '@erp-360/mod-inbound';
import { and, eq } from 'drizzle-orm';

import { db } from '../src/db/index.ts';
import {
  getOrCreateDfeCursor,
  saveDfeDistribution,
} from '../src/modules/inbound/dfe-store.ts';
import { createCompany } from './fixtures.ts';

const accessKey = '42261018371298000101550010000021161300002070';

describe('arquivo da distribuição de DF-e', () => {
  it('guarda o cursor e o documento sem recuar o NSU', async () => {
    const company = await createCompany('DF-e');
    const created = await getOrCreateDfeCursor(company.tenantId, 'homologation');
    assert.equal(created.ultNsu, '000000000000000');
    assert.equal(created.maxNsu, '000000000000000');
    assert.equal(created.lastStatus, null);

    await saveDfeDistribution(company.tenantId, 'homologation', {
      cStat: '138',
      reason: 'Documento localizado',
      respondedAt: '2026-10-26T12:00:00-03:00',
      ultNsu: '000000000000010',
      maxNsu: '000000000000020',
      documents: [
        {
          nsu: '000000000000010',
          schema: 'resNFe_v1.01.xsd',
          kind: 'summary',
          accessKey,
          xml: '<resNFe><xNome>Fornecedor</xNome></resNFe>',
        },
      ],
    });

    const [cursor] = await db
      .select()
      .from(dfeCursors)
      .where(
        and(
          eq(dfeCursors.tenantId, company.tenantId),
          eq(dfeCursors.environment, 'homologation'),
        ),
      );
    assert.equal(cursor.ultNsu, '000000000000010');
    assert.equal(cursor.maxNsu, '000000000000020');
    assert.equal(cursor.lastStatus, '138');
    assert.ok(cursor.queriedAt);

    await saveDfeDistribution(company.tenantId, 'homologation', {
      cStat: '138',
      reason: 'Documento localizado',
      respondedAt: null,
      ultNsu: '000000000000005',
      maxNsu: '000000000000020',
      documents: [
        {
          nsu: '000000000000005',
          schema: 'procNFe_v4.00.xsd',
          kind: 'nfe',
          accessKey,
          xml: '<nfeProc></nfeProc>',
        },
      ],
    });

    const [kept] = await db
      .select({ ultNsu: dfeCursors.ultNsu, maxNsu: dfeCursors.maxNsu })
      .from(dfeCursors)
      .where(
        and(
          eq(dfeCursors.tenantId, company.tenantId),
          eq(dfeCursors.environment, 'homologation'),
        ),
      );
    assert.equal(kept.ultNsu, '000000000000010');
    assert.equal(kept.maxNsu, '000000000000020');

    const stored = await db
      .select({
        nsu: dfeDocuments.nsu,
        kind: dfeDocuments.kind,
        accessKey: dfeDocuments.accessKey,
        xml: dfeDocuments.xml,
      })
      .from(dfeDocuments)
      .where(eq(dfeDocuments.tenantId, company.tenantId));
    assert.equal(stored.length, 2);
    assert.equal(stored.find((row) => row.nsu === '000000000000010')?.kind, 'summary');
    assert.equal(
      stored.find((row) => row.nsu === '000000000000005')?.xml,
      '<nfeProc></nfeProc>',
    );

    const production = await getOrCreateDfeCursor(company.tenantId, 'production');
    assert.equal(production.ultNsu, '000000000000000');
  });

  it('atualiza o XML quando o mesmo NSU chega de novo', async () => {
    const company = await createCompany('DF-e repetido');
    const document = {
      nsu: '000000000000003',
      schema: 'resNFe_v1.01.xsd',
      kind: 'summary' as const,
      accessKey,
      xml: '<resNFe><xNome>Antigo</xNome></resNFe>',
    };
    const distribution = {
      cStat: '138',
      reason: 'Documento localizado',
      respondedAt: null,
      ultNsu: '000000000000003',
      maxNsu: '000000000000003',
      documents: [document],
    };
    await saveDfeDistribution(company.tenantId, 'homologation', distribution);
    await saveDfeDistribution(company.tenantId, 'homologation', {
      ...distribution,
      documents: [{ ...document, xml: '<resNFe><xNome>Novo</xNome></resNFe>' }],
    });

    const rows = await db
      .select({ xml: dfeDocuments.xml })
      .from(dfeDocuments)
      .where(eq(dfeDocuments.tenantId, company.tenantId));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].xml, '<resNFe><xNome>Novo</xNome></resNFe>');
  });
});
