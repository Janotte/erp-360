import '../../types/fastify.ts';

import { ncms } from '@erp-360/mod-catalog';
import { escapeIlike } from '@erp-360/shared';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { db } from '../../db/index.ts';

const searchNcmsQuery = z.object({
  busca: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});

export const ncmRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('preHandler', fastify.autenticarETenant);

  fastify.get('/', { schema: { querystring: searchNcmsQuery } }, async (request) => {
    const term = request.query.busca.trim();
    const like = `%${escapeIlike(term)}%`;
    const digits = term.replace(/\D/g, '');
    const codeLike = digits ? `%${digits}%` : null;

    return db
      .select({ code: ncms.code, description: ncms.description })
      .from(ncms)
      .where(
        and(
          eq(ncms.isActive, true),
          codeLike
            ? sql`(
                unaccent(${ncms.description}) ilike unaccent(${like})
                or replace(${ncms.code}, '.', '') like ${codeLike}
              )`
            : sql`unaccent(${ncms.description}) ilike unaccent(${like})`,
        ),
      )
      .orderBy(asc(ncms.code))
      .limit(request.query.limit);
  });
};
