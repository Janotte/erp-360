import {
  bankAccounts,
  bankEntries,
  cashEntries,
  financialSettings,
} from '@erp-360/mod-financial';
import { and, asc, desc, eq, gte, lte } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db } from '../db/index.ts';
import { getOrCreateFinancialSettings } from '../services/financial-settings.ts';
import {
  loadBankAccount,
  syncBankOpening,
  syncCashOpening,
} from '../services/opening-balance.ts';
import { listCashFlow } from '../services/settlement.ts';
import {
  createTreasuryTransfer,
  reverseTreasuryTransfer,
  TransferError,
} from '../services/treasury-transfer.ts';
import '../types/fastify.ts';

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de data deve ser YYYY-MM-DD');

const settingsBody = z.object({
  lateFeeBps: z.number().int().min(0).max(10000),
  dailyInterestBps: z.number().int().min(0).max(10000),
  graceDays: z.number().int().min(0).max(90),
  cashPlanAccountId: z.string().uuid().optional().nullable(),
  discountObtainedPlanAccountId: z.string().uuid().optional().nullable(),
  discountGrantedPlanAccountId: z.string().uuid().optional().nullable(),
  lateFeePaidPlanAccountId: z.string().uuid().optional().nullable(),
  lateFeeReceivedPlanAccountId: z.string().uuid().optional().nullable(),
  cashOpeningOn: dateString.optional().nullable(),
  cashOpeningAmount: z.number().int().optional().default(0),
});

const bankAccountBody = z.object({
  name: z.string().min(1).max(60),
  kind: z.enum(['operating', 'investment']).optional().default('operating'),
  branchNumber: z.string().max(10).optional().nullable(),
  accountCode: z.string().max(16).optional().nullable(),
  planAccountId: z.string().uuid().optional().nullable(),
  financialInstitutionId: z.string().uuid().optional().nullable(),
  openingOn: dateString.optional().nullable(),
  openingAmount: z.number().int().optional().default(0),
});

const transferBody = z.object({
  occurredOn: dateString,
  amount: z.number().int().positive(),
  fromTreasury: z.enum(['cash', 'bank']),
  fromBankAccountId: z.string().uuid().optional().nullable(),
  toTreasury: z.enum(['cash', 'bank']),
  toBankAccountId: z.string().uuid().optional().nullable(),
  description: z.string().max(255).optional().nullable(),
});

export const treasuryRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('preHandler', fastify.autenticarETenant);

  fastify.get('/settings', async (request) => {
    return getOrCreateFinancialSettings(request.user.tenantId);
  });

  fastify.put('/settings', { schema: { body: settingsBody } }, async (request, reply) => {
    const tenantId = request.user.tenantId;
    await getOrCreateFinancialSettings(tenantId);
    const data = request.body;
    const cashOpeningOn = data.cashOpeningOn || null;
    const cashOpeningAmount = data.cashOpeningAmount ?? 0;
    if (cashOpeningAmount !== 0 && !cashOpeningOn) {
      return reply
        .status(400)
        .send({ message: 'Informe a data do saldo inicial do caixa.' });
    }
    const [updated] = await db
      .update(financialSettings)
      .set({
        lateFeeBps: data.lateFeeBps,
        dailyInterestBps: data.dailyInterestBps,
        graceDays: data.graceDays,
        cashPlanAccountId: data.cashPlanAccountId || null,
        discountObtainedPlanAccountId: data.discountObtainedPlanAccountId || null,
        discountGrantedPlanAccountId: data.discountGrantedPlanAccountId || null,
        lateFeePaidPlanAccountId: data.lateFeePaidPlanAccountId || null,
        lateFeeReceivedPlanAccountId: data.lateFeeReceivedPlanAccountId || null,
        cashOpeningOn,
        cashOpeningAmount,
      })
      .where(eq(financialSettings.tenantId, tenantId))
      .returning();
    await syncCashOpening(tenantId, cashOpeningOn, cashOpeningAmount);
    return updated;
  });

  fastify.put(
    '/cash-opening',
    {
      schema: {
        body: z.object({
          cashOpeningOn: dateString.optional().nullable(),
          cashOpeningAmount: z.number().int(),
        }),
      },
    },
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      await getOrCreateFinancialSettings(tenantId);
      const data = request.body;
      const cashOpeningOn = data.cashOpeningOn || null;
      if (data.cashOpeningAmount !== 0 && !cashOpeningOn) {
        return reply
          .status(400)
          .send({ message: 'Informe a data do saldo inicial do caixa.' });
      }
      const [updated] = await db
        .update(financialSettings)
        .set({
          cashOpeningOn,
          cashOpeningAmount: data.cashOpeningAmount,
        })
        .where(eq(financialSettings.tenantId, tenantId))
        .returning();
      await syncCashOpening(tenantId, cashOpeningOn, data.cashOpeningAmount);
      return updated;
    },
  );

  fastify.get(
    '/cash-entries',
    {
      schema: {
        querystring: z.object({
          from: dateString.optional(),
          to: dateString.optional(),
        }),
      },
    },
    async (request) => {
      const tenantId = request.user.tenantId;
      const query = request.query;
      const conditions = [eq(cashEntries.tenantId, tenantId)];
      if (query.from) conditions.push(gte(cashEntries.occurredOn, query.from));
      if (query.to) conditions.push(lte(cashEntries.occurredOn, query.to));

      return db
        .select()
        .from(cashEntries)
        .where(and(...conditions))
        .orderBy(
          desc(cashEntries.occurredOn),
          asc(cashEntries.openingBalance),
          desc(cashEntries.createdAt),
        );
    },
  );

  fastify.get(
    '/cash-flow',
    {
      schema: {
        querystring: z.object({
          days: z.coerce.number().int().min(1).max(366).default(60),
        }),
      },
    },
    async (request) => {
      return listCashFlow(request.user.tenantId, request.query.days);
    },
  );

  fastify.get('/bank-accounts', async (request) => {
    return db
      .select()
      .from(bankAccounts)
      .where(eq(bankAccounts.tenantId, request.user.tenantId))
      .orderBy(asc(bankAccounts.name));
  });

  fastify.post(
    '/bank-accounts',
    { schema: { body: bankAccountBody } },
    async (request, reply) => {
      const data = request.body;
      const openingOn = data.openingOn || null;
      const openingAmount = data.openingAmount ?? 0;
      if (openingAmount !== 0 && !openingOn) {
        return reply.status(400).send({ message: 'Informe a data do saldo inicial.' });
      }
      const [created] = await db
        .insert(bankAccounts)
        .values({
          tenantId: request.user.tenantId,
          name: data.name.trim(),
          kind: data.kind,
          branchNumber: data.branchNumber || null,
          accountCode: data.accountCode || null,
          planAccountId: data.planAccountId || null,
          financialInstitutionId: data.financialInstitutionId || null,
          openingOn,
          openingAmount,
          balance: 0,
        })
        .returning();
      await syncBankOpening(request.user.tenantId, created.id, openingOn, openingAmount);
      const account = await loadBankAccount(request.user.tenantId, created.id);
      return reply.status(201).send(account ?? created);
    },
  );

  fastify.put(
    '/bank-accounts/:id',
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: bankAccountBody,
      },
    },
    async (request, reply) => {
      const { tenantId } = request.user;
      const { id } = request.params;
      const data = request.body;
      const existing = await loadBankAccount(tenantId, id);
      if (!existing) {
        return reply.status(404).send({ message: 'Conta bancária não encontrada.' });
      }
      const openingOn = data.openingOn || null;
      const openingAmount = data.openingAmount ?? 0;
      if (openingAmount !== 0 && !openingOn) {
        return reply.status(400).send({ message: 'Informe a data do saldo inicial.' });
      }
      await db
        .update(bankAccounts)
        .set({
          name: data.name.trim(),
          kind: data.kind,
          branchNumber: data.branchNumber || null,
          accountCode: data.accountCode || null,
          planAccountId: data.planAccountId || null,
          financialInstitutionId: data.financialInstitutionId || null,
          openingOn,
          openingAmount,
        })
        .where(and(eq(bankAccounts.id, id), eq(bankAccounts.tenantId, tenantId)));
      await syncBankOpening(tenantId, id, openingOn, openingAmount);
      const account = await loadBankAccount(tenantId, id);
      return account;
    },
  );

  fastify.get(
    '/bank-accounts/:id/entries',
    { schema: { params: z.object({ id: z.string().uuid() }) } },
    async (request, reply) => {
      const { tenantId } = request.user;
      const { id } = request.params;
      const [account] = await db
        .select()
        .from(bankAccounts)
        .where(and(eq(bankAccounts.id, id), eq(bankAccounts.tenantId, tenantId)))
        .limit(1);
      if (!account) {
        return reply.status(404).send({ message: 'Conta bancária não encontrada.' });
      }
      const entries = await db
        .select()
        .from(bankEntries)
        .where(and(eq(bankEntries.tenantId, tenantId), eq(bankEntries.bankAccountId, id)))
        .orderBy(
          desc(bankEntries.occurredOn),
          asc(bankEntries.openingBalance),
          desc(bankEntries.createdAt),
        );
      return { account, entries };
    },
  );

  fastify.post(
    '/bank-entries/:id/reconcile',
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.object({ reconciled: z.boolean() }),
      },
    },
    async (request, reply) => {
      const { tenantId } = request.user;
      const { id } = request.params;
      const { reconciled } = request.body;
      const [updated] = await db
        .update(bankEntries)
        .set({ reconciled })
        .where(and(eq(bankEntries.id, id), eq(bankEntries.tenantId, tenantId)))
        .returning();
      if (!updated) {
        return reply.status(404).send({ message: 'Lançamento bancário não encontrado.' });
      }
      return updated;
    },
  );

  fastify.post(
    '/transfers',
    { schema: { body: transferBody } },
    async (request, reply) => {
      const data = request.body;
      try {
        const transfer = await createTreasuryTransfer({
          tenantId: request.user.tenantId,
          occurredOn: data.occurredOn,
          amount: data.amount,
          fromTreasury: data.fromTreasury,
          fromBankAccountId: data.fromBankAccountId,
          toTreasury: data.toTreasury,
          toBankAccountId: data.toBankAccountId,
          description: data.description,
        });
        return reply.status(201).send(transfer);
      } catch (error) {
        if (error instanceof TransferError) {
          return reply.status(error.status).send({ message: error.message });
        }
        throw error;
      }
    },
  );

  fastify.delete(
    '/transfers/:id',
    { schema: { params: z.object({ id: z.string().uuid() }) } },
    async (request, reply) => {
      const { id } = request.params;
      try {
        const reversed = await reverseTreasuryTransfer({
          tenantId: request.user.tenantId,
          transferId: id,
        });
        return reversed;
      } catch (error) {
        if (error instanceof TransferError) {
          return reply.status(error.status).send({ message: error.message });
        }
        throw error;
      }
    },
  );
};
