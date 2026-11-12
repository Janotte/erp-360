import '../../types/fastify.ts';

import { catalogItems } from '@erp-360/mod-catalog';
import { tenants } from '@erp-360/mod-core';
import {
  cfopEntryRules,
  dfeDocuments,
  inboundDocumentFiles,
  inboundDocumentInstallments,
  inboundDocumentLines,
  inboundDocuments,
  operationNatures,
  supplierItemLinks,
} from '@erp-360/mod-inbound';
import { persons } from '@erp-360/mod-persons';
import { escapeIlike, isValidCnpj, onlyDigits } from '@erp-360/shared';
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  like,
  lte,
  ne,
  or,
  sql,
} from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { db } from '../../db/index.ts';
import { uniqueViolation } from '../../lib/postgres-errors.ts';
import { postCertificate } from '../certificates/probe.ts';
import { connectionTimeoutMs } from '../certificates/sefaz.ts';
import { CnpjLookupError, lookupCnpj } from '../persons/cnpj-lookup.ts';
import { moneyToCents } from './cost.ts';
import { discoverInboundDocument } from './dfe-discover.ts';
import {
  listInboundEvents,
  loadInboundDanfe,
  loadManifestationXml,
  manifestationFileName,
  manifestInboundDocument,
} from './dfe-manifest.ts';
import { discoveryAction } from './dfe-note.ts';
import { certificateMaterial } from './dfe-sync.ts';
import { InboundError } from './errors.ts';
import { normalizeInboundFinance } from './finance.ts';
import { parseNfeXml } from './nfe.ts';
import { getOrCreateNfeSettings } from './nfe-settings.ts';
import { persistParsedNfe } from './persist-nfe.ts';
import { registerInboundSupplier } from './register-supplier.ts';
import {
  deleteInboundDocument,
  entryDateMessage,
  postInboundDocument,
  reverseInboundDocument,
} from './post.ts';

export { entryDateMessage };
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

const financeInput = z.object({
  financialStatus: z.enum(['pending', 'classified', 'waived']),
  paymentKind: z.enum(['supplier', 'card']).nullable(),
  companyCardId: z.string().uuid().nullable(),
  waiverReason: z.string().max(255).nullable(),
});

const manifestBody = z.object({
  kind: z.enum(['aware', 'confirmed', 'unaware', 'not_performed']),
  justification: z.string().trim().max(255).optional(),
});

const draftBody = z.object({
  supplierId: z.string().uuid().nullable().optional(),
  natureId: z.string().uuid().nullable().optional(),
  number: z.string().trim().min(1).max(9),
  series: z.string().trim().min(1).max(3),
  issueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  inboundOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  lines: z.array(lineInput).min(1),
  installments: z.array(installmentInput),
  finance: financeInput.optional(),
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
            | 'resale'
            | 'industrialization'
            | 'consumption'
            | 'fixed_asset'
            | 'service'
            | 'repair',
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
        ne(inboundDocumentFiles.fileName, manifestationFileName),
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
        ne(inboundDocumentFiles.fileName, manifestationFileName),
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

async function hasCompleteXml(tenantId: string, accessKey: string) {
  const settings = await getOrCreateNfeSettings(tenantId);
  const [archived] = await db
    .select({ id: dfeDocuments.id })
    .from(dfeDocuments)
    .where(
      and(
        eq(dfeDocuments.tenantId, tenantId),
        eq(dfeDocuments.environment, settings.environment),
        eq(dfeDocuments.accessKey, accessKey),
        eq(dfeDocuments.kind, 'nfe'),
      ),
    )
    .limit(1);
  return Boolean(archived);
}

function postBlockers(
  document: {
    status: string;
    accessKey: string | null;
    hasProtocol: boolean;
    supplierId: string | null;
    supplierActive: boolean | null;
    natureId: string | null;
    totalAmount: number;
    financialStatus: 'pending' | 'classified' | 'waived';
    paymentKind: 'supplier' | 'card' | null;
    companyCardId: string | null;
  },
  lines: {
    lineNumber: number;
    itemId: string | null;
    entryCfop: string | null;
    factor: string;
  }[],
  installments: { amount: number }[],
) {
  const blockers: string[] = [];
  if (!draftStatuses.has(document.status)) return blockers;
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
    if (Number(line.factor) <= 0) {
      blockers.push(`Item ${line.lineNumber} sem fator de conversão.`);
    }
  }
  const sum = installments.reduce((total, installment) => total + installment.amount, 0);
  if (document.totalAmount > 0 && document.financialStatus === 'pending') {
    blockers.push('Classifique o pagamento.');
  } else if (document.totalAmount > 0 && document.financialStatus !== 'waived') {
    if (installments.length === 0) {
      blockers.push('Classifique o pagamento.');
    } else if (Math.abs(sum - document.totalAmount) > 1) {
      blockers.push('A soma das parcelas não fecha com o total da nota.');
    } else if (document.paymentKind === 'card' && !document.companyCardId) {
      blockers.push('Informe o cartão.');
    }
  }
  return blockers;
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
      xmlPaymentCode: inboundDocuments.xmlPaymentCode,
      xmlPaymentAmount: inboundDocuments.xmlPaymentAmount,
      financialStatus: inboundDocuments.financialStatus,
      paymentKind: inboundDocuments.paymentKind,
      waiverReason: inboundDocuments.waiverReason,
      companyCardId: inboundDocuments.companyCardId,
      recipientManifestation: inboundDocuments.recipientManifestation,
      authorizationStatus: inboundDocuments.authorizationStatus,
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

  const blockers = postBlockers(document, lines, installments);

  const completeXml =
    document.status === 'discovered' && document.accessKey
      ? await hasCompleteXml(tenantId, document.accessKey)
      : false;

  return {
    ...document,
    supplierName: document.linkedSupplierName ?? document.supplierName,
    blockers,
    lines,
    installments,
    discoveryAction: discoveryAction({
      status: document.status,
      authorizationStatus: document.authorizationStatus,
      recipientManifestation: document.recipientManifestation,
      hasCompleteXml: completeXml,
    }),
  };
}

const inboundSorts = [
  'inboundOn',
  'issueOn',
  'number',
  'supplier',
  'totalAmount',
  'nature',
  'manifestation',
  'status',
] as const;

export const inboundListQuery = z.object({
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
  manifestation: z
    .enum(['none', 'aware', 'confirmed', 'unaware', 'not_performed'])
    .optional(),
  queue: z.enum(['to_post']).optional(),
  sort: z.enum(inboundSorts).optional(),
  dir: z.enum(['asc', 'desc']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export async function listInboundDocuments(
  tenantId: string,
  query: z.infer<typeof inboundListQuery>,
) {
  const filters = [eq(inboundDocuments.tenantId, tenantId)];
  if (query.status) filters.push(eq(inboundDocuments.status, query.status));
  else if (query.queue === 'to_post') {
    filters.push(inArray(inboundDocuments.status, ['pending', 'pre_note', 'divergent']));
  }
  if (query.manifestation) {
    filters.push(eq(inboundDocuments.recipientManifestation, query.manifestation));
  }
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

  const direction = query.dir === 'asc' ? 'ASC' : 'DESC';
  const sortSql = {
    inboundOn: sql`${inboundDocuments.inboundOn} ${sql.raw(direction)} NULLS LAST`,
    issueOn: sql`${inboundDocuments.issueOn} ${sql.raw(direction)}`,
    number: sql`lpad(${inboundDocuments.number}, 9, '0') ${sql.raw(direction)}`,
    supplier: sql`coalesce(${persons.name}, ${inboundDocuments.supplierName}) ${sql.raw(direction)}`,
    totalAmount: sql`${inboundDocuments.totalAmount} ${sql.raw(direction)}`,
    nature: sql`${operationNatures.name} ${sql.raw(direction)} NULLS LAST`,
    manifestation: sql`${inboundDocuments.recipientManifestation} ${sql.raw(direction)}`,
    status: sql`${inboundDocuments.status} ${sql.raw(direction)}`,
  } as const;
  const order = query.sort
    ? [sortSql[query.sort], desc(inboundDocuments.createdAt)]
    : [
        sql`${inboundDocuments.inboundOn} DESC NULLS LAST`,
        desc(inboundDocuments.issueOn),
        desc(inboundDocuments.createdAt),
      ];

  const page = query.page ?? 1;
  const limit = query.limit ?? 10;
  const where = and(...filters);
  const [totalCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(inboundDocuments)
    .leftJoin(persons, eq(persons.id, inboundDocuments.supplierId))
    .leftJoin(operationNatures, eq(operationNatures.id, inboundDocuments.natureId))
    .where(where);

  const rows = await db
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
      supplierId: inboundDocuments.supplierId,
      supplierActive: persons.isActive,
      natureId: inboundDocuments.natureId,
      hasProtocol: inboundDocuments.hasProtocol,
      financialStatus: inboundDocuments.financialStatus,
      paymentKind: inboundDocuments.paymentKind,
      companyCardId: inboundDocuments.companyCardId,
    })
    .from(inboundDocuments)
    .leftJoin(persons, eq(persons.id, inboundDocuments.supplierId))
    .leftJoin(operationNatures, eq(operationNatures.id, inboundDocuments.natureId))
    .where(where)
    .orderBy(...order)
    .limit(limit)
    .offset((page - 1) * limit);

  const draftIds = rows
    .filter((row) => draftStatuses.has(row.status))
    .map((row) => row.id);
  const lineRows =
    draftIds.length === 0
      ? []
      : await db
          .select({
            documentId: inboundDocumentLines.documentId,
            lineNumber: inboundDocumentLines.lineNumber,
            itemId: inboundDocumentLines.itemId,
            entryCfop: inboundDocumentLines.entryCfop,
            factor: inboundDocumentLines.factor,
          })
          .from(inboundDocumentLines)
          .where(
            and(
              eq(inboundDocumentLines.tenantId, tenantId),
              inArray(inboundDocumentLines.documentId, draftIds),
            ),
          )
          .orderBy(asc(inboundDocumentLines.lineNumber));
  const installmentRows =
    draftIds.length === 0
      ? []
      : await db
          .select({
            documentId: inboundDocumentInstallments.documentId,
            amount: inboundDocumentInstallments.amount,
          })
          .from(inboundDocumentInstallments)
          .where(
            and(
              eq(inboundDocumentInstallments.tenantId, tenantId),
              inArray(inboundDocumentInstallments.documentId, draftIds),
            ),
          );

  const total = Number(totalCount?.count ?? 0);
  return {
    data: rows.map((row) => {
      const {
        supplierId,
        supplierActive,
        natureId,
        hasProtocol,
        financialStatus,
        paymentKind,
        companyCardId,
        ...item
      } = row;
      return {
        ...item,
        postBlocker:
          postBlockers(
            {
              ...row,
              supplierId,
              supplierActive,
              natureId,
              hasProtocol,
              financialStatus,
              paymentKind,
              companyCardId,
            },
            lineRows.filter((line) => line.documentId === row.id),
            installmentRows.filter((installment) => installment.documentId === row.id),
          )[0] ?? null,
      };
    }),
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

async function markSupplier(tenantId: string, supplierId: string) {
  await db
    .update(persons)
    .set({ isSupplier: true })
    .where(and(eq(persons.id, supplierId), eq(persons.tenantId, tenantId)));
}

async function sefazPost(
  tenantId: string,
  payload: { endpoint: string; body: string; headers: Record<string, string> },
) {
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
}

function documentId(params: unknown) {
  return z
    .string()
    .uuid()
    .parse((params as { id: string }).id);
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
    const issueOn = document.accessKey ? document.issueOn : body.issueOn;
    const rejectedDate = entryDateMessage(body.inboundOn, issueOn);
    if (rejectedDate) throw new InboundError(400, rejectedDate);
    const inboundOn = body.inboundOn === undefined ? {} : { inboundOn: body.inboundOn };
    if (document.accessKey) {
      await db
        .update(inboundDocuments)
        .set({
          supplierId: body.supplierId ?? null,
          natureId: body.natureId ?? null,
          ...inboundOn,
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
      const finance = body.finance
        ? await normalizeInboundFinance(
            tenantId,
            body.finance,
            body.installments,
            totalAmount,
          )
        : null;
      await db.transaction(async (tx) => {
        await tx
          .update(inboundDocuments)
          .set({
            supplierId: body.supplierId ?? null,
            natureId: body.natureId ?? null,
            number: body.number,
            series: body.series,
            issueOn: body.issueOn,
            ...inboundOn,
            totalAmount,
            ...(finance
              ? {
                  financialStatus: finance.financialStatus,
                  paymentKind: finance.paymentKind,
                  companyCardId: finance.companyCardId,
                  waiverReason: finance.waiverReason,
                }
              : {}),
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
        const installments = finance
          ? finance.installments
          : body.installments.length > 0
            ? body.installments
            : totalAmount > 0
              ? [{ number: '001', dueOn: body.issueOn, amount: totalAmount }]
              : [];
        if (installments.length > 0 && installments[0].amount > 0) {
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

    if (document.accessKey && body.finance) {
      const normalized = await normalizeInboundFinance(
        tenantId,
        body.finance,
        body.installments,
        document.totalAmount,
      );
      await db
        .update(inboundDocuments)
        .set({
          financialStatus: normalized.financialStatus,
          paymentKind: normalized.paymentKind,
          companyCardId: normalized.companyCardId,
          waiverReason: normalized.waiverReason,
        })
        .where(eq(inboundDocuments.id, id));
      await db
        .delete(inboundDocumentInstallments)
        .where(eq(inboundDocumentInstallments.documentId, id));
      if (normalized.installments.length > 0) {
        await db.insert(inboundDocumentInstallments).values(
          normalized.installments.map((installment) => ({
            tenantId,
            documentId: id,
            number: installment.number,
            dueOn: installment.dueOn,
            amount: installment.amount,
          })),
        );
      }
    } else if (document.accessKey && body.installments.length > 0) {
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
    const registered = await registerInboundSupplier({
      tenantId,
      supplierTaxId: document.supplierTaxId,
      supplierName: document.supplierName,
      lookup: async () => {
        try {
          return await lookupCnpj({ tenantId, cnpj: document.supplierTaxId as string });
        } catch (error) {
          if (error instanceof CnpjLookupError) return null;
          throw error;
        }
      },
    });
    await db
      .update(inboundDocuments)
      .set({ supplierId: registered.supplierId })
      .where(eq(inboundDocuments.id, id));
    await alignDraft(tenantId, id, null);
    return {
      ...(await loadDocument(tenantId, id)),
      supplierRegistration: registered.registration,
      addressSaved: registered.addressSaved,
    };
  });

  fastify.post('/:id/discover', async (request) => {
    const tenantId = request.user.tenantId;
    const id = documentId(request.params);
    return discoverInboundDocument(tenantId, id, (payload) =>
      sefazPost(tenantId, payload),
    );
  });

  fastify.get('/:id/events', async (request) => {
    const tenantId = request.user.tenantId;
    const events = await listInboundEvents(tenantId, documentId(request.params));
    return { events };
  });

  fastify.get('/:id/manifestation', async (request) => {
    const tenantId = request.user.tenantId;
    const xml = await loadManifestationXml(tenantId, documentId(request.params));
    return { xml };
  });

  fastify.get('/:id/danfe', async (request) => {
    const tenantId = request.user.tenantId;
    return loadInboundDanfe(tenantId, documentId(request.params));
  });

  fastify.post('/:id/manifest', { schema: { body: manifestBody } }, async (request) => {
    const tenantId = request.user.tenantId;
    return manifestInboundDocument(
      tenantId,
      documentId(request.params),
      request.body,
      (payload) => sefazPost(tenantId, payload),
    );
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
