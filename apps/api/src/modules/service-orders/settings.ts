import '../../types/fastify.ts';

import {
  serviceOrderFields,
  serviceOrderFieldValues,
  serviceOrderNoteLines,
  serviceOrders,
  serviceOrderSettings,
} from '@erp-360/mod-service-orders';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { db, type DbClient } from '../../db/index.ts';
import { labelChangeSlots } from './rules.ts';

const fieldSlots = [
  'field01',
  'field02',
  'field03',
  'field04',
  'field05',
  'field06',
  'field07',
  'field08',
  'field09',
  'field10',
  'field11',
] as const;

const lineSlots = ['line01', 'line02', 'line03', 'line04', 'line05'] as const;

const assistanceFields: {
  slot: (typeof fieldSlots)[number];
  label: string;
  isRequired: boolean;
  width: 4 | 6 | 12;
}[] = [
  { slot: 'field01', label: 'Descrição', isRequired: true, width: 12 },
  { slot: 'field02', label: 'Marca', isRequired: false, width: 4 },
  { slot: 'field03', label: 'Modelo', isRequired: false, width: 4 },
  { slot: 'field04', label: 'Número de série', isRequired: false, width: 4 },
  { slot: 'field05', label: 'Solicitante', isRequired: false, width: 4 },
  { slot: 'field06', label: 'Setor', isRequired: false, width: 4 },
  { slot: 'field07', label: 'Usuário do equipamento', isRequired: false, width: 4 },
  { slot: 'field08', label: 'Problema reclamado', isRequired: true, width: 12 },
  { slot: 'field09', label: 'Diagnóstico', isRequired: false, width: 12 },
  { slot: 'field10', label: 'Solução', isRequired: false, width: 12 },
  { slot: 'field11', label: 'Recebido com', isRequired: false, width: 12 },
];

const assistanceNotes: {
  slot: (typeof lineSlots)[number];
  body: string;
  isActive: boolean;
}[] = [
  {
    slot: 'line01',
    body: 'Garantia dos serviços e peças de 90 dias conforme o Código de Defesa do Consumidor.',
    isActive: true,
  },
  {
    slot: 'line02',
    body: 'Autorizo o descarte das peças substituídas.',
    isActive: true,
  },
  { slot: 'line03', body: '', isActive: false },
  { slot: 'line04', body: '', isActive: false },
  { slot: 'line05', body: '', isActive: false },
];

const fieldSlotSchema = z.string().regex(/^field(0[1-9]|1[01])$/);
const lineSlotSchema = z.string().regex(/^line0[1-5]$/);

const settingsBody = z
  .object({
    sectionTitle: z.string().trim().min(1).max(60),
    productsTitle: z.string().trim().min(1).max(60),
    servicesTitle: z.string().trim().min(1).max(60),
    technicianSignatureLabel: z.string().trim().min(1).max(60),
    customerSignatureLabel: z.string().trim().min(1).max(60),
    summarySlot: fieldSlotSchema,
    fields: z
      .array(
        z.object({
          slot: fieldSlotSchema,
          label: z.string().trim().max(60),
          isActive: z.boolean(),
          isRequired: z.boolean(),
          width: z.union([z.literal(4), z.literal(6), z.literal(12)]),
        }),
      )
      .length(fieldSlots.length),
    noteLines: z
      .array(
        z.object({
          slot: lineSlotSchema,
          body: z.string().trim().max(500),
          isActive: z.boolean(),
        }),
      )
      .length(lineSlots.length),
    confirmLabelChange: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    const fields = new Set(data.fields.map((field) => field.slot));
    if (fields.size !== fieldSlots.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['fields'],
        message: 'Informe os onze campos da ordem.',
      });
    }
    const lines = new Set(data.noteLines.map((line) => line.slot));
    if (lines.size !== lineSlots.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['noteLines'],
        message: 'Informe as cinco linhas de observação.',
      });
    }
  });

type SettingsBody = z.infer<typeof settingsBody>;

export type ServiceOrderSettingsView = {
  sectionTitle: string;
  productsTitle: string;
  servicesTitle: string;
  technicianSignatureLabel: string;
  customerSignatureLabel: string;
  summarySlot: string;
  fields: {
    slot: string;
    label: string;
    isActive: boolean;
    isRequired: boolean;
    width: number;
  }[];
  noteLines: {
    slot: string;
    body: string;
    isActive: boolean;
  }[];
};

function reject(message: string): never {
  const error = new Error(message) as Error & { status: number };
  error.status = 400;
  throw error;
}

async function readSettings(
  client: DbClient,
  tenantId: string,
): Promise<ServiceOrderSettingsView | null> {
  const [settings] = await client
    .select({
      sectionTitle: serviceOrderSettings.sectionTitle,
      productsTitle: serviceOrderSettings.productsTitle,
      servicesTitle: serviceOrderSettings.servicesTitle,
      technicianSignatureLabel: serviceOrderSettings.technicianSignatureLabel,
      customerSignatureLabel: serviceOrderSettings.customerSignatureLabel,
      summarySlot: serviceOrderSettings.summarySlot,
    })
    .from(serviceOrderSettings)
    .where(eq(serviceOrderSettings.tenantId, tenantId))
    .limit(1);
  if (!settings) return null;

  const fields = await client
    .select({
      slot: serviceOrderFields.slot,
      label: serviceOrderFields.label,
      isActive: serviceOrderFields.isActive,
      isRequired: serviceOrderFields.isRequired,
      width: serviceOrderFields.width,
    })
    .from(serviceOrderFields)
    .where(eq(serviceOrderFields.tenantId, tenantId))
    .orderBy(asc(serviceOrderFields.slot));

  const noteLines = await client
    .select({
      slot: serviceOrderNoteLines.slot,
      body: serviceOrderNoteLines.body,
      isActive: serviceOrderNoteLines.isActive,
    })
    .from(serviceOrderNoteLines)
    .where(eq(serviceOrderNoteLines.tenantId, tenantId))
    .orderBy(asc(serviceOrderNoteLines.slot));

  return { ...settings, fields, noteLines };
}

/** Primeira leitura da empresa grava a assistência. A seguinte devolve a mesma aba. */
export async function getOrCreateServiceOrderSettings(
  tenantId: string,
): Promise<ServiceOrderSettingsView> {
  const existing = await readSettings(db, tenantId);
  if (existing) return existing;

  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(serviceOrderSettings)
      .values({
        tenantId,
        sectionTitle: 'Informações do objeto',
        productsTitle: 'Produtos',
        servicesTitle: 'Serviços',
        technicianSignatureLabel: 'Responsável técnico',
        customerSignatureLabel: 'Assinatura do cliente',
        summarySlot: 'field01',
      })
      .onConflictDoNothing()
      .returning({ tenantId: serviceOrderSettings.tenantId });
    if (inserted.length === 0) return;

    await tx.insert(serviceOrderFields).values(
      assistanceFields.map((field) => ({
        tenantId,
        slot: field.slot,
        label: field.label,
        isActive: true,
        isRequired: field.isRequired,
        width: field.width,
      })),
    );
    await tx.insert(serviceOrderNoteLines).values(
      assistanceNotes.map((line) => ({
        tenantId,
        slot: line.slot,
        body: line.body,
        isActive: line.isActive,
      })),
    );
  });

  const created = await readSettings(db, tenantId);
  if (!created) reject('Não foi possível abrir a aba da ordem.');
  return created;
}

async function openValueSlots(tenantId: string): Promise<Record<string, boolean>> {
  const rows = await db
    .selectDistinct({ slot: serviceOrderFieldValues.slot })
    .from(serviceOrderFieldValues)
    .innerJoin(
      serviceOrders,
      and(
        eq(serviceOrderFieldValues.orderId, serviceOrders.id),
        eq(serviceOrderFieldValues.tenantId, serviceOrders.tenantId),
      ),
    )
    .where(
      and(
        eq(serviceOrderFieldValues.tenantId, tenantId),
        sql`${serviceOrders.status} not in ('delivered', 'cancelled')`,
        sql`length(trim(coalesce(${serviceOrderFieldValues.value}, ''))) > 0`,
      ),
    );

  const openValues: Record<string, boolean> = {};
  for (const row of rows) openValues[row.slot] = true;
  return openValues;
}

function assertSettings(body: SettingsBody) {
  for (const field of body.fields) {
    if (field.isActive && !field.label) {
      reject('Informe o rótulo do campo ativo.');
    }
  }
  const summary = body.fields.find((field) => field.slot === body.summarySlot);
  if (!summary?.isActive) {
    reject('O campo da lista precisa estar ativo.');
  }
}

async function saveSettings(tenantId: string, body: SettingsBody) {
  await db.transaction(async (tx) => {
    await tx
      .update(serviceOrderSettings)
      .set({
        sectionTitle: body.sectionTitle,
        productsTitle: body.productsTitle,
        servicesTitle: body.servicesTitle,
        technicianSignatureLabel: body.technicianSignatureLabel,
        customerSignatureLabel: body.customerSignatureLabel,
        summarySlot: body.summarySlot,
      })
      .where(eq(serviceOrderSettings.tenantId, tenantId));

    for (const field of body.fields) {
      await tx
        .update(serviceOrderFields)
        .set({
          label: field.label,
          isActive: field.isActive,
          isRequired: field.isRequired,
          width: field.width,
        })
        .where(
          and(
            eq(serviceOrderFields.tenantId, tenantId),
            eq(serviceOrderFields.slot, field.slot),
          ),
        );
    }

    for (const line of body.noteLines) {
      await tx
        .update(serviceOrderNoteLines)
        .set({ body: line.body, isActive: line.isActive })
        .where(
          and(
            eq(serviceOrderNoteLines.tenantId, tenantId),
            eq(serviceOrderNoteLines.slot, line.slot),
          ),
        );
    }
  });
}

export const serviceOrderSettingsRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('preHandler', fastify.autenticarETenant);

  fastify.get('/service-order', async (request) => {
    return getOrCreateServiceOrderSettings(request.user.tenantId);
  });

  fastify.put(
    '/service-order',
    { schema: { body: settingsBody } },
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const current = await getOrCreateServiceOrderSettings(tenantId);
      assertSettings(request.body);

      const before: Record<string, string> = {};
      for (const field of current.fields) before[field.slot] = field.label;
      const after: Record<string, string> = {};
      for (const field of request.body.fields) after[field.slot] = field.label;
      const slots = labelChangeSlots(before, after, await openValueSlots(tenantId));
      if (slots.length > 0 && request.body.confirmLabelChange !== true) {
        return reply.status(409).send({ code: 'label_change', slots });
      }

      await saveSettings(tenantId, request.body);
      return readSettings(db, tenantId);
    },
  );
};
