import '../../types/fastify.ts';

import { bankAccounts, cardBrands, companyCards, payables } from '@erp-360/mod-financial';
import { inboundDocumentInstallments, inboundDocuments } from '@erp-360/mod-inbound';
import { persons } from '@erp-360/mod-persons';
import { and, asc, eq, isNotNull, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { db } from '../../db/index.ts';
import { uniqueViolation } from '../../lib/postgres-errors.ts';
import { cardStatement, type CardChargeInput } from './card-statement.ts';

const cardBody = z.object({
  name: z.string().trim().min(1).max(60),
  issuerId: z.string().uuid(),
  cardBrandId: z.string().uuid().nullable().optional(),
  closingDay: z.number().int().min(1).max(28),
  dueDay: z.number().int().min(1).max(28),
  bankAccountId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
});

async function assertIssuer(tenantId: string, issuerId: string) {
  const [issuer] = await db
    .select({ id: persons.id, isFinancialInstitution: persons.isFinancialInstitution })
    .from(persons)
    .where(and(eq(persons.id, issuerId), eq(persons.tenantId, tenantId)))
    .limit(1);
  if (!issuer) return 'A instituição informada não existe.';
  if (!issuer.isFinancialInstitution) {
    return 'O emissor precisa ser uma instituição financeira.';
  }
  return null;
}

async function assertBank(tenantId: string, bankAccountId: string | null | undefined) {
  if (!bankAccountId) return null;
  const [account] = await db
    .select({ id: bankAccounts.id })
    .from(bankAccounts)
    .where(and(eq(bankAccounts.id, bankAccountId), eq(bankAccounts.tenantId, tenantId)))
    .limit(1);
  return account ? null : 'A conta informada não existe.';
}

async function assertBrand(cardBrandId: string | null | undefined) {
  if (!cardBrandId) return null;
  const [brand] = await db
    .select({ id: cardBrands.id })
    .from(cardBrands)
    .where(eq(cardBrands.id, cardBrandId))
    .limit(1);
  return brand ? null : 'A bandeira informada não existe.';
}

async function openBalances(tenantId: string) {
  const rows = await db
    .select({
      companyCardId: payables.companyCardId,
      openBalance: sql<string>`coalesce(sum(${payables.installmentAmount}), 0)`,
    })
    .from(payables)
    .where(
      and(
        eq(payables.tenantId, tenantId),
        eq(payables.status, 'pendente'),
        isNotNull(payables.companyCardId),
      ),
    )
    .groupBy(payables.companyCardId);
  return new Map(rows.map((row) => [row.companyCardId, Number(row.openBalance)]));
}

async function listCards(tenantId: string) {
  const [cards, balances] = await Promise.all([
    db
      .select({
        id: companyCards.id,
        name: companyCards.name,
        issuerId: companyCards.issuerId,
        issuerName: persons.name,
        cardBrandId: companyCards.cardBrandId,
        closingDay: companyCards.closingDay,
        dueDay: companyCards.dueDay,
        bankAccountId: companyCards.bankAccountId,
        bankAccountName: bankAccounts.name,
        isActive: companyCards.isActive,
      })
      .from(companyCards)
      .innerJoin(
        persons,
        and(
          eq(persons.id, companyCards.issuerId),
          eq(persons.tenantId, companyCards.tenantId),
        ),
      )
      .leftJoin(
        bankAccounts,
        and(
          eq(bankAccounts.id, companyCards.bankAccountId),
          eq(bankAccounts.tenantId, companyCards.tenantId),
        ),
      )
      .where(eq(companyCards.tenantId, tenantId))
      .orderBy(asc(companyCards.name)),
    openBalances(tenantId),
  ]);
  return cards.map((card) => ({ ...card, openBalance: balances.get(card.id) ?? 0 }));
}

async function cardCharges(tenantId: string, cardId: string): Promise<CardChargeInput[]> {
  const rows = await db
    .select({
      id: payables.id,
      issueOn: payables.issueOn,
      dueOn: payables.dueOn,
      description: payables.description,
      supplierName: inboundDocuments.supplierName,
      documentNumber: inboundDocuments.number,
      documentSeries: inboundDocuments.series,
      installmentNumber: inboundDocumentInstallments.number,
      documentId: inboundDocuments.id,
      amount: payables.installmentAmount,
      status: payables.status,
    })
    .from(payables)
    .leftJoin(
      inboundDocumentInstallments,
      and(
        eq(inboundDocumentInstallments.payableId, payables.id),
        eq(inboundDocumentInstallments.tenantId, payables.tenantId),
      ),
    )
    .leftJoin(
      inboundDocuments,
      and(
        eq(inboundDocuments.id, inboundDocumentInstallments.documentId),
        eq(inboundDocuments.tenantId, inboundDocumentInstallments.tenantId),
      ),
    )
    .where(and(eq(payables.tenantId, tenantId), eq(payables.companyCardId, cardId)));
  return rows;
}

export const companyCardRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('preHandler', fastify.autenticarETenant);

  fastify.get('/company-cards', async (request) => {
    return listCards(request.user.tenantId);
  });

  fastify.get(
    '/company-cards/:id/statement',
    { schema: { params: z.object({ id: z.string().uuid() }) } },
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const { id } = request.params;
      const cards = await listCards(tenantId);
      const card = cards.find((item) => item.id === id);
      if (!card) return reply.status(404).send({ message: 'Cartão não encontrado.' });
      const charges = await cardCharges(tenantId, id);
      const statement = cardStatement(charges);
      return { card: { ...card, openBalance: statement.openBalance }, ...statement };
    },
  );

  fastify.post(
    '/company-cards',
    { schema: { body: cardBody } },
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const body = request.body;
      const issuerError = await assertIssuer(tenantId, body.issuerId);
      if (issuerError) return reply.status(400).send({ message: issuerError });
      const bankError = await assertBank(tenantId, body.bankAccountId);
      if (bankError) return reply.status(400).send({ message: bankError });
      const brandError = await assertBrand(body.cardBrandId);
      if (brandError) return reply.status(400).send({ message: brandError });
      try {
        const [created] = await db
          .insert(companyCards)
          .values({
            tenantId,
            name: body.name,
            issuerId: body.issuerId,
            cardBrandId: body.cardBrandId ?? null,
            closingDay: body.closingDay,
            dueDay: body.dueDay,
            bankAccountId: body.bankAccountId ?? null,
            isActive: body.isActive ?? true,
          })
          .returning({ id: companyCards.id });
        const [card] = await listCards(tenantId).then((rows) =>
          rows.filter((row) => row.id === created.id),
        );
        return reply.status(201).send(card);
      } catch (error) {
        if (uniqueViolation(error)) {
          return reply
            .status(409)
            .send({ message: 'Já existe um cartão com este nome.' });
        }
        throw error;
      }
    },
  );

  fastify.put(
    '/company-cards/:id',
    { schema: { body: cardBody } },
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const id = z
        .string()
        .uuid()
        .parse((request.params as { id: string }).id);
      const body = request.body;
      const issuerError = await assertIssuer(tenantId, body.issuerId);
      if (issuerError) return reply.status(400).send({ message: issuerError });
      const bankError = await assertBank(tenantId, body.bankAccountId);
      if (bankError) return reply.status(400).send({ message: bankError });
      const brandError = await assertBrand(body.cardBrandId);
      if (brandError) return reply.status(400).send({ message: brandError });
      try {
        const [updated] = await db
          .update(companyCards)
          .set({
            name: body.name,
            issuerId: body.issuerId,
            cardBrandId: body.cardBrandId ?? null,
            closingDay: body.closingDay,
            dueDay: body.dueDay,
            bankAccountId: body.bankAccountId ?? null,
            isActive: body.isActive ?? true,
          })
          .where(and(eq(companyCards.id, id), eq(companyCards.tenantId, tenantId)))
          .returning({ id: companyCards.id });
        if (!updated)
          return reply.status(404).send({ message: 'Cartão não encontrado.' });
        const [card] = await listCards(tenantId).then((rows) =>
          rows.filter((row) => row.id === updated.id),
        );
        return card;
      } catch (error) {
        if (uniqueViolation(error)) {
          return reply
            .status(409)
            .send({ message: 'Já existe um cartão com este nome.' });
        }
        throw error;
      }
    },
  );
};
