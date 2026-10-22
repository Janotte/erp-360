import '../../types/fastify.ts';

import { planAccounts } from '@erp-360/mod-financial';
import { cfopEntryRules, inboundDocuments, operationNatures } from '@erp-360/mod-inbound';
import { and, asc, eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { db } from '../../db/index.ts';
import { cfopScope, ensureInboundSetup } from './setup.ts';

const purposes = [
  'resale',
  'industrialization',
  'consumption',
  'fixed_asset',
  'service',
] as const;

const natureBody = z.object({
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(60),
  fiscalPurpose: z.enum(purposes),
  movesStock: z.boolean(),
  createsPayable: z.boolean(),
  updatesAverageCost: z.boolean(),
  recordsEntryPrice: z.boolean(),
  suggestsListPrice: z.boolean(),
  freightInCost: z.boolean(),
  insuranceInCost: z.boolean(),
  otherInCost: z.boolean(),
  discountInCost: z.boolean(),
  ipiInCost: z.boolean(),
  stInCost: z.boolean(),
  icmsInCost: z.boolean(),
  planAccountId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional().default(true),
});

const cfopBody = z.object({
  sourceCfop: z.string().trim(),
  fiscalPurpose: z.enum(purposes),
  entryCfop: z.string().trim(),
});

const idParams = z.object({
  id: z.string().uuid({ message: 'ID precisa ser um UUID válido' }),
});

function natureValues(data: z.infer<typeof natureBody>) {
  const movesStock = data.movesStock;
  return {
    code: data.code.trim(),
    name: data.name.trim(),
    direction: 'in' as const,
    fiscalPurpose: data.fiscalPurpose,
    movesStock,
    createsPayable: data.createsPayable,
    updatesAverageCost: movesStock && data.updatesAverageCost,
    recordsEntryPrice: movesStock && data.recordsEntryPrice,
    suggestsListPrice: movesStock && data.suggestsListPrice,
    freightInCost: data.freightInCost,
    insuranceInCost: data.insuranceInCost,
    otherInCost: data.otherInCost,
    discountInCost: data.discountInCost,
    ipiInCost: data.ipiInCost,
    stInCost: data.stInCost,
    icmsInCost: data.icmsInCost,
    planAccountId: data.planAccountId ?? null,
    isActive: data.isActive ?? true,
  };
}

function entryDigit(scope: 'internal' | 'interstate' | 'import') {
  if (scope === 'internal') return '1';
  if (scope === 'interstate') return '2';
  return '3';
}

function parseCfop(data: z.infer<typeof cfopBody>) {
  const sourceCfop = data.sourceCfop.replace(/\D/g, '');
  const entryCfop = data.entryCfop.replace(/\D/g, '');
  if (!/^[0-9]{4}$/.test(sourceCfop) || !/^[0-9]{4}$/.test(entryCfop)) {
    return { message: 'O CFOP precisa ter 4 dígitos.' };
  }
  const scope = cfopScope(sourceCfop);
  if (!scope || !['5', '6', '7'].includes(sourceCfop[0])) {
    return { message: 'O CFOP da nota precisa começar com 5, 6 ou 7.' };
  }
  if (entryCfop[0] !== entryDigit(scope)) {
    return {
      message: 'O CFOP de entrada precisa começar com 1, 2 ou 3, no mesmo âmbito da nota.',
    };
  }
  return {
    values: {
      sourceCfop,
      scope,
      fiscalPurpose: data.fiscalPurpose,
      entryCfop,
    },
  };
}

const natureColumns = {
  id: operationNatures.id,
  code: operationNatures.code,
  name: operationNatures.name,
  fiscalPurpose: operationNatures.fiscalPurpose,
  movesStock: operationNatures.movesStock,
  createsPayable: operationNatures.createsPayable,
  updatesAverageCost: operationNatures.updatesAverageCost,
  recordsEntryPrice: operationNatures.recordsEntryPrice,
  suggestsListPrice: operationNatures.suggestsListPrice,
  freightInCost: operationNatures.freightInCost,
  insuranceInCost: operationNatures.insuranceInCost,
  otherInCost: operationNatures.otherInCost,
  discountInCost: operationNatures.discountInCost,
  ipiInCost: operationNatures.ipiInCost,
  stInCost: operationNatures.stInCost,
  icmsInCost: operationNatures.icmsInCost,
  planAccountId: operationNatures.planAccountId,
  planAccountCode: planAccounts.accountCode,
  planAccountName: planAccounts.name,
  isActive: operationNatures.isActive,
};

function natureQuery(tenantId: string, id?: string) {
  const conditions = [
    eq(operationNatures.tenantId, tenantId),
    eq(operationNatures.direction, 'in'),
  ];
  if (id) conditions.push(eq(operationNatures.id, id));
  return db
    .select(natureColumns)
    .from(operationNatures)
    .leftJoin(
      planAccounts,
      and(
        eq(planAccounts.id, operationNatures.planAccountId),
        eq(planAccounts.tenantId, operationNatures.tenantId),
      ),
    )
    .where(and(...conditions))
    .orderBy(asc(operationNatures.name));
}

async function loadNature(tenantId: string, id: string) {
  const [row] = await natureQuery(tenantId, id);
  return row ?? null;
}

async function accountProblem(
  tenantId: string,
  planAccountId: string | null,
  currentId: string | null,
) {
  if (!planAccountId) return null;
  const [account] = await db
    .select({
      id: planAccounts.id,
      acceptsEntries: planAccounts.acceptsEntries,
      isActive: planAccounts.isActive,
    })
    .from(planAccounts)
    .where(and(eq(planAccounts.id, planAccountId), eq(planAccounts.tenantId, tenantId)))
    .limit(1);
  if (!account) return 'A conta informada não existe.';
  if (!account.acceptsEntries) return 'Esta conta não aceita lançamento.';
  if (!account.isActive && account.id !== currentId) return 'A conta informada está inativa.';
  return null;
}

export const inboundMaintenanceRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('preHandler', fastify.autenticarETenant);

  fastify.get('/operation-natures', async (request) => {
    const tenantId = request.user.tenantId;
    await ensureInboundSetup(tenantId);
    return natureQuery(tenantId);
  });

  fastify.get('/operation-natures/:id', { schema: { params: idParams } }, async (request, reply) => {
    const row = await loadNature(request.user.tenantId, request.params.id);
    if (!row) return reply.status(404).send({ message: 'Natureza não encontrada.' });
    return row;
  });

  fastify.post('/operation-natures', { schema: { body: natureBody } }, async (request, reply) => {
    const tenantId = request.user.tenantId;
    await ensureInboundSetup(tenantId);
    const values = natureValues(request.body);
    if (!values.code || !values.name) {
      return reply.status(400).send({ message: 'Informe o código e o nome.' });
    }
    const problem = await accountProblem(tenantId, values.planAccountId, null);
    if (problem) return reply.status(400).send({ message: problem });
    const [created] = await db
      .insert(operationNatures)
      .values({ tenantId, ...values })
      .returning({ id: operationNatures.id });
    return reply.status(201).send(await loadNature(tenantId, created.id));
  });

  fastify.put(
    '/operation-natures/:id',
    { schema: { params: idParams, body: natureBody } },
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const current = await loadNature(tenantId, request.params.id);
      if (!current) return reply.status(404).send({ message: 'Natureza não encontrada.' });
      const values = natureValues(request.body);
      if (!values.code || !values.name) {
        return reply.status(400).send({ message: 'Informe o código e o nome.' });
      }
      const problem = await accountProblem(tenantId, values.planAccountId, current.planAccountId);
      if (problem) return reply.status(400).send({ message: problem });
      await db
        .update(operationNatures)
        .set(values)
        .where(
          and(eq(operationNatures.id, request.params.id), eq(operationNatures.tenantId, tenantId)),
        );
      return loadNature(tenantId, request.params.id);
    },
  );

  fastify.delete(
    '/operation-natures/:id',
    { schema: { params: idParams } },
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const [used] = await db
        .select({ id: inboundDocuments.id })
        .from(inboundDocuments)
        .where(
          and(
            eq(inboundDocuments.natureId, request.params.id),
            eq(inboundDocuments.tenantId, tenantId),
          ),
        )
        .limit(1);
      if (used) {
        return reply
          .status(400)
          .send({ message: 'Não é possível excluir esta natureza porque ela está em uma nota.' });
      }
      const [deleted] = await db
        .delete(operationNatures)
        .where(
          and(eq(operationNatures.id, request.params.id), eq(operationNatures.tenantId, tenantId)),
        )
        .returning({ id: operationNatures.id });
      if (!deleted) return reply.status(404).send({ message: 'Natureza não encontrada.' });
      return { success: true };
    },
  );

  fastify.get('/cfop-rules', async (request) => {
    const tenantId = request.user.tenantId;
    await ensureInboundSetup(tenantId);
    return db
      .select({
        id: cfopEntryRules.id,
        sourceCfop: cfopEntryRules.sourceCfop,
        scope: cfopEntryRules.scope,
        fiscalPurpose: cfopEntryRules.fiscalPurpose,
        entryCfop: cfopEntryRules.entryCfop,
      })
      .from(cfopEntryRules)
      .where(eq(cfopEntryRules.tenantId, tenantId))
      .orderBy(asc(cfopEntryRules.sourceCfop), asc(cfopEntryRules.fiscalPurpose));
  });

  fastify.post('/cfop-rules', { schema: { body: cfopBody } }, async (request, reply) => {
    const tenantId = request.user.tenantId;
    await ensureInboundSetup(tenantId);
    const parsed = parseCfop(request.body);
    if ('message' in parsed) return reply.status(400).send({ message: parsed.message });
    const [created] = await db
      .insert(cfopEntryRules)
      .values({ tenantId, ...parsed.values })
      .returning({
        id: cfopEntryRules.id,
        sourceCfop: cfopEntryRules.sourceCfop,
        scope: cfopEntryRules.scope,
        fiscalPurpose: cfopEntryRules.fiscalPurpose,
        entryCfop: cfopEntryRules.entryCfop,
      });
    return reply.status(201).send(created);
  });

  fastify.put(
    '/cfop-rules/:id',
    { schema: { params: idParams, body: cfopBody } },
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const parsed = parseCfop(request.body);
      if ('message' in parsed) return reply.status(400).send({ message: parsed.message });
      const [updated] = await db
        .update(cfopEntryRules)
        .set(parsed.values)
        .where(and(eq(cfopEntryRules.id, request.params.id), eq(cfopEntryRules.tenantId, tenantId)))
        .returning({
          id: cfopEntryRules.id,
          sourceCfop: cfopEntryRules.sourceCfop,
          scope: cfopEntryRules.scope,
          fiscalPurpose: cfopEntryRules.fiscalPurpose,
          entryCfop: cfopEntryRules.entryCfop,
        });
      if (!updated) return reply.status(404).send({ message: 'Regra de CFOP não encontrada.' });
      return updated;
    },
  );

  fastify.delete('/cfop-rules/:id', { schema: { params: idParams } }, async (request, reply) => {
    const [deleted] = await db
      .delete(cfopEntryRules)
      .where(
        and(
          eq(cfopEntryRules.id, request.params.id),
          eq(cfopEntryRules.tenantId, request.user.tenantId),
        ),
      )
      .returning({ id: cfopEntryRules.id });
    if (!deleted) return reply.status(404).send({ message: 'Regra de CFOP não encontrada.' });
    return { success: true };
  });
};
