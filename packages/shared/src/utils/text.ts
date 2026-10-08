const LOWER_PARTICLES = new Set([
  'a',
  'as',
  'o',
  'os',
  'ao',
  'aos',
  'à',
  'às',
  'da',
  'das',
  'de',
  'do',
  'dos',
  'e',
  'em',
  'na',
  'nas',
  'no',
  'nos',
  'para',
  'por',
  'com',
]);

const COMPANY_TOKENS: Record<string, string> = {
  ltda: 'Ltda.',
  'ltda.': 'Ltda.',
  me: 'ME',
  eireli: 'EIRELI',
  epp: 'EPP',
  's.a.': 'S.A.',
  's.a': 'S.A.',
  's/a': 'S.A.',
  's/s.': 'S/S.',
  'S/s.': 'S/S.',
};

export function compactSpaces(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

export function emptyToNull(value?: string | null) {
  const trimmed = value?.trim() ?? '';
  return trimmed ? trimmed : null;
}

export function normalizeEmail(value?: string | null) {
  return value?.trim().toLowerCase() ?? '';
}

export function normalizePersonName(value: string, preserveCasing = false) {
  return preserveCasing ? compactSpaces(value) : toTitleCasePtBr(value);
}

export function toTitleCasePtBr(value: string) {
  const compact = compactSpaces(value);
  if (!compact) return '';

  return compact
    .split(' ')
    .map((word, index) => formatTitleWord(word, index === 0))
    .join(' ');
}

function formatTitleWord(word: string, isFirst: boolean): string {
  if (word.includes('-')) {
    return word
      .split('-')
      .map((part, index) => formatTitleWord(part, isFirst && index === 0))
      .join('-');
  }

  const lower = word.toLocaleLowerCase('pt-BR');
  const companyToken = COMPANY_TOKENS[lower];
  if (companyToken) return companyToken;
  if (/^[a-z0-9]+(?:\.[a-z0-9]+)+\.?$/.test(lower)) {
    return lower.toLocaleUpperCase('pt-BR');
  }
  if (!isFirst && LOWER_PARTICLES.has(lower)) return lower;

  return capitalizeWord(lower);
}

function capitalizeWord(word: string) {
  const quote = word.search(/['’]/);
  if (quote > 0) {
    const mark = word[quote];
    const head = word.slice(0, quote);
    const tail = word.slice(quote + 1);
    if (tail === 's') {
      return `${capitalizeSimple(head)}${mark}s`;
    }
    const headOut =
      LOWER_PARTICLES.has(head) || head.length <= 1 ? head : capitalizeSimple(head);
    return `${headOut}${mark}${capitalizeSimple(tail)}`;
  }
  return capitalizeSimple(word);
}

function capitalizeSimple(word: string) {
  if (!word) return word;
  return word.charAt(0).toLocaleUpperCase('pt-BR') + word.slice(1);
}

export function escapeIlike(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}
