import { persons } from '@erp-360/mod-persons';
import { PersonSchema } from '@erp-360/shared';
import { and, desc, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import '../types/fastify.js';

const personResponse = PersonSchema;

function toPerson(row: typeof persons.$inferSelect) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
  };
}

export const personsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.autenticarETenant);

  fastify.get(
    '/',
    {
      schema: {
        response: {
          200: z.array(personResponse),
        },
      },
    },
    async (request) => {
      const { tenantId } = request.user;
      const rows = await db
        .select()
        .from(persons)
        .where(eq(persons.tenantId, tenantId))
        .orderBy(desc(persons.createdAt));

      return rows.map(toPerson);
    },
  );

  fastify.get(
    '/:id',
    {
      schema: {
        params: z.object({
          id: z.string().uuid({ message: 'ID precisa ser um UUID válido' }),
        }),
        response: {
          200: personResponse,
          404: z.object({ error: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { tenantId } = request.user;
      const { id } = request.params as { id: string };

      const [row] = await db
        .select()
        .from(persons)
        .where(and(eq(persons.id, id), eq(persons.tenantId, tenantId)))
        .limit(1);

      if (!row) {
        return reply.status(404).send({ error: 'Pessoa não encontrada' });
      }

      return toPerson(row);
    },
  );
};
