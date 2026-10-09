type PgErrorLike = {
  code?: string;
  constraint?: string;
  detail?: string;
};

function walk(error: unknown, acc: PgErrorLike[] = []): PgErrorLike[] {
  if (!error || typeof error !== 'object') return acc;
  acc.push(error as PgErrorLike);
  if ('cause' in error) walk((error as { cause: unknown }).cause, acc);
  return acc;
}

export function uniqueViolation(error: unknown): PgErrorLike | null {
  return walk(error).find((item) => item.code === '23505') ?? null;
}

export function uniqueConflictMessage(
  error: unknown,
  messages: Record<string, string>,
  fallback: string,
): string | null {
  const violation = uniqueViolation(error);
  if (!violation) return null;

  const haystack = `${violation.constraint ?? ''} ${violation.detail ?? ''}`.toLowerCase();
  const match = Object.entries(messages)
    .sort(([left], [right]) => right.length - left.length)
    .find(([needle]) => haystack.includes(needle.toLowerCase()));

  return match?.[1] ?? fallback;
}
