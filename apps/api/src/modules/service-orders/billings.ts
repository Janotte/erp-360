import '../../types/fastify.ts';

import {
  paymentMethods,
  paymentMethodTerms,
  paymentPlanLines,
  paymentPlans,
  receivables,
} from '@erp-360/mod-financial';
import { serviceOrderBillings, serviceOrders } from '@erp-360/mod-service-orders';
import { and, asc, eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { db } from '../../db/index.ts';
import { todayForTenant } from '../contracts/clock.ts';
import {
  serviceOrderBillingDescription,
  serviceOrderBillingDocumentNumber,
} from './billing-labels.ts';
import { formatServiceOrderNumber } from './rules.ts';

const messages = {
  notDelivered: 'A ordem precisa estar entregue para gerar o financeiro.',
  zeroTotal: 'Ordem com total zero não gera financeiro.',
  sum: 'A soma das parcelas precisa ser igual ao total da ordem.',
  emptyLine: 'A parcela precisa ter valor.',
  method: 'A forma de pagamento não está disponível para a ordem.',
  storeCredit: 'Crédito em loja não entra na ordem.',
  already: 'O financeiro desta ordem já foi gerado.',
  done: 'Financeiro gerado.',
};

const billingBody = z.object({
  payments: z
    .array(
      z.object({
        paymentMethodId: z.string().uuid(),
        installmentCount: z.number().int().min(1).max(48),
        dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        amount: z.number().int(),
      }),
    )
    .max(96),
});

type PaymentInput = z.infer<typeof billingBody>['payments'][number];

export type ServiceOrderBillingLine = {
  lineNumber: number;
  dueOn: string;
  amount: number;
  documentNumber: string | null;
  description: string;
  status: 'pendente' | 'recebido' | 'cancelado';
  receivableId: string;
};

function httpError(message: string, status: number): never {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  throw error;
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const current = error as { code?: string; cause?: unknown };
  if (current.code === '23505') return true;
  return current.cause !== error && isUniqueViolation(current.cause);
}

function isoDate(value: unknown) {
  if (value instanceof Date) {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, '0');
    const day = String(value.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(value).slice(0, 10);
}

function assertDueOn(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) httpError('Data de vencimento inválida.', 400);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    httpError('Data de vencimento inválida.', 400);
  }
}

async function loadTerm(tenantId: string, methodId: string, installments: number) {
  const [method] = await db
    .select()
    .from(paymentMethods)
    .where(and(eq(paymentMethods.id, methodId), eq(paymentMethods.tenantId, tenantId)))
    .limit(1);
  if (!method?.isActive || !method.useInServiceOrder) httpError(messages.method, 400);
  if (method.receiptKind === 'store_credit') httpError(messages.storeCredit, 400);

  const [term] = await db
    .select()
    .from(paymentMethodTerms)
    .where(
      and(
        eq(paymentMethodTerms.tenantId, tenantId),
        eq(paymentMethodTerms.paymentMethodId, methodId),
        eq(paymentMethodTerms.installmentCount, installments),
      ),
    )
    .limit(1);
  if (!term) httpError('Esta forma não tem a quantidade de parcelas escolhida.', 400);
  return { method, term };
}

async function confirmedLines(tenantId: string, payments: PaymentInput[]) {
  const lines = [];
  for (const payment of payments) {
    if (payment.amount <= 0) httpError(messages.emptyLine, 400);
    assertDueOn(payment.dueOn);
    const { method, term } = await loadTerm(
      tenantId,
      payment.paymentMethodId,
      payment.installmentCount,
    );
    lines.push({
      paymentMethodId: method.id,
      methodName: method.name,
      dueOn: payment.dueOn,
      amount: payment.amount,
      installmentCount: payment.installmentCount,
      meansOfPaymentId: method.meansOfPaymentId,
      interestType: term.interestType,
      interestRateBps: term.interestRateBps,
      administrativeFeeBps: term.administrativeFeeBps,
      fixedFeeAmount: term.fixedFeeAmount,
      firstDueDays: term.firstDueDays,
      intervalDays: term.intervalDays,
      receiptKind: method.receiptKind,
      integrationType: method.integrationType,
      acquirerId: method.acquirerId,
      cardBrandId: method.cardBrandId,
    });
  }
  return lines;
}

export async function listServiceOrderBillings(
  tenantId: string,
  orderId: string,
): Promise<ServiceOrderBillingLine[]> {
  const rows = await db
    .select({
      lineNumber: serviceOrderBillings.lineNumber,
      dueOn: serviceOrderBillings.dueOn,
      amount: serviceOrderBillings.amount,
      documentNumber: receivables.documentNumber,
      description: receivables.description,
      status: receivables.status,
      receivableId: receivables.id,
    })
    .from(serviceOrderBillings)
    .innerJoin(
      receivables,
      and(
        eq(receivables.id, serviceOrderBillings.receivableId),
        eq(receivables.tenantId, serviceOrderBillings.tenantId),
      ),
    )
    .where(
      and(
        eq(serviceOrderBillings.tenantId, tenantId),
        eq(serviceOrderBillings.serviceOrderId, orderId),
      ),
    )
    .orderBy(asc(serviceOrderBillings.lineNumber));

  return rows.map((row) => ({
    lineNumber: row.lineNumber,
    dueOn: isoDate(row.dueOn),
    amount: row.amount,
    documentNumber: row.documentNumber,
    description: row.description,
    status: row.status,
    receivableId: row.receivableId,
  }));
}

const emptyPaymentSnapshot = {
  paymentMethodId: null,
  paymentInstallments: null,
  meansOfPaymentId: null,
  interestType: null,
  interestRateBps: null,
  administrativeFeeBps: null,
  fixedFeeAmount: null,
  firstDueDays: null,
  intervalDays: null,
  receiptKind: null,
  integrationType: null,
  acquirerId: null,
  cardBrandId: null,
};

export async function generateServiceOrderBillings(
  tenantId: string,
  orderId: string,
  payments: PaymentInput[],
) {
  const [order] = await db
    .select({
      id: serviceOrders.id,
      number: serviceOrders.number,
      status: serviceOrders.status,
      totalAmount: serviceOrders.totalAmount,
      personId: serviceOrders.personId,
      paymentPlanId: serviceOrders.paymentPlanId,
    })
    .from(serviceOrders)
    .where(and(eq(serviceOrders.id, orderId), eq(serviceOrders.tenantId, tenantId)))
    .limit(1);
  if (!order) httpError('Ordem não encontrada.', 404);

  const existing = await listServiceOrderBillings(tenantId, orderId);
  if (existing.length > 0) {
    return { created: false as const, message: messages.already, billings: existing };
  }
  if (order.status !== 'delivered') httpError(messages.notDelivered, 400);
  if (order.totalAmount === 0) httpError(messages.zeroTotal, 400);

  const lines = await confirmedLines(tenantId, payments);
  const allocated = lines.reduce((sum, line) => sum + line.amount, 0);
  if (allocated !== order.totalAmount) httpError(messages.sum, 400);

  const today = await todayForTenant(tenantId);
  const numberLabel = formatServiceOrderNumber(order.number);

  try {
    await db.transaction(async (tx) => {
      let planId = order.paymentPlanId;
      if (!planId) {
        const [plan] = await tx
          .insert(paymentPlans)
          .values({ tenantId })
          .returning({ id: paymentPlans.id });
        if (!plan) throw new Error('Não foi possível gravar o pagamento.');
        planId = plan.id;
      } else {
        await tx
          .delete(paymentPlanLines)
          .where(
            and(eq(paymentPlanLines.tenantId, tenantId), eq(paymentPlanLines.planId, planId)),
          );
      }

      await tx.insert(paymentPlanLines).values(
        lines.map((line, index) => ({
          tenantId,
          planId,
          lineNumber: index + 1,
          ...line,
        })),
      );
      await tx
        .update(serviceOrders)
        .set({ paymentPlanId: planId, ...emptyPaymentSnapshot })
        .where(and(eq(serviceOrders.id, orderId), eq(serviceOrders.tenantId, tenantId)));

      for (const [index, line] of lines.entries()) {
        const lineNumber = index + 1;
        const [title] = await tx
          .insert(receivables)
          .values({
            tenantId,
            debtorId: order.personId,
            documentNumber: serviceOrderBillingDocumentNumber(order.number, lineNumber),
            description: serviceOrderBillingDescription(numberLabel, lineNumber),
            issueOn: today,
            installmentAmount: line.amount,
            dueOn: line.dueOn,
            status: 'pendente',
            planAccountId: null,
            paymentMethodId: line.paymentMethodId,
            meansOfPaymentId: line.meansOfPaymentId,
          })
          .returning({ id: receivables.id });
        if (!title) throw new Error('Não foi possível gravar o título.');
        await tx.insert(serviceOrderBillings).values({
          tenantId,
          serviceOrderId: orderId,
          lineNumber,
          dueOn: line.dueOn,
          amount: line.amount,
          receivableId: title.id,
        });
      }
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return {
      created: false as const,
      message: messages.already,
      billings: await listServiceOrderBillings(tenantId, orderId),
    };
  }

  return {
    created: true as const,
    message: messages.done,
    billings: await listServiceOrderBillings(tenantId, orderId),
  };
}

export const serviceOrderBillingRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.post(
    '/:id/billings',
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: billingBody,
      },
    },
    async (request, reply) => {
      const result = await generateServiceOrderBillings(
        request.user.tenantId,
        request.params.id,
        request.body.payments,
      );
      if (!result.created) {
        return reply.status(409).send({ message: result.message, billings: result.billings });
      }
      return { message: result.message, billings: result.billings };
    },
  );
};
