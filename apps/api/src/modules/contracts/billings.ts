import '../../types/fastify.ts';

import { contractBillings, contracts } from '@erp-360/mod-contracts';
import { paymentMethods, receivables } from '@erp-360/mod-financial';
import { type ContractBillingKind, contractInstallmentsDue } from '@erp-360/shared';
import { and, eq, ne } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { db } from '../../db/index.ts';
import { todayForTenant } from './clock.ts';
import { formatContractNumber } from './rules.ts';

const spanByKind: Record<ContractBillingKind, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
};

const billingResultSchema = z.object({
  contracts: z.number().int(),
  titles: z.number().int(),
  amount: z.number().int(),
  failures: z.array(
    z.object({
      contractId: z.string().uuid(),
      numberLabel: z.string(),
      message: z.string(),
    }),
  ),
});

type BillingFailure = z.infer<typeof billingResultSchema>['failures'][number];

function httpError(message: string, status: number): never {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  throw error;
}

function monthLabel(year: number, month: number) {
  return `${String(month).padStart(2, '0')}/${year}`;
}

/** Mensal: `10/2026`. Demais: `10/2026 a 12/2026`, do mês inicial ao último mês do período. */
export function contractBillingPeriodLabel(
  kind: ContractBillingKind,
  competence: string,
) {
  const [yearText, monthText] = competence.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const start = monthLabel(year, month);
  if (kind === 'monthly') return start;
  const index = year * 12 + (month - 1) + spanByKind[kind] - 1;
  return `${start} a ${monthLabel(Math.floor(index / 12), (index % 12) + 1)}`;
}

export function contractBillingDescription(
  numberLabel: string,
  kind: ContractBillingKind,
  competence: string,
) {
  return `Contrato ${numberLabel} · competência ${contractBillingPeriodLabel(kind, competence)}`;
}

export function contractBillingDocumentNumber(number: number, competence: string) {
  const digits = formatContractNumber(number).replace(/\./g, '');
  const [year, month] = competence.split('-');
  return `${digits}${year}${month}`;
}

function failureMessage(error: unknown) {
  if (
    error instanceof Error &&
    'status' in error &&
    typeof error.status === 'number' &&
    error.status < 500
  ) {
    return error.message;
  }
  return 'Não foi possível gerar a cobrança deste contrato.';
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const current = error as { code?: string; cause?: unknown };
  if (current.code === '23505') return true;
  return current.cause !== error && isUniqueViolation(current.cause);
}

async function requireBillable(tenantId: string, contractId: string) {
  const [row] = await db
    .select({
      status: contracts.status,
      billingKind: contracts.billingKind,
    })
    .from(contracts)
    .where(and(eq(contracts.id, contractId), eq(contracts.tenantId, tenantId)))
    .limit(1);
  if (!row) httpError('Contrato não encontrado.', 404);
  if (row.status !== 'active' || row.billingKind === 'none') {
    httpError('Só contrato vigente com cobrança gera parcela.', 400);
  }
}

async function dueContracts(tenantId: string, contractId?: string) {
  const filters = [
    eq(contracts.tenantId, tenantId),
    eq(contracts.status, 'active'),
    ne(contracts.billingKind, 'none'),
  ];
  if (contractId) filters.push(eq(contracts.id, contractId));

  const rows = await db
    .select({
      id: contracts.id,
      number: contracts.number,
      personId: contracts.personId,
      startedOn: contracts.startedOn,
      endedOn: contracts.endedOn,
      billingKind: contracts.billingKind,
      billingCompetence: contracts.billingCompetence,
      periodAmount: contracts.periodAmount,
      dueDay: contracts.dueDay,
      paymentMethodId: contracts.paymentMethodId,
      planAccountId: contracts.planAccountId,
    })
    .from(contracts)
    .where(and(...filters));

  const billedFilters = [eq(contractBillings.tenantId, tenantId)];
  if (contractId) billedFilters.push(eq(contractBillings.contractId, contractId));
  const billedRows = await db
    .select({
      contractId: contractBillings.contractId,
      competence: contractBillings.competence,
    })
    .from(contractBillings)
    .where(and(...billedFilters));

  const billed = new Map<string, string[]>();
  for (const row of billedRows) {
    const list = billed.get(row.contractId) ?? [];
    list.push(row.competence);
    billed.set(row.contractId, list);
  }

  const today = await todayForTenant(tenantId);
  return rows.flatMap((row) => {
    if (
      row.billingKind === 'none' ||
      !row.billingCompetence ||
      !row.dueDay ||
      row.periodAmount <= 0
    ) {
      return [];
    }
    const installments = contractInstallmentsDue({
      startedOn: row.startedOn,
      endedOn: row.endedOn,
      billingKind: row.billingKind,
      billingCompetence: row.billingCompetence,
      dueDay: row.dueDay,
      asOf: today,
      billedCompetences: billed.get(row.id) ?? [],
    });
    if (installments.length === 0) return [];
    return [{ ...row, billingKind: row.billingKind, installments }];
  });
}

export async function previewContractBillings(tenantId: string, contractId?: string) {
  if (contractId) await requireBillable(tenantId, contractId);
  const rows = await dueContracts(tenantId, contractId);
  return {
    contracts: rows.length,
    titles: rows.reduce((sum, row) => sum + row.installments.length, 0),
    amount: rows.reduce(
      (sum, row) => sum + row.periodAmount * row.installments.length,
      0,
    ),
    failures: [] as BillingFailure[],
  };
}

async function paymentOf(tenantId: string, paymentMethodId: string | null) {
  if (!paymentMethodId) return { paymentMethodId: null, meansOfPaymentId: null };
  const [method] = await db
    .select({ meansOfPaymentId: paymentMethods.meansOfPaymentId })
    .from(paymentMethods)
    .where(
      and(eq(paymentMethods.id, paymentMethodId), eq(paymentMethods.tenantId, tenantId)),
    )
    .limit(1);
  if (!method)
    httpError('A forma de pagamento do contrato não está mais disponível.', 400);
  return { paymentMethodId, meansOfPaymentId: method.meansOfPaymentId };
}

export async function generateContractBillings(tenantId: string, contractId?: string) {
  if (contractId) await requireBillable(tenantId, contractId);
  const today = await todayForTenant(tenantId);
  const rows = await dueContracts(tenantId, contractId);
  let contractsBilled = 0;
  let titles = 0;
  let amount = 0;
  const failures: BillingFailure[] = [];

  for (const row of rows) {
    try {
      const payment = await paymentOf(tenantId, row.paymentMethodId);
      const numberLabel = formatContractNumber(row.number);
      await db.transaction(async (tx) => {
        for (const installment of row.installments) {
          const [title] = await tx
            .insert(receivables)
            .values({
              tenantId,
              debtorId: row.personId,
              documentNumber: contractBillingDocumentNumber(
                row.number,
                installment.competence,
              ),
              description: contractBillingDescription(
                numberLabel,
                row.billingKind,
                installment.competence,
              ),
              issueOn: today,
              installmentAmount: row.periodAmount,
              dueOn: installment.dueOn,
              status: 'pendente',
              planAccountId: row.planAccountId,
              ...payment,
            })
            .returning({ id: receivables.id });
          await tx.insert(contractBillings).values({
            tenantId,
            contractId: row.id,
            competence: installment.competence,
            dueOn: installment.dueOn,
            amount: row.periodAmount,
            receivableId: title.id,
          });
        }
      });
      contractsBilled += 1;
      titles += row.installments.length;
      amount += row.periodAmount * row.installments.length;
    } catch (error) {
      if (isUniqueViolation(error)) continue;
      failures.push({
        contractId: row.id,
        numberLabel: formatContractNumber(row.number),
        message: failureMessage(error),
      });
    }
  }

  return { contracts: contractsBilled, titles, amount, failures };
}

const contractQuery = z.object({
  contractId: z.string().uuid().optional(),
});

export const contractBillingRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    '/billings/preview',
    { schema: { querystring: contractQuery, response: { 200: billingResultSchema } } },
    async (request) =>
      previewContractBillings(request.user.tenantId, request.query.contractId),
  );

  fastify.post(
    '/billings',
    {
      schema: {
        body: contractQuery,
        response: { 200: billingResultSchema },
      },
    },
    async (request) =>
      generateContractBillings(request.user.tenantId, request.body.contractId),
  );
};
