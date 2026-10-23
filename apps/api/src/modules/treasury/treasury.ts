import '../../types/fastify.ts';

import {
  bankAccounts,
  bankEntries,
  cashEntries,
  financialSettings,
} from '@erp-360/mod-financial';
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { db } from '../../db/index.ts';
import { listCashFlow } from '../titles/settlement.ts';
import { getOrCreateFinancialSettings } from './financial-settings.ts';
import { createInvestmentEntry, deleteInvestmentEntry } from './investment-entry.ts';
import { listIncomeStatement } from './income-statement.ts';
import {
  loadBankAccount,
  syncBankOpening,
  syncCashOpening,
} from './opening-balance.ts';
import { compareStatementNewestFirst } from './statement-order.ts';
import {
  createTreasuryTransfer,
  reverseTreasuryTransfer,
} from './treasury-transfer.ts';

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

      const entries = await db
        .select()
        .from(cashEntries)
        .where(and(...conditions));
      entries.sort(compareStatementNewestFirst);
      return entries;
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

  fastify.get(
    '/income-statement',
    {
      schema: {
        querystring: z
          .object({
            from: dateString,
            to: dateString,
          })
          .refine((query) => query.from <= query.to, {
            message: 'A data inicial não pode ser posterior à data final.',
          }),
      },
    },
    async (request) => {
      const { from, to } = request.query;
      return listIncomeStatement(request.user.tenantId, from, to);
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
        .where(and(eq(bankEntries.tenantId, tenantId), eq(bankEntries.bankAccountId, id)));
      entries.sort(compareStatementNewestFirst);
      return { account, entries };
    },
  );

  fastify.post(
    '/bank-accounts/:id/entries',
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.object({
          occurredOn: dateString,
          description: z.string().min(1).max(255),
          direction: z.enum(['in', 'out']),
          amount: z.number().int().positive(),
          planAccountId: z.string().uuid(),
        }),
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const data = request.body;
      const entry = await createInvestmentEntry({
        tenantId: request.user.tenantId,
        bankAccountId: id,
        occurredOn: data.occurredOn,
        description: data.description,
        direction: data.direction,
        amount: data.amount,
        planAccountId: data.planAccountId,
      });
      return reply.status(201).send(entry);
    },
  );

  fastify.delete(
    '/bank-entries/:id',
    { schema: { params: z.object({ id: z.string().uuid() }) } },
    async (request) => {
      return deleteInvestmentEntry({
        tenantId: request.user.tenantId,
        entryId: request.params.id,
      });
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
    },
  );

  fastify.delete(
    '/transfers/:id',
    { schema: { params: z.object({ id: z.string().uuid() }) } },
    async (request, _reply) => {
      const { id } = request.params;
      const reversed = await reverseTreasuryTransfer({
        tenantId: request.user.tenantId,
        transferId: id,
      });
      return reversed;
    },
  );
};
