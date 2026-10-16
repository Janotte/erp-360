const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

type Attempt = {
  failures: number;
  windowStartedAt: number;
};

const attempts = new Map<string, Attempt>();

function currentAttempt(email: string, now: number) {
  const entry = attempts.get(email);
  if (!entry) return null;
  if (now - entry.windowStartedAt > WINDOW_MS) {
    attempts.delete(email);
    return null;
  }
  return entry;
}

export function isLoginBlocked(email: string, now = Date.now()) {
  const entry = currentAttempt(email, now);
  return (entry?.failures ?? 0) >= MAX_FAILURES;
}

export function recordLoginFailure(email: string, now = Date.now()) {
  const entry = currentAttempt(email, now);
  if (!entry) {
    attempts.set(email, { failures: 1, windowStartedAt: now });
    return;
  }
  entry.failures += 1;
}

export function clearLoginFailures(email: string) {
  attempts.delete(email);
}
