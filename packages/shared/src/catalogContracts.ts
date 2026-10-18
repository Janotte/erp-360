export const measureTypes = [
  'weight',
  'volume',
  'length',
  'area',
  'unit',
  'time',
] as const;

export type MeasureType = (typeof measureTypes)[number];

export const measureTypeLabels: Record<MeasureType, string> = {
  weight: 'Peso',
  volume: 'Volume',
  length: 'Comprimento',
  area: 'Área',
  unit: 'Unidade',
  time: 'Tempo',
};

export const catalogItemTypes = ['product', 'service'] as const;

export type CatalogItemType = (typeof catalogItemTypes)[number];

export const catalogItemTypeLabels: Record<CatalogItemType, string> = {
  product: 'Produto',
  service: 'Serviço',
};

/** Tipo de item do SPED, registro 0200. */
export const fiscalItemTypes = [
  'resale',
  'raw_material',
  'packaging',
  'work_in_process',
  'finished_product',
  'byproduct',
  'intermediate_product',
  'consumable',
  'fixed_asset',
  'service',
  'other_input',
  'other',
] as const;

export type FiscalItemType = (typeof fiscalItemTypes)[number];

export const fiscalItemTypeLabels: Record<FiscalItemType, string> = {
  resale: '00 Mercadoria para revenda',
  raw_material: '01 Matéria-prima',
  packaging: '02 Embalagem',
  work_in_process: '03 Produto em processo',
  finished_product: '04 Produto acabado',
  byproduct: '05 Subproduto',
  intermediate_product: '06 Produto intermediário',
  consumable: '07 Material de uso e consumo',
  fixed_asset: '08 Ativo imobilizado',
  service: '09 Serviços',
  other_input: '10 Outros insumos',
  other: '99 Outros',
};

export const productFiscalItemTypes = fiscalItemTypes.filter(
  (type) => type !== 'service',
);
