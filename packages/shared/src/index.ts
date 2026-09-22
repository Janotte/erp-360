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

export const API_URL = 'http://localhost:3000';
