import { cfopEntryRules, operationNatures } from '@erp-360/mod-inbound';
import { eq } from 'drizzle-orm';

import { db } from '../../db/index.ts';
import { findPgError } from '../../lib/postgres-errors.ts';

type Purpose = 'resale' | 'industrialization' | 'consumption' | 'fixed_asset' | 'service' | 'repair';

const natures: Array<{
  code: string;
  name: string;
  fiscalPurpose: Purpose;
  movesStock: boolean;
  createsPayable?: boolean;
  updatesAverageCost: boolean;
  recordsEntryPrice: boolean;
  suggestsListPrice: boolean;
  ipiInCost: boolean;
  stInCost: boolean;
}> = [
  {
    code: 'purchase_resale',
    name: 'Compra para revenda',
    fiscalPurpose: 'resale',
    movesStock: true,
    updatesAverageCost: true,
    recordsEntryPrice: true,
    suggestsListPrice: true,
    ipiInCost: false,
    stInCost: true,
  },
  {
    code: 'purchase_raw',
    name: 'Compra para industrialização',
    fiscalPurpose: 'industrialization',
    movesStock: true,
    updatesAverageCost: true,
    recordsEntryPrice: true,
    suggestsListPrice: false,
    ipiInCost: false,
    stInCost: true,
  },
  {
    code: 'purchase_use',
    name: 'Compra para consumo',
    fiscalPurpose: 'consumption',
    movesStock: false,
    updatesAverageCost: false,
    recordsEntryPrice: false,
    suggestsListPrice: false,
    ipiInCost: true,
    stInCost: true,
  },
  {
    code: 'purchase_asset',
    name: 'Compra de imobilizado',
    fiscalPurpose: 'fixed_asset',
    movesStock: false,
    updatesAverageCost: false,
    recordsEntryPrice: false,
    suggestsListPrice: false,
    ipiInCost: true,
    stInCost: false,
  },
  {
    code: 'purchase_service',
    name: 'Compra de serviço',
    fiscalPurpose: 'service',
    movesStock: false,
    updatesAverageCost: false,
    recordsEntryPrice: false,
    suggestsListPrice: false,
    ipiInCost: false,
    stInCost: false,
  },
  {
    code: 'repair',
    name: 'Remessa e retorno de conserto',
    fiscalPurpose: 'repair',
    movesStock: false,
    createsPayable: false,
    updatesAverageCost: false,
    recordsEntryPrice: false,
    suggestsListPrice: false,
    ipiInCost: false,
    stInCost: false,
  },
];

const cfopRules: Array<{
  sourceCfop: string;
  scope: 'internal' | 'interstate' | 'import';
  fiscalPurpose: Purpose;
  entryCfop: string;
}> = [
  { sourceCfop: '5102', scope: 'internal', fiscalPurpose: 'resale', entryCfop: '1102' },
  { sourceCfop: '6102', scope: 'interstate', fiscalPurpose: 'resale', entryCfop: '2102' },
  { sourceCfop: '5101', scope: 'internal', fiscalPurpose: 'industrialization', entryCfop: '1101' },
  { sourceCfop: '6101', scope: 'interstate', fiscalPurpose: 'industrialization', entryCfop: '2101' },
  { sourceCfop: '5102', scope: 'internal', fiscalPurpose: 'consumption', entryCfop: '1556' },
  { sourceCfop: '6102', scope: 'interstate', fiscalPurpose: 'consumption', entryCfop: '2556' },
  { sourceCfop: '5102', scope: 'internal', fiscalPurpose: 'fixed_asset', entryCfop: '1551' },
  { sourceCfop: '6102', scope: 'interstate', fiscalPurpose: 'fixed_asset', entryCfop: '2551' },
  { sourceCfop: '5405', scope: 'internal', fiscalPurpose: 'resale', entryCfop: '1403' },
  { sourceCfop: '6405', scope: 'interstate', fiscalPurpose: 'resale', entryCfop: '2403' },
  { sourceCfop: '5915', scope: 'internal', fiscalPurpose: 'repair', entryCfop: '1915' },
  { sourceCfop: '6915', scope: 'interstate', fiscalPurpose: 'repair', entryCfop: '2915' },
  { sourceCfop: '5916', scope: 'internal', fiscalPurpose: 'repair', entryCfop: '1916' },
  { sourceCfop: '6916', scope: 'interstate', fiscalPurpose: 'repair', entryCfop: '2916' },
];

export async function ensureInboundSetup(tenantId: string) {
  const [existing] = await db
    .select({ id: operationNatures.id })
    .from(operationNatures)
    .where(eq(operationNatures.tenantId, tenantId))
    .limit(1);
  if (!existing) {
    await db
      .insert(operationNatures)
      .values(
        natures.map((nature) => ({
          tenantId,
          direction: 'in' as const,
          createsPayable: true,
          freightInCost: true,
          insuranceInCost: true,
          otherInCost: true,
          discountInCost: true,
          icmsInCost: false,
          ...nature,
        })),
      )
      .onConflictDoNothing({ target: [operationNatures.tenantId, operationNatures.code] });
    await db
      .insert(cfopEntryRules)
      .values(cfopRules.map((rule) => ({ tenantId, ...rule })))
      .onConflictDoNothing({
        target: [
          cfopEntryRules.tenantId,
          cfopEntryRules.sourceCfop,
          cfopEntryRules.scope,
          cfopEntryRules.fiscalPurpose,
        ],
      });
    return;
  }

  await ensureRepairSetup(tenantId);
}

/** A conexão aberta antes da migração não enxerga o valor novo do enum. A lista segue sem ele. */
async function ensureRepairSetup(tenantId: string) {
  try {
    await db
      .insert(operationNatures)
      .values({
        tenantId,
        direction: 'in',
        code: 'repair',
        name: 'Remessa e retorno de conserto',
        fiscalPurpose: 'repair',
        movesStock: false,
        createsPayable: false,
        updatesAverageCost: false,
        recordsEntryPrice: false,
        suggestsListPrice: false,
        freightInCost: false,
        insuranceInCost: false,
        otherInCost: false,
        discountInCost: false,
        ipiInCost: false,
        stInCost: false,
        icmsInCost: false,
      })
      .onConflictDoNothing({ target: [operationNatures.tenantId, operationNatures.code] });
    await db
      .insert(cfopEntryRules)
      .values(
        cfopRules
          .filter((rule) => rule.fiscalPurpose === 'repair')
          .map((rule) => ({ tenantId, ...rule })),
      )
      .onConflictDoNothing({
        target: [
          cfopEntryRules.tenantId,
          cfopEntryRules.sourceCfop,
          cfopEntryRules.scope,
          cfopEntryRules.fiscalPurpose,
        ],
      });
  } catch (error) {
    if (findPgError(error, '22P02')) return;
    throw error;
  }
}

export function cfopScope(cfop: string): 'internal' | 'interstate' | 'import' | null {
  if (cfop.startsWith('5') || cfop.startsWith('1')) return 'internal';
  if (cfop.startsWith('6') || cfop.startsWith('2')) return 'interstate';
  if (cfop.startsWith('7') || cfop.startsWith('3')) return 'import';
  return null;
}
