import { z } from 'zod';

export const UserSchema = z.object({
  id: z.string().uuid({ message: 'ID precisa ser um UUID válido' }),
  name: z.string().min(3, { message: 'Nome deve ter no mínimo 3 caracteres' }),
  email: z.string().email({ message: 'E-mail inválido' }),
});

export type User = z.infer<typeof UserSchema>;

// Schema de validação do Zod para criação de Pessoas
export const PersonSchema = z.object({
  name: z.string().min(2, 'O nome deve ter pelo menos 2 caracteres'),
  document: z.string().optional(),
  email: z.string().email('E-mail inválido').optional().or(z.literal('')),
  phone: z.string().optional(),
  isClient: z.boolean().default(false),
  isSupplier: z.boolean().default(false),
  isEmployee: z.boolean().default(false),
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
  number: z.string().max(10).optional().or(z.literal('')),
  complement: z.string().max(30).optional().or(z.literal('')),
  neighborhood: z.string().max(50).optional().or(z.literal('')),
  cityId: z.string().uuid().optional().or(z.literal('')).or(z.null()),
});

export type PersonAddressInput = z.infer<typeof PersonAddressSchema>;

export const personContactTypes = ['Principal', 'Outro'] as const;

export const PersonContactSchema = z.object({
  type: z.enum(personContactTypes).default('Principal'),
  department: z.string().min(1, 'Informe o departamento').max(40),
  name: z.string().min(2, 'O nome deve ter pelo menos 2 caracteres').max(60),
  phone: z.string().max(20).optional().or(z.literal('')),
  mobilePhone: z.string().max(20).optional().or(z.literal('')),
  email: z.string().email('E-mail inválido').max(80).optional().or(z.literal('')),
});

export type PersonContactInput = z.infer<typeof PersonContactSchema>;

export const API_URL = 'http://localhost:3000';

export * from './utils/FormatCurrency';
export * from './utils/FormatRawDate';
