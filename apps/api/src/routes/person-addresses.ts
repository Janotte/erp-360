import { cities, personAddresses, persons, states } from '@erp-360/mod-persons';
import { PersonAddressSchema, type PersonAddressInput } from '@erp-360/shared';
import { and, asc, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { db } from '../db/index.js';
import '../types/fastify.js';

const personParams = z.object({
  id: z.string().uuid({ message: 'ID precisa ser um UUID válido' }),
});

const addressParams = personParams.extend({
  addressId: z.string().uuid({ message: 'ID do endereço precisa ser um UUID válido' }),
});

const addressColumns = {
  id: personAddresses.id,
  type: personAddresses.type,
  postalCode: personAddresses.postalCode,
  street: personAddresses.street,
  number: personAddresses.number,
  complement: personAddresses.complement,
  neighborhood: personAddresses.neighborhood,
  cityId: personAddresses.cityId,
  cityName: cities.name,
  stateId: states.id,
  stateAbbreviation: states.abbreviation,
};

function emptyToNull(value?: string | null) {
  return value ? value : null;
}

function toAddressValues(data: PersonAddressInput) {
  return {
    type: data.type,
    postalCode: emptyToNull(data.postalCode),
    street: emptyToNull(data.street),
    number: emptyToNull(data.number),
    complement: emptyToNull(data.complement),
    neighborhood: emptyToNull(data.neighborhood),
    cityId: emptyToNull(data.cityId),
  };
}

async function personBelongsToTenant(personId: string, tenantId: string) {
  const [person] = await db
    .select({ id: persons.id })
    .from(persons)
    .where(and(eq(persons.id, personId), eq(persons.tenantId, tenantId)))
    .limit(1);

  return Boolean(person);
}

function selectAddress(personId: string, tenantId: string, addressId: string) {
  return db
    .select(addressColumns)
    .from(personAddresses)
    .leftJoin(cities, eq(personAddresses.cityId, cities.id))
    .leftJoin(states, eq(cities.stateId, states.id))
    .where(
      and(
        eq(personAddresses.id, addressId),
        eq(personAddresses.personId, personId),
        eq(personAddresses.tenantId, tenantId),
      ),
    );
}

export const personAddressRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/:id/addresses',
    { schema: { params: personParams } },
    async (request, reply) => {
      const { tenantId } = request.user;
      const { id } = request.params as z.infer<typeof personParams>;

      if (!(await personBelongsToTenant(id, tenantId))) {
        return reply.status(404).send({ message: 'Pessoa não encontrada' });
      }

      const addresses = await db
        .select(addressColumns)
        .from(personAddresses)
        .leftJoin(cities, eq(personAddresses.cityId, cities.id))
        .leftJoin(states, eq(cities.stateId, states.id))
        .where(
          and(eq(personAddresses.personId, id), eq(personAddresses.tenantId, tenantId)),
        )
        .orderBy(asc(personAddresses.street), asc(personAddresses.id));

      return addresses;
    },
  );

  fastify.post(
    '/:id/addresses',
    { schema: { params: personParams, body: PersonAddressSchema } },
    async (request, reply) => {
      const { tenantId } = request.user;
      const { id } = request.params as z.infer<typeof personParams>;
      const data = request.body as PersonAddressInput;

      if (!(await personBelongsToTenant(id, tenantId))) {
        return reply.status(404).send({ message: 'Pessoa não encontrada' });
      }

      try {
        const [created] = await db
          .insert(personAddresses)
          .values({
            ...toAddressValues(data),
            personId: id,
            tenantId,
          })
          .returning({ id: personAddresses.id });

        const [address] = await selectAddress(id, tenantId, created.id);
        return reply.status(201).send(address);
      } catch (error) {
        if (isForeignKeyError(error)) {
          return reply.status(400).send({ message: 'Cidade informada não existe.' });
        }
        throw error;
      }
    },
  );

  fastify.put(
    '/:id/addresses/:addressId',
    { schema: { params: addressParams, body: PersonAddressSchema } },
    async (request, reply) => {
      const { tenantId } = request.user;
      const { id, addressId } = request.params as z.infer<typeof addressParams>;
      const data = request.body as PersonAddressInput;

      try {
        const [updated] = await db
          .update(personAddresses)
          .set(toAddressValues(data))
          .where(
            and(
              eq(personAddresses.id, addressId),
              eq(personAddresses.personId, id),
              eq(personAddresses.tenantId, tenantId),
            ),
          )
          .returning({ id: personAddresses.id });

        if (!updated) {
          return reply.status(404).send({ message: 'Endereço não encontrado' });
        }

        const [address] = await selectAddress(id, tenantId, updated.id);
        return address;
      } catch (error) {
        if (isForeignKeyError(error)) {
          return reply.status(400).send({ message: 'Cidade informada não existe.' });
        }
        throw error;
      }
    },
  );

  fastify.delete(
    '/:id/addresses/:addressId',
    { schema: { params: addressParams } },
    async (request, reply) => {
      const { tenantId } = request.user;
      const { id, addressId } = request.params as z.infer<typeof addressParams>;

      const [deleted] = await db
        .delete(personAddresses)
        .where(
          and(
            eq(personAddresses.id, addressId),
            eq(personAddresses.personId, id),
            eq(personAddresses.tenantId, tenantId),
          ),
        )
        .returning({ id: personAddresses.id });

      if (!deleted) {
        return reply.status(404).send({ message: 'Endereço não encontrado' });
      }

      return { success: true };
    },
  );
};

function isForeignKeyError(error: unknown) {
  const candidates = [error, (error as { cause?: unknown } | null)?.cause];
  return candidates.some(
    (candidate) =>
      typeof candidate === 'object' &&
      candidate !== null &&
      'code' in candidate &&
      candidate.code === '23503',
  );
}
