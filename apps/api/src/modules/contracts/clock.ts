import { tenants } from '@erp-360/mod-core';
import { cities } from '@erp-360/mod-persons';
import { civilDate } from '@erp-360/shared';
import { eq } from 'drizzle-orm';

import { db } from '../../db/index.ts';

function timeZoneOf(value: string | null | undefined) {
  if (!value) return 'America/Sao_Paulo';
  try {
    Intl.DateTimeFormat('pt-BR', { timeZone: value }).format(new Date());
    return value;
  } catch {
    return 'America/Sao_Paulo';
  }
}

/** Data civil de hoje no fuso da cidade da empresa. */
export async function todayForTenant(tenantId: string) {
  const [tenant] = await db
    .select({ cityId: tenants.cityId })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  let timeZone = 'America/Sao_Paulo';
  if (tenant?.cityId) {
    const [city] = await db
      .select({ timezone: cities.timezone })
      .from(cities)
      .where(eq(cities.id, tenant.cityId))
      .limit(1);
    timeZone = timeZoneOf(city?.timezone);
  }
  return civilDate(new Date(), timeZone);
}
