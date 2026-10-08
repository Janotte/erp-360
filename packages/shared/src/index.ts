import { z } from 'zod';

import {
  formatCnpj,
  formatCpf,
  formatPhone,
  formatPostalCode,
  formatTaxId,
  isValidCnpj,
  isValidCpf,
  normalizePhone,
  normalizePostalCode,
  normalizeTaxId,
  onlyDigits,
} from './utils/brazilianDocuments.ts';
import {
  compactSpaces,
  emptyToNull,
  escapeIlike,
  normalizeEmail,
  normalizePersonName,
  toTitleCasePtBr,
} from './utils/text.ts';

export const UserSchema = z.object({
  id: z.string().uuid({ message: 'ID precisa ser um UUID válido' }),
  name: z.string().min(3, { message: 'Nome deve ter no mínimo 3 caracteres' }),
  email: z.string().email({ message: 'E-mail inválido' }),
});

export type User = z.infer<typeof UserSchema>;

export const taxpayerTypes = [1, 2, 9] as const;
export type TaxpayerType = (typeof taxpayerTypes)[number];

export const taxpayerTypeLabels: Record<TaxpayerType, string> = {
  1: '1 - Contribuinte ICMS',
  2: '2 - Isento',
  9: '9 - Não contribuinte',
};

export function parseTaxpayerType(value: unknown): TaxpayerType | null {
  if (value == null || value === '') return null;
  const parsed = Number(String(value).trim());
  if (parsed === 1 || parsed === 2 || parsed === 9) return parsed;
  return null;
}

export const personKinds = ['individual', 'company', 'foreigner'] as const;
export type PersonKind = (typeof personKinds)[number];

export const personKindLabels: Record<PersonKind, string> = {
  individual: 'Física',
  company: 'Jurídica',
  foreigner: 'Estrangeiro',
};

export function parsePersonKind(value: unknown): PersonKind {
  if (value === 'company' || value === 'foreigner') return value;
  return 'individual';
}

const optionalText = (max: number) =>
  z.string().max(max).optional().or(z.literal('')).nullable();

// Schema de validação do Zod para criação de Pessoas
export const PersonSchema = z.object({
  type: z.enum(personKinds).default('individual'),
  name: z.string().min(2, 'O nome deve ter pelo menos 2 caracteres').max(120),
  preserveNameCasing: z.boolean().default(false),
  taxId: optionalText(19),
  taxpayerType: z.union([z.number(), z.string(), z.null()]).optional(),
  stateRegistration: optionalText(20),
  isRuralProducer: z.boolean().default(false),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de data deve ser YYYY-MM-DD')
    .optional()
    .or(z.literal(''))
    .nullable(),
  nfeEmail: z
    .string()
    .email('E-mail inválido')
    .max(60)
    .optional()
    .or(z.literal(''))
    .nullable(),
  documentEmails: z.array(z.string().email('E-mail inválido')).optional().nullable(),
  notes: z.string().optional().or(z.literal('')).nullable(),
  isActive: z.boolean().default(true),
  isVisible: z.boolean().default(true),
  isClient: z.boolean().default(false),
  isSupplier: z.boolean().default(false),
  isEmployee: z.boolean().default(false),
  isFinancialInstitution: z.boolean().default(false),
});

export type Person = z.infer<typeof PersonSchema>;

export const personAddressTypes = [
  'Principal',
  'Faturamento',
  'Entrega',
  'Outro',
] as const;

export const PersonAddressSchema = z.object({
  type: z.enum(personAddressTypes).default('Principal'),
  postalCode: z.string().max(9).optional().or(z.literal('')),
  street: z.string().max(60).optional().or(z.literal('')),
  number: z.string().max(60).optional().or(z.literal('')),
  complement: z.string().max(60).optional().or(z.literal('')),
  neighborhood: z.string().max(60).optional().or(z.literal('')),
  cityId: z.string().uuid({ message: 'Selecione a cidade' }),
});

export type PersonAddressInput = z.infer<typeof PersonAddressSchema>;

export const personContactTypes = ['Principal', 'Outro'] as const;

export const PersonContactSchema = z.object({
  type: z.enum(personContactTypes).default('Principal'),
  relationship: z.string().max(40).optional().or(z.literal('')),
  name: z.string().min(2, 'O nome deve ter pelo menos 2 caracteres').max(60),
  phone: z.string().max(20).optional().or(z.literal('')),
  mobilePhone: z.string().max(20).optional().or(z.literal('')),
  whatsapp: z.string().max(20).optional().or(z.literal('')),
  email: z.string().email('E-mail inválido').max(80).optional().or(z.literal('')),
});

export type PersonContactInput = z.infer<typeof PersonContactSchema>;

const nodeEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } })
  .process?.env;

export const API_URL = nodeEnv?.APP_BASE_URL ?? 'http://localhost:3000';

export {
  compactSpaces,
  emptyToNull,
  escapeIlike,
  formatCnpj,
  formatCpf,
  formatPhone,
  formatPostalCode,
  formatTaxId,
  isValidCnpj,
  isValidCpf,
  normalizeEmail,
  normalizePersonName,
  normalizePhone,
  normalizePostalCode,
  normalizeTaxId,
  onlyDigits,
  toTitleCasePtBr,
};
export * from './utils/FormatCurrency';
export * from './utils/FormatRawDate';
