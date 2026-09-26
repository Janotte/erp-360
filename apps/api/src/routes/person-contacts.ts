import { personContacts, persons } from '@erp-360/mod-persons';
import { PersonContactSchema, type PersonContactInput } from '@erp-360/shared';
import { and, asc, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { db } from '../db/index.js';
import '../types/fastify.js';

const personParams = z.object({
  id: z.string().uuid({ message: 'ID precisa ser um UUID válido' }),
});

const contactParams = personParams.extend({
  contactId: z.string().uuid({ message: 'ID do contato precisa ser um UUID válido' }),
});

const contactColumns = {
  id: personContacts.id,
  type: personContacts.type,
  department: personContacts.department,
  name: personContacts.name,
  phone: personContacts.phone,
  mobilePhone: personContacts.mobilePhone,
  email: personContacts.email,
};

function emptyToNull(value?: string | null) {
  return value ? value : null;
}

function toContactValues(data: PersonContactInput) {
  return {
    type: data.type,
    department: data.department,
    name: data.name,
    phone: emptyToNull(data.phone),
    mobilePhone: emptyToNull(data.mobilePhone),
    email: emptyToNull(data.email),
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

function selectContact(personId: string, tenantId: string, contactId: string) {
  return db
    .select(contactColumns)
    .from(personContacts)
    .where(
      and(
        eq(personContacts.id, contactId),
        eq(personContacts.personId, personId),
        eq(personContacts.tenantId, tenantId),
      ),
    );
}

export const personContactRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/:id/contacts',
    { schema: { params: personParams } },
    async (request, reply) => {
      const { tenantId } = request.user;
      const { id } = request.params as z.infer<typeof personParams>;

      if (!(await personBelongsToTenant(id, tenantId))) {
        return reply.status(404).send({ message: 'Pessoa não encontrada' });
      }

      const contacts = await db
        .select(contactColumns)
        .from(personContacts)
        .where(
          and(eq(personContacts.personId, id), eq(personContacts.tenantId, tenantId)),
        )
        .orderBy(asc(personContacts.name), asc(personContacts.id));

      return contacts;
    },
  );

  fastify.post(
    '/:id/contacts',
    { schema: { params: personParams, body: PersonContactSchema } },
    async (request, reply) => {
      const { tenantId } = request.user;
      const { id } = request.params as z.infer<typeof personParams>;
      const data = request.body as PersonContactInput;

      if (!(await personBelongsToTenant(id, tenantId))) {
        return reply.status(404).send({ message: 'Pessoa não encontrada' });
      }

      const [created] = await db
        .insert(personContacts)
        .values({
          ...toContactValues(data),
          personId: id,
          tenantId,
        })
        .returning({ id: personContacts.id });

      const [contact] = await selectContact(id, tenantId, created.id);
      return reply.status(201).send(contact);
    },
  );

  fastify.put(
    '/:id/contacts/:contactId',
    { schema: { params: contactParams, body: PersonContactSchema } },
    async (request, reply) => {
      const { tenantId } = request.user;
      const { id, contactId } = request.params as z.infer<typeof contactParams>;
      const data = request.body as PersonContactInput;

      const [updated] = await db
        .update(personContacts)
        .set(toContactValues(data))
        .where(
          and(
            eq(personContacts.id, contactId),
            eq(personContacts.personId, id),
            eq(personContacts.tenantId, tenantId),
          ),
        )
        .returning({ id: personContacts.id });

      if (!updated) {
        return reply.status(404).send({ message: 'Contato não encontrado' });
      }

      const [contact] = await selectContact(id, tenantId, updated.id);
      return contact;
    },
  );

  fastify.delete(
    '/:id/contacts/:contactId',
    { schema: { params: contactParams } },
    async (request, reply) => {
      const { tenantId } = request.user;
      const { id, contactId } = request.params as z.infer<typeof contactParams>;

      const [deleted] = await db
        .delete(personContacts)
        .where(
          and(
            eq(personContacts.id, contactId),
            eq(personContacts.personId, id),
            eq(personContacts.tenantId, tenantId),
          ),
        )
        .returning({ id: personContacts.id });

      if (!deleted) {
        return reply.status(404).send({ message: 'Contato não encontrado' });
      }

      return { success: true };
    },
  );
};
