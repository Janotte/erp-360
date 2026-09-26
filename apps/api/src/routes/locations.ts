import { cities, states } from '@erp-360/mod-persons';
import { and, asc, eq, ilike } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { db } from '../db/index.js';
import '../types/fastify.js';

const citiesQuery = z.object({
  stateId: z.string().uuid(),
  busca: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const locationsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.autenticarETenant);

  fastify.get('/states', async () => {
    return db
      .select({
        id: states.id,
        name: states.name,
        abbreviation: states.abbreviation,
      })
      .from(states)
      .orderBy(asc(states.name));
  });

  fastify.get('/cities', { schema: { querystring: citiesQuery } }, async (request) => {
    const { stateId, busca, limit } = request.query as z.infer<typeof citiesQuery>;
    const conditions = [eq(cities.stateId, stateId)];

    if (busca?.trim()) {
      conditions.push(ilike(cities.name, `%${busca.trim()}%`));
    }

    return db
      .select({
        id: cities.id,
        name: cities.name,
      })
      .from(cities)
      .where(and(...conditions))
      .orderBy(asc(cities.name))
      .limit(limit);
  });
};
