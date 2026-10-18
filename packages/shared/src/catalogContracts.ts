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
