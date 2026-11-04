import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cfopEntryRules, operationNatures } from '@erp-360/mod-inbound';
import { and, eq } from 'drizzle-orm';

import { db } from '../src/db/index.ts';
import { ensureInboundSetup } from '../src/modules/inbound/setup.ts';
import { createCompany, removeCompany } from './fixtures.ts';

describe('finalidade de conserto', () => {
  it('completa a natureza e os CFOP de remessa e retorno numa empresa que já tem cadastro', async () => {
    const company = await createCompany('Conserto');
    try {
      await db.insert(operationNatures).values({
        tenantId: company.tenantId,
        direction: 'in',
        code: 'purchase_resale',
        name: 'Compra para revenda',
        fiscalPurpose: 'resale',
        movesStock: true,
        createsPayable: true,
        updatesAverageCost: true,
        recordsEntryPrice: true,
        suggestsListPrice: true,
      });
      await ensureInboundSetup(company.tenantId);

      const [nature] = await db
        .select({
          name: operationNatures.name,
          fiscalPurpose: operationNatures.fiscalPurpose,
          movesStock: operationNatures.movesStock,
          createsPayable: operationNatures.createsPayable,
        })
        .from(operationNatures)
        .where(
          and(
            eq(operationNatures.tenantId, company.tenantId),
            eq(operationNatures.code, 'repair'),
          ),
        );
      assert.equal(nature.name, 'Remessa e retorno de conserto');
      assert.equal(nature.fiscalPurpose, 'repair');
      assert.equal(nature.movesStock, false);
      assert.equal(nature.createsPayable, false);

      const rules = await db
        .select({
          sourceCfop: cfopEntryRules.sourceCfop,
          entryCfop: cfopEntryRules.entryCfop,
        })
        .from(cfopEntryRules)
        .where(
          and(
            eq(cfopEntryRules.tenantId, company.tenantId),
            eq(cfopEntryRules.fiscalPurpose, 'repair'),
          ),
        );
      assert.deepEqual(
        rules.sort((left, right) => left.sourceCfop.localeCompare(right.sourceCfop)),
        [
          { sourceCfop: '5915', entryCfop: '1915' },
          { sourceCfop: '5916', entryCfop: '1916' },
          { sourceCfop: '6915', entryCfop: '2915' },
          { sourceCfop: '6916', entryCfop: '2916' },
        ],
      );
    } finally {
      await db.delete(cfopEntryRules).where(eq(cfopEntryRules.tenantId, company.tenantId));
      await db.delete(operationNatures).where(eq(operationNatures.tenantId, company.tenantId));
      await removeCompany(company.tenantId);
    }
  });
});
