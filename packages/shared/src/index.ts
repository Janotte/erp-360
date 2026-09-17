import { z } from 'zod';

export const UserSchema = z.object({
  id: z.string().uuid({ message: "ID precisa ser um UUID válido" }),
  name: z.string().min(3, { message: "Nome deve ter no mínimo 3 caracteres" }),
  email: z.string().email({ message: "E-mail inválido" }),
});

export type User = z.infer<typeof UserSchema>;

export const API_URL = "http://localhost:3000";

