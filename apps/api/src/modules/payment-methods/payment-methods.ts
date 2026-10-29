import '../../types/fastify.ts';

import {
  bankAccounts,
  cardBrands,
  meansOfPayment,
  paymentIntegrationTypes,
  paymentInterestTypes,
  paymentMethods,
  paymentMethodTerms,
  paymentReceiptKinds,
} from '@erp-360/mod-financial';
import { persons } from '@erp-360/mod-persons';
import { civilDate, escapeIlike, isValidCnpj, onlyDigits } from '@erp-360/shared';
import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { db } from '../../db/index.ts';
import {
  paymentChannels,
  type PaymentIntegrationType,
  type PaymentInterestType,
  type PaymentMethodRuleInput,
  paymentMethodRuleMessage,
  type PaymentReceiptKind,
} from './rules.ts';

const termBodySchema = z
  .object({
    installmentCount: z.number().int().min(1).max(48),
    firstDueDays: z.number().int().min(0).max(365).default(0),
    intervalDays: z.number().int().min(0).max(365).default(0),
    interestType: z.enum(paymentInterestTypes).default('none'),
    interestRateBps: z.number().int().min(0).max(10000).default(0),
    administrativeFeeBps: z.number().int().min(0).max(10000).default(0),
    fixedFeeAmount: z.number().int().min(0).default(0),
  })
  .superRefine((term, ctx) => {
    const intervalOk =
      (term.installmentCount === 1 && term.intervalDays === 0) ||
      (term.installmentCount > 1 && term.intervalDays >= 1);
    if (!intervalOk) {
      ctx.addIssue({
        code: 'custom',
        path: ['intervalDays'],
        message:
          term.installmentCount === 1
            ? 'À vista não tem intervalo entre parcelas.'
            : 'Informe o intervalo entre as parcelas.',
      });
    }
    const rateOk =
      ((term.interestType === 'none' || term.interestType === 'issuer') &&
        term.interestRateBps === 0) ||
      ((term.interestType === 'simple' ||
        term.interestType === 'price' ||
        term.interestType === 'flat') &&
        term.interestRateBps > 0);
    if (!rateOk) {
      ctx.addIssue({
        code: 'custom',
        path: ['interestRateBps'],
        message:
          term.interestType === 'none' || term.interestType === 'issuer'
            ? 'Esta condição não leva taxa de juros.'
            : 'Informe a taxa de juros em basis points.',
      });
    }
  });

const paymentMethodBodySchema = z.object({
  code: z.string().trim().min(1).max(15),
  name: z.string().trim().min(1).max(60),
  meansOfPaymentId: z.string().uuid(),
  isActive: z.boolean().optional().default(true),
  receiptKind: z.enum(paymentReceiptKinds),
  settlementDays: z.number().int().min(0).max(365).nullish(),
  integrationType: z.enum(paymentIntegrationTypes).nullish(),
  acquirerId: z.string().uuid().nullish(),
  cardBrandId: z.string().uuid().nullish(),
  bankAccountId: z.string().uuid().nullish(),
  useInQuote: z.boolean().optional().default(true),
  useInSale: z.boolean().optional().default(true),
  useInPos: z.boolean().optional().default(true),
  useInServiceOrder: z.boolean().optional().default(true),
  sortOrder: z.number().int().optional().default(0),
  terms: z.array(termBodySchema).min(1, 'Informe ao menos uma condição.'),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  sortField: z.enum(['sortOrder', 'code', 'name']).default('sortOrder'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
  busca: z.string().optional(),
  isActive: z.enum(['true', 'false']).optional(),
  channel: z.enum(paymentChannels).optional(),
});

const idParamsSchema = z.object({
  id: z.string().uuid({ message: 'ID precisa ser um UUID válido' }),
});

type PaymentMethodBody = z.infer<typeof paymentMethodBodySchema>;

function reject(status: number, message: string): never {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  throw error;
}

function normalize(data: PaymentMethodBody): PaymentMethodRuleInput & {
  code: string;
  name: string;
  meansOfPaymentId: string;
  isActive: boolean;
  sortOrder: number;
  terms: PaymentMethodBody['terms'];
} {
  const code = data.code.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9-]{0,14}$/.test(code)) {
    reject(400, 'O código usa letras, números e hífen, em maiúsculas.');
  }
  return {
    code,
    name: data.name.trim(),
    meansOfPaymentId: data.meansOfPaymentId,
    isActive: data.isActive ?? true,
    receiptKind: data.receiptKind,
    settlementDays: data.settlementDays ?? null,
    integrationType: data.integrationType ?? null,
    acquirerId: data.acquirerId ?? null,
    cardBrandId: data.cardBrandId ?? null,
    bankAccountId: data.bankAccountId ?? null,
    useInQuote: data.useInQuote ?? true,
    useInSale: data.useInSale ?? true,
    useInPos: data.useInPos ?? true,
    useInServiceOrder: data.useInServiceOrder ?? true,
    sortOrder: data.sortOrder ?? 0,
    terms: data.terms,
  };
}

async function assertReferences(
  tenantId: string,
  data: ReturnType<typeof normalize>,
) {
  const [mean] = await db
    .select({
      fiscalGroup: meansOfPayment.fiscalGroup,
      isSelectable: meansOfPayment.isSelectable,
      startsOn: meansOfPayment.startsOn,
      endsOn: meansOfPayment.endsOn,
    })
    .from(meansOfPayment)
    .where(eq(meansOfPayment.id, data.meansOfPaymentId));
  if (!mean) reject(400, 'Meio de pagamento não encontrado.');

  const message = paymentMethodRuleMessage(data, mean, civilDate());
  if (message) reject(400, message);

  if (data.acquirerId) {
    const [acquirer] = await db
      .select({
        isFinancialInstitution: persons.isFinancialInstitution,
        taxId: persons.taxId,
      })
      .from(persons)
      .where(and(eq(persons.id, data.acquirerId), eq(persons.tenantId, tenantId)));
    if (!acquirer) reject(400, 'A credenciadora não pertence a esta empresa.');
    if (!acquirer.isFinancialInstitution) {
      reject(400, 'A credenciadora precisa ser uma instituição financeira.');
    }
    if (data.integrationType === 'integrated' && !isValidCnpj(onlyDigits(acquirer.taxId ?? ''))) {
      reject(400, 'A credenciadora integrada precisa ter CNPJ válido.');
    }
  }

  if (data.bankAccountId) {
    const [account] = await db
      .select({ id: bankAccounts.id })
      .from(bankAccounts)
      .where(and(eq(bankAccounts.id, data.bankAccountId), eq(bankAccounts.tenantId, tenantId)));
    if (!account) reject(400, 'A conta bancária não pertence a esta empresa.');
  }

  if (data.cardBrandId) {
    const [brand] = await db
      .select({ id: cardBrands.id })
      .from(cardBrands)
      .where(eq(cardBrands.id, data.cardBrandId));
    if (!brand) reject(400, 'A bandeira informada não existe.');
  }
}

function methodValues(data: ReturnType<typeof normalize>) {
  return {
    code: data.code,
    name: data.name,
    meansOfPaymentId: data.meansOfPaymentId,
    isActive: data.isActive,
    receiptKind: data.receiptKind as PaymentReceiptKind,
    settlementDays: data.settlementDays,
    integrationType: data.integrationType as PaymentIntegrationType | null,
    acquirerId: data.acquirerId,
    cardBrandId: data.cardBrandId,
    bankAccountId: data.bankAccountId,
    useInQuote: data.useInQuote,
    useInSale: data.useInSale,
    useInPos: data.useInPos,
    useInServiceOrder: data.useInServiceOrder,
    sortOrder: data.sortOrder,
  };
}

function termValues(tenantId: string, paymentMethodId: string, terms: PaymentMethodBody['terms']) {
  return terms.map((term) => ({
    tenantId,
    paymentMethodId,
    installmentCount: term.installmentCount,
    firstDueDays: term.firstDueDays,
    intervalDays: term.intervalDays,
    interestType: term.interestType as PaymentInterestType,
    interestRateBps: term.interestRateBps,
    administrativeFeeBps: term.administrativeFeeBps,
    fixedFeeAmount: term.fixedFeeAmount,
  }));
}

async function termsOf(tenantId: string, methodIds: string[]) {
  if (methodIds.length === 0) return new Map<string, (typeof paymentMethodTerms.$inferSelect)[]>();
  const rows = await db
    .select()
    .from(paymentMethodTerms)
    .where(
      and(
        eq(paymentMethodTerms.tenantId, tenantId),
        inArray(paymentMethodTerms.paymentMethodId, methodIds),
      ),
    )
    .orderBy(asc(paymentMethodTerms.installmentCount));
  const grouped = new Map<string, (typeof paymentMethodTerms.$inferSelect)[]>();
  for (const row of rows) {
    const list = grouped.get(row.paymentMethodId) ?? [];
    list.push(row);
    grouped.set(row.paymentMethodId, list);
  }
  return grouped;
}

export const paymentMethodRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('preHandler', fastify.autenticarETenant);

  fastify.post(
    '/',
    { schema: { body: paymentMethodBodySchema } },
    async (request, reply) => {
      const { tenantId } = request.user;
      const data = normalize(request.body);
      await assertReferences(tenantId, data);

      const created = await db.transaction(async (tx) => {
        const [method] = await tx
          .insert(paymentMethods)
          .values({ ...methodValues(data), tenantId })
          .returning();
        const terms = await tx
          .insert(paymentMethodTerms)
          .values(termValues(tenantId, method.id, data.terms))
          .returning();
        return { ...method, terms };
      });

      return reply.status(201).send(created);
    },
  );

  fastify.get(
    '/',
    { schema: { querystring: listQuerySchema } },
    async (request) => {
      const { tenantId } = request.user;
      const { page, limit, sortField, sortOrder, busca: search, isActive, channel } =
        request.query;
      const offset = (page - 1) * limit;
      const conditions = [eq(paymentMethods.tenantId, tenantId)];
      if (isActive) conditions.push(eq(paymentMethods.isActive, isActive === 'true'));
      if (channel === 'quote') conditions.push(eq(paymentMethods.useInQuote, true));
      if (channel === 'sale') conditions.push(eq(paymentMethods.useInSale, true));
      if (channel === 'pos') conditions.push(eq(paymentMethods.useInPos, true));
      if (channel === 'serviceOrder') conditions.push(eq(paymentMethods.useInServiceOrder, true));
      if (search) {
        const like = `%${escapeIlike(search)}%`;
        conditions.push(or(ilike(paymentMethods.code, like), ilike(paymentMethods.name, like))!);
      }

      const sortColumns = {
        sortOrder: paymentMethods.sortOrder,
        code: paymentMethods.code,
        name: paymentMethods.name,
      } as const;
      const sortColumn = sortColumns[sortField];
      const orderBy =
        sortOrder === 'asc'
          ? [asc(sortColumn), asc(paymentMethods.name), asc(paymentMethods.id)]
          : [desc(sortColumn), asc(paymentMethods.name), asc(paymentMethods.id)];

      const where = and(...conditions);
      const data = await db
        .select()
        .from(paymentMethods)
        .where(where)
        .orderBy(...orderBy)
        .limit(limit)
        .offset(offset);
      const [totalCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(paymentMethods)
        .where(where);
      const terms = await termsOf(
        tenantId,
        data.map((method) => method.id),
      );

      return {
        data: data.map((method) => ({ ...method, terms: terms.get(method.id) ?? [] })),
        meta: {
          total: Number(totalCount?.count || 0),
          page,
          limit,
          totalPages: Math.ceil(Number(totalCount?.count || 0) / limit),
        },
      };
    },
  );

  fastify.get('/:id', { schema: { params: idParamsSchema } }, async (request, reply) => {
    const { tenantId } = request.user;
    const { id } = request.params;
    const [method] = await db
      .select()
      .from(paymentMethods)
      .where(and(eq(paymentMethods.id, id), eq(paymentMethods.tenantId, tenantId)));
    if (!method) return reply.status(404).send({ message: 'Forma de pagamento não encontrada.' });
    const terms = await termsOf(tenantId, [id]);
    return { ...method, terms: terms.get(id) ?? [] };
  });

  fastify.put(
    '/:id',
    { schema: { params: idParamsSchema, body: paymentMethodBodySchema } },
    async (request, reply) => {
      const { tenantId } = request.user;
      const { id } = request.params;
      const data = normalize(request.body);
      await assertReferences(tenantId, data);

      const updated = await db.transaction(async (tx) => {
        const [method] = await tx
          .update(paymentMethods)
          .set(methodValues(data))
          .where(and(eq(paymentMethods.id, id), eq(paymentMethods.tenantId, tenantId)))
          .returning();
        if (!method) return null;
        await tx
          .delete(paymentMethodTerms)
          .where(
            and(eq(paymentMethodTerms.paymentMethodId, id), eq(paymentMethodTerms.tenantId, tenantId)),
          );
        const terms = await tx
          .insert(paymentMethodTerms)
          .values(termValues(tenantId, id, data.terms))
          .returning();
        return { ...method, terms };
      });

      if (!updated) {
        return reply.status(404).send({ message: 'Forma de pagamento não encontrada.' });
      }
      return updated;
    },
  );

  fastify.patch(
    '/:id',
    {
      schema: {
        params: idParamsSchema,
        body: z.object({ isActive: z.boolean() }),
      },
    },
    async (request, reply) => {
      const { tenantId } = request.user;
      const { id } = request.params;
      if (request.body.isActive) {
        const [current] = await db
          .select()
          .from(paymentMethods)
          .where(and(eq(paymentMethods.id, id), eq(paymentMethods.tenantId, tenantId)));
        if (!current) {
          return reply.status(404).send({ message: 'Forma de pagamento não encontrada.' });
        }
        const currentTerms = await termsOf(tenantId, [id]);
        await assertReferences(tenantId, {
          code: current.code,
          name: current.name,
          meansOfPaymentId: current.meansOfPaymentId,
          isActive: true,
          receiptKind: current.receiptKind,
          settlementDays: current.settlementDays,
          integrationType: current.integrationType,
          acquirerId: current.acquirerId,
          cardBrandId: current.cardBrandId,
          bankAccountId: current.bankAccountId,
          useInQuote: current.useInQuote,
          useInSale: current.useInSale,
          useInPos: current.useInPos,
          useInServiceOrder: current.useInServiceOrder,
          sortOrder: current.sortOrder,
          terms: currentTerms.get(id) ?? [],
        });
      }
      const [updated] = await db
        .update(paymentMethods)
        .set({ isActive: request.body.isActive })
        .where(and(eq(paymentMethods.id, id), eq(paymentMethods.tenantId, tenantId)))
        .returning();
      if (!updated) {
        return reply.status(404).send({ message: 'Forma de pagamento não encontrada.' });
      }
      const terms = await termsOf(tenantId, [id]);
      return { ...updated, terms: terms.get(id) ?? [] };
    },
  );
};
