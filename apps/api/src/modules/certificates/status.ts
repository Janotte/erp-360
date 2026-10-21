import { CERTIFICATE_WARNING_DAYS, civilDate } from '@erp-360/shared';

export function certificateDaysLeft(validUntil: Date, today = civilDate()): number {
  const end = civilDate(validUntil);
  const startMs = Date.parse(`${today}T00:00:00`);
  const endMs = Date.parse(`${end}T00:00:00`);
  return Math.round((endMs - startMs) / 86_400_000);
}

export function certificateNotice(validUntil: Date, today = civilDate()) {
  const daysLeft = certificateDaysLeft(validUntil, today);
  if (daysLeft > CERTIFICATE_WARNING_DAYS) return null;
  return { daysLeft, expired: daysLeft < 0 };
}

export function certificateIsCurrent(validFrom: Date, validUntil: Date, now = new Date()) {
  return now >= validFrom && now <= validUntil;
}
