import { listPageSizes } from '@erp-360/shared';
import { z } from 'zod';

export const listPageQuery = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.preprocess(
    (value) => (value === undefined || value === '' ? undefined : value),
    z.coerce
      .number()
      .int()
      .refine((value) => (listPageSizes as readonly number[]).includes(value), {
        message: 'A quantidade por página é 5, 10, 20 ou 50.',
      })
      .optional(),
  ),
};
