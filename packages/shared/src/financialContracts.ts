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
  paymentMethodId: id,
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

export const planAccountCatalogSchema = z.object({
  id: z.string().uuid(),
  accountCode: z.string(),
  name: z.string(),
});

export const paymentMethodCatalogSchema = z.object({
  id: z.string().uuid(),
  paymentTypeCode: z.string(),
  description: z.string(),
});

export const cardBrandCatalogSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
});

export const planAccountCatalogListSchema = z.array(planAccountCatalogSchema);
export const paymentMethodCatalogListSchema = z.array(paymentMethodCatalogSchema);
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

const apiFailureSchema = z.object({
  message: z.string().optional(),
  error: z.string().optional(),
});

export function apiErrorMessage(body: unknown, fallback: string): string {
  const parsed = apiFailureSchema.safeParse(body);
  if (!parsed.success) return fallback;
  return parsed.data.message || parsed.data.error || fallback;
}
