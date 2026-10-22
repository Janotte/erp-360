import type { CfopScope, FiscalPurpose } from '@/services/inboundSetup';

export const fiscalPurposes: FiscalPurpose[] = [
  'resale',
  'industrialization',
  'consumption',
  'fixed_asset',
  'service',
];

export const fiscalPurposeLabels: Record<FiscalPurpose, string> = {
  resale: 'Revenda',
  industrialization: 'Industrialização',
  consumption: 'Consumo',
  fixed_asset: 'Imobilizado',
  service: 'Serviço',
};

export const cfopScopeLabels: Record<CfopScope, string> = {
  internal: 'Interno',
  interstate: 'Interestadual',
  import: 'Importação',
};

export function scopeFromSourceCfop(cfop: string): CfopScope | null {
  const digit = cfop.replace(/\D/g, '')[0];
  if (digit === '5' || digit === '1') return 'internal';
  if (digit === '6' || digit === '2') return 'interstate';
  if (digit === '7' || digit === '3') return 'import';
  return null;
}

export const selectClassName =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';
