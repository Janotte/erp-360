import { z } from 'zod';

const text = z.string().nullish();
const cents = z.number().int().nullish();
const id = z.string().uuid().nullish();

export const payableTitleSchema = z.object({
  id: z.string().uuid(),
  creditorId: z.string().uuid(),
  documentNumber: text,
  description: z.string(),
  issueOn: z.string(),
  installmentAmount: z.number().int(),
  dueOn: z.string(),
  paidOn: text,
  paidAmount: cents,
  status: z.enum(['pendente', 'pago', 'cancelado']),
  planAccountId: id,
  personName: text,
});

export type PayableTitle = z.infer<typeof payableTitleSchema>;

export const receivableTitleSchema = z.object({
  id: z.string().uuid(),
  debtorId: z.string().uuid(),
  documentNumber: text,
  description: z.string(),
  issueOn: z.string(),
  installmentAmount: z.number().int(),
  dueOn: z.string(),
  receivedOn: text,
  receivedAmount: cents,
  status: z.enum(['pendente', 'recebido', 'cancelado']),
  planAccountId: id,
  invoiceNumber: text,
  bearerName: text,
  barcode: text,
  bankSlipOurNumber: text,
  financialInstitutionId: id,
  meansOfPaymentId: id,
  cardBrandId: id,
  transactionAuthorization: text,
  personName: text,
});

export type ReceivableTitle = z.infer<typeof receivableTitleSchema>;

export function titlePageSchema<T extends z.ZodType>(row: T) {
  return z.object({
    data: z.array(row),
    meta: z.object({
      total: z.number(),
      page: z.number(),
      limit: z.number(),
      totalPages: z.number(),
    }),
  });
}

export const planAccountNatures = [
  'asset',
  'liability',
  'equity',
  'revenue',
  'expense',
] as const;
export type PlanAccountNature = (typeof planAccountNatures)[number];

export const planAccountNatureLabels: Record<PlanAccountNature, string> = {
  asset: 'Ativo',
  liability: 'Passivo',
  equity: 'Patrimônio líquido',
  revenue: 'Receita',
  expense: 'Despesa',
};

export const planAccountDreLines = [
  'gross_revenue',
  'deduction',
  'cost',
  'operating_expense',
  'financial_income',
  'financial_expense',
  'other_income',
  'other_expense',
] as const;
export type PlanAccountDreLine = (typeof planAccountDreLines)[number];

export const planAccountDreLineLabels: Record<PlanAccountDreLine, string> = {
  gross_revenue: 'Receita bruta',
  deduction: 'Dedução',
  cost: 'Custo',
  operating_expense: 'Despesa operacional',
  financial_income: 'Receita financeira',
  financial_expense: 'Despesa financeira',
  other_income: 'Outra receita',
  other_expense: 'Outra despesa',
};

const revenueDreLines = ['gross_revenue', 'financial_income', 'other_income'] as const;
const expenseDreLines = [
  'deduction',
  'cost',
  'operating_expense',
  'financial_expense',
  'other_expense',
] as const;

export function dreLinesForNature(nature: PlanAccountNature): readonly PlanAccountDreLine[] {
  if (nature === 'revenue') return revenueDreLines;
  if (nature === 'expense') return expenseDreLines;
  return [];
}

export const incomeStatementAccountSchema = z.object({
  accountCode: z.string(),
  name: z.string(),
  amount: z.number().int(),
});

export const incomeStatementLineSchema = z.object({
  line: z.enum(planAccountDreLines),
  amount: z.number().int(),
  accounts: z.array(incomeStatementAccountSchema),
});

export const incomeStatementSchema = z.object({
  from: z.string(),
  to: z.string(),
  lines: z.array(incomeStatementLineSchema),
  netRevenue: z.number().int(),
  grossProfit: z.number().int(),
  operatingResult: z.number().int(),
  financialResult: z.number().int(),
  netIncome: z.number().int(),
});

export type IncomeStatement = z.infer<typeof incomeStatementSchema>;

export const planAccountCatalogSchema = z.object({
  id: z.string().uuid(),
  accountCode: z.string(),
  name: z.string(),
});

export const meansOfPaymentCatalogSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  description: z.string(),
});

export const cardBrandCatalogSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
});

export const planAccountCatalogListSchema = z.array(planAccountCatalogSchema);
export const meansOfPaymentCatalogListSchema = z.array(meansOfPaymentCatalogSchema);
export const cardBrandCatalogListSchema = z.array(cardBrandCatalogSchema);

export const settlementPreviewSchema = z.object({
  originalAmount: z.number(),
  dueOn: z.string(),
  daysLate: z.number(),
  chargeableDays: z.number(),
  fineAmount: z.number(),
  interestAmount: z.number(),
  dueAmount: z.number(),
  settings: z.object({
    lateFeeBps: z.number(),
    dailyInterestBps: z.number(),
    graceDays: z.number(),
    discountObtainedPlanAccountId: z.string().nullish(),
    discountGrantedPlanAccountId: z.string().nullish(),
    lateFeePaidPlanAccountId: z.string().nullish(),
    lateFeeReceivedPlanAccountId: z.string().nullish(),
  }),
});

export type SettlementPreview = z.infer<typeof settlementPreviewSchema>;

const dashboardFlowSchema = z.object({
  total: z.number().int(),
  settled: z.number().int(),
});

const dashboardMonthFlowSchema = dashboardFlowSchema.extend({
  overdue: z.number().int(),
});

const dashboardAccountSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  balance: z.number().int(),
});

const dashboardPaymentSliceSchema = z.object({
  meansOfPaymentId: z.string().uuid().nullable(),
  description: z.string(),
  amount: z.number().int(),
});

export const dashboardSchema = z.object({
  asOf: z.string(),
  monthFrom: z.string(),
  monthTo: z.string(),
  receivables: z.object({
    day: dashboardFlowSchema,
    month: dashboardMonthFlowSchema,
    delinquency: z.number().int(),
  }),
  payables: z.object({
    day: dashboardFlowSchema,
    month: dashboardMonthFlowSchema,
    delinquency: z.number().int(),
  }),
  sales: z.object({
    day: z.number().int(),
    month: z.number().int(),
    byMeansOfPayment: z.object({
      day: z.array(dashboardPaymentSliceSchema),
      month: z.array(dashboardPaymentSliceSchema),
    }),
  }),
  treasury: z.object({
    cashBalance: z.number().int(),
    operating: z.array(dashboardAccountSchema),
    investments: z.array(dashboardAccountSchema),
  }),
});

export type DashboardSummary = z.infer<typeof dashboardSchema>;

const apiFailureSchema = z.object({
  message: z.string().optional(),
  error: z.string().optional(),
});

export function apiErrorMessage(body: unknown, fallback: string): string {
  const parsed = apiFailureSchema.safeParse(body);
  if (!parsed.success) return fallback;
  return parsed.data.message || parsed.data.error || fallback;
}
