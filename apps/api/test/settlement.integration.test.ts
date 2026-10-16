import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { cashEntries, payables, receivables, settlements } from '@erp-360/mod-financial';
import { payableTitleSchema, receivableTitleSchema, titlePageSchema } from '@erp-360/shared';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { buildApp } from '../src/app.ts';
import { env } from '../src/config/index.ts';
import { closeDatabase, db } from '../src/db/index.ts';
import { SettlementError, settleTitle } from '../src/modules/titles/settlement.ts';
import {
  createCompany,
  createTitle,
  ensureSettings,
  removeCompany,
  settlementInput,
} from './fixtures.ts';

const messageSchema = z.object({ message: z.string() });

describe('liquidação no banco de teste', () => {
  const app = buildApp({ logger: false });

  before(async () => {
    assert.equal(
      env.database.name,
      'erp360_test',
      'Os testes só rodam no banco erp360_test.',
    );
    const result = await db.execute(sql`select current_database() as name`);
    assert.equal(String(result.rows[0]?.name), 'erp360_test');
    await app.ready();
  });

  after(async () => {
    await app.close();
    await closeDatabase();
  });

  for (const kind of ['payable', 'receivable'] as const) {
    it(`aceita uma baixa de ${kind} e recusa a segunda simultânea`, async () => {
      const company = await createCompany(kind);
      try {
        await ensureSettings(company.tenantId);
        const titleId = await createTitle(kind, company.tenantId, company.personId);
        const input = settlementInput(kind, company.tenantId, titleId);

        const results = await Promise.allSettled([settleTitle(input), settleTitle(input)]);
        const fulfilled = results.filter((result) => result.status === 'fulfilled');
        const rejected = results.filter((result) => result.status === 'rejected');

        assert.equal(fulfilled.length, 1, 'a baixa duplicada não pode passar');
        assert.equal(rejected.length, 1);
        const reason = rejected[0]?.reason;
        assert.ok(reason instanceof SettlementError);
        assert.ok(reason.status === 400 || reason.status === 409);
        assert.match(reason.message, /já foi liquidado|pendentes podem ser liquidadas/);

        const [settlementCount] = await db
          .select({ count: sql<number>`count(*)` })
          .from(settlements)
          .where(eq(settlements.titleId, titleId));
        const [entryCount] = await db
          .select({ count: sql<number>`count(*)` })
          .from(cashEntries)
          .where(
            kind === 'payable'
              ? eq(cashEntries.payableId, titleId)
              : eq(cashEntries.receivableId, titleId),
          );
        assert.equal(Number(settlementCount?.count), 1);
        assert.equal(Number(entryCount?.count), 1);

        if (kind === 'payable') {
          const [title] = await db
            .select({ status: payables.status, paidAmount: payables.paidAmount })
            .from(payables)
            .where(eq(payables.id, titleId));
          assert.equal(title?.status, 'pago');
          assert.equal(title?.paidAmount, input.settledAmount);
        } else {
          const [title] = await db
            .select({
              status: receivables.status,
              receivedAmount: receivables.receivedAmount,
            })
            .from(receivables)
            .where(eq(receivables.id, titleId));
          assert.equal(title?.status, 'recebido');
          assert.equal(title?.receivedAmount, input.settledAmount);
        }
      } finally {
        await removeCompany(company.tenantId);
      }
    });
  }

  it('não lista nem liquida título de outra empresa', async () => {
    const owner = await createCompany('dona');
    const other = await createCompany('outra');
    try {
      const payableId = await createTitle('payable', owner.tenantId, owner.personId);
      const receivableId = await createTitle('receivable', owner.tenantId, owner.personId);
      const ownerToken = app.jwt.sign({ userId: owner.userId, tenantId: owner.tenantId });
      const otherToken = app.jwt.sign({ userId: other.userId, tenantId: other.tenantId });
      const mixedToken = app.jwt.sign({ userId: other.userId, tenantId: owner.tenantId });

      const ownList = titlePageSchema(payableTitleSchema).parse(
        (await app.inject({
          method: 'GET',
          url: '/payables',
          headers: { authorization: `Bearer ${ownerToken}` },
        })).json(),
      );
      assert.equal(ownList.meta.total, 1);
      assert.equal(ownList.data[0]?.id, payableId);

      const foreignPayables = titlePageSchema(payableTitleSchema).parse(
        (await app.inject({
          method: 'GET',
          url: '/payables',
          headers: { authorization: `Bearer ${otherToken}` },
        })).json(),
      );
      const foreignReceivables = titlePageSchema(receivableTitleSchema).parse(
        (await app.inject({
          method: 'GET',
          url: '/receivables',
          headers: { authorization: `Bearer ${otherToken}` },
        })).json(),
      );
      assert.equal(foreignPayables.meta.total, 0);
      assert.equal(foreignReceivables.meta.total, 0);

      const pay = await app.inject({
        method: 'POST',
        url: `/payables/${payableId}/pay`,
        headers: { authorization: `Bearer ${otherToken}` },
        payload: settlementInput('payable', other.tenantId, payableId),
      });
      const receive = await app.inject({
        method: 'POST',
        url: `/receivables/${receivableId}/receive`,
        headers: { authorization: `Bearer ${otherToken}` },
        payload: settlementInput('receivable', other.tenantId, receivableId),
      });
      assert.equal(pay.statusCode, 404);
      assert.equal(receive.statusCode, 404);
      assert.match(messageSchema.parse(pay.json()).message, /não encontrada/);
      assert.match(messageSchema.parse(receive.json()).message, /não encontrada/);

      const mixed = await app.inject({
        method: 'GET',
        url: '/payables',
        headers: { authorization: `Bearer ${mixedToken}` },
      });
      assert.equal(mixed.statusCode, 401);

      const [payable] = await db
        .select({ status: payables.status })
        .from(payables)
        .where(eq(payables.id, payableId));
      const [receivable] = await db
        .select({ status: receivables.status })
        .from(receivables)
        .where(eq(receivables.id, receivableId));
      assert.equal(payable?.status, 'pendente');
      assert.equal(receivable?.status, 'pendente');
    } finally {
      await removeCompany(owner.tenantId);
      await removeCompany(other.tenantId);
    }
  });
});
