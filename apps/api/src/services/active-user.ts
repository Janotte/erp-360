import { users } from '@erp-360/mod-core';
import { and, eq } from 'drizzle-orm';

import { db } from '../db/index.ts';

export async function activeUser(userId: string, tenantId: string) {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
    .limit(1);

  return user ?? null;
}
