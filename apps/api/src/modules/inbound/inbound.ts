import '../../types/fastify.ts';

import { catalogItems } from '@erp-360/mod-catalog';
import { tenants } from '@erp-360/mod-core';
import {
  cfopEntryRules,
  inboundDocumentFiles,
  inboundDocumentInstallments,
  inboundDocumentLines,
  inboundDocuments,
  operationNatures,
  supplierItemLinks,
} from '@erp-360/mod-inbound';
import { persons } from '@erp-360/mod-persons';
import { escapeIlike, isValidCnpj, onlyDigits, toTitleCasePtBr } from '@erp-360/shared';
import { and, asc, desc, eq, gte, ilike, like, lte, or } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { db } from '../../db/index.ts';
import { uniqueViolation } from '../../lib/postgres-errors.ts';
import { postCertificate } from '../certificates/probe.ts';
import { connectionTimeoutMs } from '../certificates/sefaz.ts';
import { moneyToCents } from './cost.ts';
import { discoverInboundDocument } from './dfe-discover.ts';
import { certificateMaterial } from './dfe-sync.ts';
import { InboundError } from './errors.ts';
import { parseNfeXml } from './nfe.ts';
import { getOrCreateNfeSettings } from './nfe-settings.ts';
import { persistParsedNfe } from './persist-nfe.ts';
import {
  deleteInboundDocument,
  postInboundDocument,
  reverseInboundDocument,
} from './post.ts';
import { cfopScope, ensureInboundSetup } from './setup.ts';

const draftStatuses = new Set(['pre_note', 'divergent', 'pending']);
const cestRead = new Set<string>();

function cestOrNull(value: string | null | undefined) {
  const digits = (value ?? '').replace(/\D/g, '');
  return /^[0-9]{7}$/.test(digits) ? digits : null;
}

const lineInput = z.object({
  lineNumber: z.number().int().positive(),
  supplierCode: z.string().trim().min(1).max(60),
  description: z.string().trim().min(1).max(120),
  xmlCfop: z.string().regex(/^[0-9]{4}$/),
  commercialQty: z.number().positive(),
  commercialUnit: z.string().trim().min(1).max(6),
  unitPrice: z.number().nonnegative(),
  factor: z.number().positive().default(1),
  entryCfop: z
    .string()
    .regex(/^[0-9]{4}$/)
    .nullable()
    .optional(),
  itemId: z.string().uuid().nullable().optional(),
  barcode: z.string().max(14).nullable().optional(),
  ncmCode: z.string().max(8).nullable().optional(),
  cestCode: z.string().max(7).nullable().optional(),
  freightAmount: z.number().int().nonnegative().optional(),
  insuranceAmount: z.number().int().nonnegative().optional(),
  otherAmount: z.number().int().nonnegative().optional(),
  discountAmount: z.number().int().nonnegative().optional(),
  ipiAmount: z.number().int().nonnegative().optional(),
  stAmount: z.number().int().nonnegative().optional(),
  icmsAmount: z.number().int().nonnegative().optional(),
});

const installmentInput = z.object({
  number: z.string().trim().min(1).max(3),
  dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().int().positive(),
});

const draftBody = z.object({
  supplierId: z.string().uuid().nullable().optional(),
  natureId: z.string().uuid().nullable().optional(),
  number: z.string().trim().min(1).max(9),
  series: z.string().trim().min(1).max(3),
  issueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lines: z.array(lineInput).min(1),
  installments: z.array(installmentInput),
});

function lineRecord(
  tenantId: string,
  documentId: string,
  line: z.infer<typeof lineInput>,
  moneyFromClient: boolean,
) {
  const lineAmount = moneyToCents(line.commercialQty * line.unitPrice);
  return {
    tenantId,
    documentId,
    lineNumber: line.lineNumber,
    supplierCode: line.supplierCode,
    description: line.description,
    ncmCode: line.ncmCode ?? null,
    cestCode: cestOrNull(line.cestCode),
    barcode: line.barcode ?? null,
    xmlCfop: line.xmlCfop,
    entryCfop:
      line.entryCfop ?? (['1', '2', '3'].includes(line.xmlCfop[0]) ? line.xmlCfop : null),
    commercialQty: line.commercialQty.toFixed(4),
    commercialUnit: line.commercialUnit,
    factor: line.factor.toFixed(6),
    unitPrice: line.unitPrice.toFixed(4),
    lineAmount: moneyFromClient ? lineAmount : lineAmount,
    freightAmount: line.freightAmount ?? 0,
    insuranceAmount: line.insuranceAmount ?? 0,
    otherAmount: line.otherAmount ?? 0,
    discountAmount: line.discountAmount ?? 0,
    ipiAmount: line.ipiAmount ?? 0,
    stAmount: line.stAmount ?? 0,
    icmsAmount: line.icmsAmount ?? 0,
    itemId: line.itemId ?? null,
  };
}

async function entryCfopFor(
  tenantId: string,
  xmlCfop: string,
  purpose: string | null,
  current: string | null,
) {
  if (current) return current;
  if (['1', '2', '3'].includes(xmlCfop[0])) return xmlCfop;
  if (!purpose) return null;
  const scope = cfopScope(xmlCfop);
  if (!scope) return null;
  const [rule] = await db
    .select({ entryCfop: cfopEntryRules.entryCfop })
    .from(cfopEntryRules)
    .where(
      and(
        eq(cfopEntryRules.tenantId, tenantId),
        eq(cfopEntryRules.sourceCfop, xmlCfop),
        eq(cfopEntryRules.scope, scope),
        eq(
          cfopEntryRules.fiscalPurpose,
          purpose as
            'resale' | 'industrialization' | 'consumption' | 'fixed_asset' | 'service',
        ),
      ),
    )
    .limit(1);
  return rule?.entryCfop ?? null;
}

async function rememberLink(
  tenantId: string,
  supplierId: string | null,
  line: {
    supplierCode: string;
    itemId: string | null;
    commercialUnit: string;
    factor: string;
  },
) {
  if (!supplierId || !line.itemId) return;
  await db
    .insert(supplierItemLinks)
    .values({
      tenantId,
      supplierId,
      supplierCode: line.supplierCode,
      itemId: line.itemId,
      supplierUnit: line.commercialUnit,
      factor: line.factor,
    })
    .onConflictDoUpdate({
      target: [
        supplierItemLinks.tenantId,
        supplierItemLinks.supplierId,
        supplierItemLinks.supplierCode,
      ],
      set: {
        itemId: line.itemId,
        supplierUnit: line.commercialUnit,
        factor: line.factor,
      },
    });
}

async function fillCestFromFile(
  tenantId: string,
  documentId: string,
  lines: { lineNumber: number; cestCode: string | null }[],
) {
  if (cestRead.has(documentId) || lines.every((line) => line.cestCode)) {
    cestRead.add(documentId);
    return;
  }
  cestRead.add(documentId);
  const [file] = await db
    .select({ content: inboundDocumentFiles.content })
    .from(inboundDocumentFiles)
    .where(
      and(
        eq(inboundDocumentFiles.documentId, documentId),
        eq(inboundDocumentFiles.tenantId, tenantId),
      ),
    )
    .limit(1);
  if (!file) return;
  const xml = Buffer.isBuffer(file.content)
    ? file.content.toString('utf8')
    : String(file.content);
  let parsed: ReturnType<typeof parseNfeXml>;
  try {
    parsed = parseNfeXml(xml);
  } catch {
    return;
  }
  for (const line of lines) {
    if (line.cestCode) continue;
    const cest = parsed.lines.find(
      (item) => item.lineNumber === line.lineNumber,
    )?.cestCode;
    if (!cest) continue;
    line.cestCode = cest;
    await db
      .update(inboundDocumentLines)
      .set({ cestCode: cest })
      .where(
        and(
          eq(inboundDocumentLines.documentId, documentId),
          eq(inboundDocumentLines.tenantId, tenantId),
          eq(inboundDocumentLines.lineNumber, line.lineNumber),
        ),
      );
  }
}

async function fillInstallmentsFromFile(tenantId: string, documentId: string) {
  const [file] = await db
    .select({ content: inboundDocumentFiles.content })
    .from(inboundDocumentFiles)
    .where(
      and(
        eq(inboundDocumentFiles.documentId, documentId),
        eq(inboundDocumentFiles.tenantId, tenantId),
      ),
    )
    .limit(1);
  const empty: { id: string; number: string; dueOn: string; amount: number }[] = [];
  if (!file) return empty;
  const xml = Buffer.isBuffer(file.content)
    ? file.content.toString('utf8')
    : String(file.content);
  let parsed: ReturnType<typeof parseNfeXml>;
  try {
    parsed = parseNfeXml(xml);
  } catch {
    return empty;
  }
  if (parsed.installments.length === 0) return empty;
  try {
    return await db
      .insert(inboundDocumentInstallments)
      .values(
        parsed.installments.map((installment) => ({
          tenantId,
          documentId,
          number: installment.number,
          dueOn: installment.dueOn,
          amount: installment.amount,
        })),
      )
      .returning({
        id: inboundDocumentInstallments.id,
        number: inboundDocumentInstallments.number,
        dueOn: inboundDocumentInstallments.dueOn,
        amount: inboundDocumentInstallments.amount,
      });
  } catch (error) {
    if (!uniqueViolation(error)) throw error;
    return db
      .select({
        id: inboundDocumentInstallments.id,
        number: inboundDocumentInstallments.number,
        dueOn: inboundDocumentInstallments.dueOn,
        amount: inboundDocumentInstallments.amount,
      })
      .from(inboundDocumentInstallments)
      .where(
        and(
          eq(inboundDocumentInstallments.documentId, documentId),
          eq(inboundDocumentInstallments.tenantId, tenantId),
        ),
      )
      .orderBy(asc(inboundDocumentInstallments.number));
  }
}

async function loadDocument(tenantId: string, documentId: string) {
  const [document] = await db
    .select({
      id: inboundDocuments.id,
      status: inboundDocuments.status,
      model: inboundDocuments.model,
      accessKey: inboundDocuments.accessKey,
      number: inboundDocuments.number,
      series: inboundDocuments.series,
      issueOn: inboundDocuments.issueOn,
      inboundOn: inboundDocuments.inboundOn,
      supplierId: inboundDocuments.supplierId,
      supplierTaxId: inboundDocuments.supplierTaxId,
      supplierName: inboundDocuments.supplierName,
      natureId: inboundDocuments.natureId,
      hasProtocol: inboundDocuments.hasProtocol,
      totalAmount: inboundDocuments.totalAmount,
      supplierActive: persons.isActive,
      linkedSupplierName: persons.name,
      fiscalPurpose: operationNatures.fiscalPurpose,
    })
    .from(inboundDocuments)
    .leftJoin(persons, eq(persons.id, inboundDocuments.supplierId))
    .leftJoin(operationNatures, eq(operationNatures.id, inboundDocuments.natureId))
    .where(
      and(eq(inboundDocuments.id, documentId), eq(inboundDocuments.tenantId, tenantId)),
    )
    .limit(1);
  if (!document) throw new InboundError(404, 'Nota não encontrada.');

  const lines = await db
    .select({
      id: inboundDocumentLines.id,
      lineNumber: inboundDocumentLines.lineNumber,
      supplierCode: inboundDocumentLines.supplierCode,
      description: inboundDocumentLines.description,
      ncmCode: inboundDocumentLines.ncmCode,
      cestCode: inboundDocumentLines.cestCode,
      barcode: inboundDocumentLines.barcode,
      xmlCfop: inboundDocumentLines.xmlCfop,
      entryCfop: inboundDocumentLines.entryCfop,
      commercialQty: inboundDocumentLines.commercialQty,
      commercialUnit: inboundDocumentLines.commercialUnit,
      factor: inboundDocumentLines.factor,
      unitPrice: inboundDocumentLines.unitPrice,
      lineAmount: inboundDocumentLines.lineAmount,
      itemId: inboundDocumentLines.itemId,
      itemCode: catalogItems.code,
      itemName: catalogItems.name,
      unitCost: inboundDocumentLines.unitCost,
    })
    .from(inboundDocumentLines)
    .leftJoin(catalogItems, eq(catalogItems.id, inboundDocumentLines.itemId))
    .where(
      and(
        eq(inboundDocumentLines.documentId, documentId),
        eq(inboundDocumentLines.tenantId, tenantId),
      ),
    )
    .orderBy(asc(inboundDocumentLines.lineNumber));

  if (document.accessKey) await fillCestFromFile(tenantId, documentId, lines);

  let installments = await db
    .select({
      id: inboundDocumentInstallments.id,
      number: inboundDocumentInstallments.number,
      dueOn: inboundDocumentInstallments.dueOn,
      amount: inboundDocumentInstallments.amount,
    })
    .from(inboundDocumentInstallments)
    .where(
      and(
        eq(inboundDocumentInstallments.documentId, documentId),
        eq(inboundDocumentInstallments.tenantId, tenantId),
      ),
    )
    .orderBy(asc(inboundDocumentInstallments.number));
  if (
    installments.length === 0 &&
    document.accessKey &&
    draftStatuses.has(document.status)
  ) {
    installments = await fillInstallmentsFromFile(tenantId, documentId);
  }

  const blockers: string[] = [];
  if (draftStatuses.has(document.status)) {
    if (document.accessKey && !document.hasProtocol) {
      blockers.push('A NF-e está sem protocolo de autorização.');
    }
    if (!document.supplierId) blockers.push('Fornecedor não vinculado.');
    else if (document.supplierActive === false) blockers.push('Fornecedor inativo.');
    if (!document.natureId) blockers.push('Informe a natureza de operação.');
    if (lines.length === 0) blockers.push('A nota não tem itens.');
    for (const line of lines) {
      if (!line.itemId)
        blockers.push(`Item ${line.lineNumber} sem vínculo com o catálogo.`);
      if (!line.entryCfop) blockers.push(`Item ${line.lineNumber} sem CFOP de entrada.`);
      if (Number(line.factor) <= 0)
        blockers.push(`Item ${line.lineNumber} sem fator de conversão.`);
    }
    const sum = installments.reduce(
      (total, installment) => total + installment.amount,
      0,
    );
    if (document.totalAmount > 0 && installments.length === 0) {
      blockers.push('A nota não tem parcelas.');
    } else if (document.totalAmount > 0 && Math.abs(sum - document.totalAmount) > 1) {
      blockers.push('A soma das parcelas não fecha com o total da nota.');
    }
  }

  return {
    ...document,
    supplierName: document.linkedSupplierName ?? document.supplierName,
    blockers,
    lines,
    installments,
  };
}

const inboundListQuery = z.object({
  search: z.string().max(120).optional(),
  issueFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  issueTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  inboundFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  inboundTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  status: z
    .enum([
      'pending',
      'pre_note',
      'divergent',
      'posted',
      'reversed',
      'ignored',
      'discovered',
    ])
    .optional(),
});

export async function listInboundDocuments(
  tenantId: string,
  query: z.infer<typeof inboundListQuery>,
) {
  const filters = [eq(inboundDocuments.tenantId, tenantId)];
  if (query.status) filters.push(eq(inboundDocuments.status, query.status));
  if (query.issueFrom) filters.push(gte(inboundDocuments.issueOn, query.issueFrom));
  if (query.issueTo) filters.push(lte(inboundDocuments.issueOn, query.issueTo));
  if (query.inboundFrom) filters.push(gte(inboundDocuments.inboundOn, query.inboundFrom));
  if (query.inboundTo) filters.push(lte(inboundDocuments.inboundOn, query.inboundTo));

  const search = query.search?.trim();
  if (search) {
    const pattern = `%${escapeIlike(search)}%`;
    const matches = [
      ilike(inboundDocuments.supplierName, pattern),
      ilike(persons.name, pattern),
    ];
    const digits = onlyDigits(search);
    if (digits) {
      const digitPattern = `%${digits}%`;
      matches.push(
        like(inboundDocuments.number, digitPattern),
        like(inboundDocuments.accessKey, digitPattern),
      );
    }
    const match = or(...matches);
    if (match) filters.push(match);
  }

  return db
    .select({
      id: inboundDocuments.id,
      status: inboundDocuments.status,
      number: inboundDocuments.number,
      series: inboundDocuments.series,
      issueOn: inboundDocuments.issueOn,
      inboundOn: inboundDocuments.inboundOn,
      supplierName: inboundDocuments.supplierName,
      linkedSupplierName: persons.name,
      totalAmount: inboundDocuments.totalAmount,
      accessKey: inboundDocuments.accessKey,
      natureName: operationNatures.name,
      recipientManifestation: inboundDocuments.recipientManifestation,
      authorizationStatus: inboundDocuments.authorizationStatus,
    })
    .from(inboundDocuments)
    .leftJoin(persons, eq(persons.id, inboundDocuments.supplierId))
    .leftJoin(operationNatures, eq(operationNatures.id, inboundDocuments.natureId))
    .where(and(...filters))
    .orderBy(desc(inboundDocuments.issueOn), desc(inboundDocuments.createdAt));
}

async function markSupplier(tenantId: string, supplierId: string) {
  await db
    .update(persons)
    .set({ isSupplier: true })
    .where(and(eq(persons.id, supplierId), eq(persons.tenantId, tenantId)));
}

export const inboundRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('preHandler', fastify.autenticarETenant);

  fastify.get('/natures', async (request) => {
    const tenantId = request.user.tenantId;
    await ensureInboundSetup(tenantId);
    return db
      .select({
        id: operationNatures.id,
        code: operationNatures.code,
        name: operationNatures.name,
        fiscalPurpose: operationNatures.fiscalPurpose,
        movesStock: operationNatures.movesStock,
      })
      .from(operationNatures)
      .where(
        and(
          eq(operationNatures.tenantId, tenantId),
          eq(operationNatures.direction, 'in'),
          eq(operationNatures.isActive, true),
        ),
      )
      .orderBy(asc(operationNatures.name));
  });

  fastify.get('/', { schema: { querystring: inboundListQuery } }, async (request) => {
    const tenantId = request.user.tenantId;
    await ensureInboundSetup(tenantId);
    return listInboundDocuments(tenantId, request.query);
  });

  fastify.get('/:id', async (request, reply) => {
    const id = z
      .string()
      .uuid()
      .safeParse((request.params as { id: string }).id);
    if (!id.success) return reply.status(400).send({ message: 'Nota inválida.' });
    return loadDocument(request.user.tenantId, id.data);
  });

  fastify.post('/manual', { schema: { body: draftBody } }, async (request, reply) => {
    const tenantId = request.user.tenantId;
    await ensureInboundSetup(tenantId);
    const body = request.body;
    const totalAmount = body.lines.reduce(
      (sum, line) => sum + moneyToCents(line.commercialQty * line.unitPrice),
      0,
    );
    const installments =
      body.installments.length > 0
        ? body.installments
        : totalAmount > 0
          ? [{ number: '001', dueOn: body.issueOn, amount: totalAmount }]
          : [];

    const created = await db.transaction(async (tx) => {
      const [document] = await tx
        .insert(inboundDocuments)
        .values({
          tenantId,
          status: 'pre_note',
          model: '55',
          number: body.number,
          series: body.series,
          issueOn: body.issueOn,
          supplierId: body.supplierId ?? null,
          natureId: body.natureId ?? null,
          hasProtocol: true,
          totalAmount,
        })
        .returning({ id: inboundDocuments.id });
      await tx
        .insert(inboundDocumentLines)
        .values(body.lines.map((line) => lineRecord(tenantId, document.id, line, true)));
      if (installments[0]?.amount > 0) {
        await tx.insert(inboundDocumentInstallments).values(
          installments.map((installment) => ({
            tenantId,
            documentId: document.id,
            number: installment.number,
            dueOn: installment.dueOn,
            amount: installment.amount,
          })),
        );
      }
      return document;
    });

    if (body.supplierId) await markSupplier(tenantId, body.supplierId);
    const view = await loadDocument(tenantId, created.id);
    await alignDraft(tenantId, created.id, view.fiscalPurpose);
    return reply.status(201).send(await loadDocument(tenantId, created.id));
  });

  fastify.post(
    '/xml',
    {
      bodyLimit: 2_000_000,
      schema: {
        body: z.object({
          fileName: z.string().trim().max(255).optional(),
          xml: z.string().min(1),
        }),
      },
    },
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      await ensureInboundSetup(tenantId);
      const parsed = parseNfeXml(request.body.xml);
      const [tenant] = await db
        .select({ cnpj: tenants.cnpj })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);
      if (!tenant || parsed.recipientTaxId !== tenant.cnpj) {
        throw new InboundError(400, 'O destinatário da NF-e não é esta empresa.');
      }
      if (!isValidCnpj(parsed.supplierTaxId)) {
        throw new InboundError(400, 'O CNPJ do emitente da NF-e é inválido.');
      }

      const [existing] = await db
        .select({ id: inboundDocuments.id, status: inboundDocuments.status })
        .from(inboundDocuments)
        .where(
          and(
            eq(inboundDocuments.tenantId, tenantId),
            eq(inboundDocuments.accessKey, parsed.accessKey),
          ),
        )
        .limit(1);
      if (existing) {
        throw new InboundError(
          409,
          existing.status === 'reversed'
            ? 'Esta nota já foi estornada e a chave continua ocupada.'
            : 'Esta nota já está na entrada.',
        );
      }

      const content = Buffer.from(request.body.xml, 'utf8');
      const created = await db.transaction((tx) =>
        persistParsedNfe(
          tx,
          tenantId,
          parsed,
          content,
          request.body.fileName?.slice(0, 255) || 'nfe.xml',
        ),
      );

      if (created.supplierId) await markSupplier(tenantId, created.supplierId);
      return reply.status(201).send(await loadDocument(tenantId, created.id));
    },
  );

  fastify.put('/:id', { schema: { body: draftBody } }, async (request) => {
    const tenantId = request.user.tenantId;
    const id = z
      .string()
      .uuid()
      .parse((request.params as { id: string }).id);
    const [document] = await db
      .select()
      .from(inboundDocuments)
      .where(and(eq(inboundDocuments.id, id), eq(inboundDocuments.tenantId, tenantId)))
      .limit(1);
    if (!document) throw new InboundError(404, 'Nota não encontrada.');
    if (!draftStatuses.has(document.status)) {
      throw new InboundError(400, 'Esta nota não pode mais ser alterada.');
    }

    const body = request.body;
    if (document.accessKey) {
      await db
        .update(inboundDocuments)
        .set({
          supplierId: body.supplierId ?? null,
          natureId: body.natureId ?? null,
        })
        .where(eq(inboundDocuments.id, id));
      for (const line of body.lines) {
        await db
          .update(inboundDocumentLines)
          .set({
            itemId: line.itemId ?? null,
            factor: line.factor.toFixed(6),
            entryCfop: line.entryCfop ?? null,
          })
          .where(
            and(
              eq(inboundDocumentLines.documentId, id),
              eq(inboundDocumentLines.tenantId, tenantId),
              eq(inboundDocumentLines.lineNumber, line.lineNumber),
            ),
          );
      }
    } else {
      const totalAmount = body.lines.reduce(
        (sum, line) => sum + moneyToCents(line.commercialQty * line.unitPrice),
        0,
      );
      await db.transaction(async (tx) => {
        await tx
          .update(inboundDocuments)
          .set({
            supplierId: body.supplierId ?? null,
            natureId: body.natureId ?? null,
            number: body.number,
            series: body.series,
            issueOn: body.issueOn,
            totalAmount,
          })
          .where(eq(inboundDocuments.id, id));
        await tx
          .delete(inboundDocumentInstallments)
          .where(eq(inboundDocumentInstallments.documentId, id));
        await tx
          .delete(inboundDocumentLines)
          .where(eq(inboundDocumentLines.documentId, id));
        await tx
          .insert(inboundDocumentLines)
          .values(body.lines.map((line) => lineRecord(tenantId, id, line, true)));
        const installments =
          body.installments.length > 0
            ? body.installments
            : totalAmount > 0
              ? [{ number: '001', dueOn: body.issueOn, amount: totalAmount }]
              : [];
        if (installments.length > 0) {
          await tx.insert(inboundDocumentInstallments).values(
            installments.map((installment) => ({
              tenantId,
              documentId: id,
              number: installment.number,
              dueOn: installment.dueOn,
              amount: installment.amount,
            })),
          );
        }
      });
    }

    if (document.accessKey && body.installments.length > 0) {
      await db
        .delete(inboundDocumentInstallments)
        .where(eq(inboundDocumentInstallments.documentId, id));
      await db.insert(inboundDocumentInstallments).values(
        body.installments.map((installment) => ({
          tenantId,
          documentId: id,
          number: installment.number,
          dueOn: installment.dueOn,
          amount: installment.amount,
        })),
      );
    }

    if (body.supplierId) await markSupplier(tenantId, body.supplierId);
    const purpose = body.natureId
      ? ((
          await db
            .select({ fiscalPurpose: operationNatures.fiscalPurpose })
            .from(operationNatures)
            .where(eq(operationNatures.id, body.natureId))
            .limit(1)
        )[0]?.fiscalPurpose ?? null)
      : null;
    await alignDraft(tenantId, id, purpose);
    return loadDocument(tenantId, id);
  });

  fastify.post('/:id/supplier', async (request) => {
    const tenantId = request.user.tenantId;
    const id = z
      .string()
      .uuid()
      .parse((request.params as { id: string }).id);
    const [document] = await db
      .select()
      .from(inboundDocuments)
      .where(and(eq(inboundDocuments.id, id), eq(inboundDocuments.tenantId, tenantId)))
      .limit(1);
    if (!document?.supplierTaxId || !document.supplierName) {
      throw new InboundError(400, 'Esta nota não tem dados do emitente para cadastrar.');
    }
    const [existing] = await db
      .select({ id: persons.id })
      .from(persons)
      .where(
        and(eq(persons.tenantId, tenantId), eq(persons.taxId, document.supplierTaxId)),
      )
      .limit(1);
    let supplierId = existing?.id;
    if (!supplierId) {
      const name = toTitleCasePtBr(document.supplierName).slice(0, 120);
      try {
        const [created] = await db
          .insert(persons)
          .values({
            tenantId,
            type: 'company',
            name,
            taxId: onlyDigits(document.supplierTaxId).slice(0, 14),
            isSupplier: true,
          })
          .returning({ id: persons.id });
        supplierId = created.id;
      } catch (error) {
        if (uniqueViolation(error)) {
          throw new InboundError(
            409,
            'Já existe uma pessoa com este nome ou CNPJ. Vincule o fornecedor manualmente.',
          );
        }
        throw error;
      }
    }
    await markSupplier(tenantId, supplierId);
    await db
      .update(inboundDocuments)
      .set({ supplierId })
      .where(eq(inboundDocuments.id, id));
    await alignDraft(tenantId, id, null);
    return loadDocument(tenantId, id);
  });

  fastify.post('/:id/discover', async (request) => {
    const tenantId = request.user.tenantId;
    const id = z
      .string()
      .uuid()
      .parse((request.params as { id: string }).id);
    return discoverInboundDocument(tenantId, id, async (payload) => {
      const settings = await getOrCreateNfeSettings(tenantId);
      const material = await certificateMaterial(tenantId, settings.environment);
      let response: { statusCode: number | null; body: string };
      try {
        response = await postCertificate({
          endpoint: payload.endpoint,
          body: payload.body,
          headers: payload.headers,
          timeoutMs: connectionTimeoutMs,
          certificatePem: material.certificatePem,
          privateKeyPem: material.privateKeyPem,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Falha ao consultar a SEFAZ.';
        throw new InboundError(502, message);
      }
      if (response.statusCode === null || response.statusCode >= 400) {
        throw new InboundError(502, 'A SEFAZ não respondeu a consulta de DF-e.');
      }
      return response.body;
    });
  });

  fastify.post('/:id/post', async (request) => {
    const tenantId = request.user.tenantId;
    const id = z
      .string()
      .uuid()
      .parse((request.params as { id: string }).id);
    await postInboundDocument(tenantId, id);
    return loadDocument(tenantId, id);
  });

  fastify.post('/:id/reverse', async (request) => {
    const tenantId = request.user.tenantId;
    const id = z
      .string()
      .uuid()
      .parse((request.params as { id: string }).id);
    await reverseInboundDocument(tenantId, id);
    return loadDocument(tenantId, id);
  });

  fastify.delete('/:id', async (request, reply) => {
    const tenantId = request.user.tenantId;
    const id = z
      .string()
      .uuid()
      .safeParse((request.params as { id: string }).id);
    if (!id.success) return reply.status(400).send({ message: 'Nota inválida.' });
    await deleteInboundDocument(tenantId, id.data);
    return reply.status(204).send();
  });
};

async function alignDraft(tenantId: string, documentId: string, purpose: string | null) {
  const lines = await db
    .select({
      id: inboundDocumentLines.id,
      supplierCode: inboundDocumentLines.supplierCode,
      commercialUnit: inboundDocumentLines.commercialUnit,
      factor: inboundDocumentLines.factor,
      xmlCfop: inboundDocumentLines.xmlCfop,
      entryCfop: inboundDocumentLines.entryCfop,
      itemId: inboundDocumentLines.itemId,
    })
    .from(inboundDocumentLines)
    .where(
      and(
        eq(inboundDocumentLines.documentId, documentId),
        eq(inboundDocumentLines.tenantId, tenantId),
      ),
    );
  const [document] = await db
    .select({
      supplierId: inboundDocuments.supplierId,
      accessKey: inboundDocuments.accessKey,
      hasProtocol: inboundDocuments.hasProtocol,
    })
    .from(inboundDocuments)
    .where(eq(inboundDocuments.id, documentId))
    .limit(1);
  if (!document) return;

  for (const line of lines) {
    const entryCfop = await entryCfopFor(tenantId, line.xmlCfop, purpose, line.entryCfop);
    if (entryCfop !== line.entryCfop) {
      await db
        .update(inboundDocumentLines)
        .set({ entryCfop })
        .where(eq(inboundDocumentLines.id, line.id));
    }
    await rememberLink(tenantId, document.supplierId, line);
  }

  const view = await loadDocument(tenantId, documentId);
  if (
    !draftStatuses.has(view.status) &&
    view.status !== 'pre_note' &&
    view.status !== 'divergent'
  ) {
    return;
  }
  await db
    .update(inboundDocuments)
    .set({ status: view.blockers.length > 0 ? 'divergent' : 'pre_note' })
    .where(eq(inboundDocuments.id, documentId));
}
