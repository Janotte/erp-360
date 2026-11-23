import type { ChangeEvent, FocusEvent, KeyboardEvent, MouseEvent } from 'react';

const MAX_INTEGERS = 12;

function readDecimal(value: string, fractionDigits: number) {
  const cleaned = value.replace(/[^\d,]/g, '');
  const comma = cleaned.indexOf(',');
  const maxIntegers = fractionDigits >= 4 ? 11 : MAX_INTEGERS;
  const rawInt = (comma === -1 ? cleaned : cleaned.slice(0, comma)).replace(/^0+(?=\d)/, '');
  const integers = rawInt.slice(0, maxIntegers);
  const fraction =
    comma === -1 ? '' : cleaned.slice(comma + 1).replace(/,/g, '').slice(0, fractionDigits);
  return { integers, fraction, hasComma: comma !== -1 };
}

function groupIntegers(integers: string) {
  return integers.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Mantém o que a pessoa digita: inteiro ou inteiro,fração, sem empurrar casas. */
export function typeDecimal(value: string, fractionDigits: number) {
  const { integers, fraction, hasComma } = readDecimal(value, fractionDigits);
  if (!hasComma) return integers;
  return `${integers},${fraction}`;
}

/** Enter ou saída do campo completa as casas decimais. */
export function commitDecimal(value: string, fractionDigits: number) {
  const { integers, fraction, hasComma } = readDecimal(value, fractionDigits);
  if (!integers && !hasComma) return '';
  if (!integers && !fraction) return '';
  const grouped = groupIntegers(integers || '0');
  if (fractionDigits === 0) return grouped;
  return `${grouped},${fraction.padEnd(fractionDigits, '0')}`;
}

/** Inteiro vale reais inteiros. Com vírgula, a fração é a parte decimal. */
export function decimalToCents(value: string) {
  const { integers, fraction } = readDecimal(value, 2);
  if (!integers && !fraction) return 0;
  const reais = Number.parseInt(integers || '0', 10);
  const cents = Number.parseInt(fraction.padEnd(2, '0') || '0', 10);
  return reais * 100 + cents;
}

/** Escala da API: `10` e `10,5` viram `10.0000` e `10.5000`. */
export function decimalToApi(value: string, fractionDigits: number) {
  const { integers, fraction } = readDecimal(value, fractionDigits);
  if (!integers && !fraction) return `0.${'0'.repeat(fractionDigits)}`;
  return `${integers || '0'}.${fraction.padEnd(fractionDigits, '0')}`;
}

/** Valor já gravado (`1.0000` ou `10.5`) para o campo em pt-BR. */
export function formatApiDecimal(value: string | null | undefined, fractionDigits: number) {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return '';
  if (trimmed.includes(',')) return commitDecimal(trimmed, fractionDigits);
  const [rawInt = '', rawFrac = ''] = trimmed.split('.');
  const integers = rawInt.replace(/\D/g, '');
  const fraction = rawFrac.replace(/\D/g, '').slice(0, fractionDigits);
  if (!integers && !fraction) return '';
  return commitDecimal(`${integers || '0'},${fraction}`, fractionDigits);
}

export function scale4(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.includes(',')
    ? trimmed.replace(/\./g, '').replace(',', '.')
    : trimmed;
  const match = /^(\d+)(?:\.(\d{0,4}))?$/.exec(normalized);
  if (!match) return null;
  return BigInt(match[1]) * 10_000n + BigInt((match[2] ?? '').padEnd(4, '0'));
}

export function decimalInputHandlers(
  fractionDigits: number,
  onType: (value: string) => void,
  onCommit: (value: string) => void = onType,
) {
  return {
    inputMode: 'decimal' as const,
    autoComplete: 'off' as const,
    onFocus(event: FocusEvent<HTMLInputElement>) {
      event.currentTarget.select();
    },
    onMouseUp(event: MouseEvent<HTMLInputElement>) {
      event.preventDefault();
    },
    onChange(event: ChangeEvent<HTMLInputElement>) {
      onType(typeDecimal(event.target.value, fractionDigits));
    },
    onBlur(event: FocusEvent<HTMLInputElement>) {
      onCommit(commitDecimal(event.currentTarget.value, fractionDigits));
    },
    onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
      if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
      onCommit(commitDecimal(event.currentTarget.value, fractionDigits));
    },
  };
}
