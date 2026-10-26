import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { tenantCertificates } from '@erp-360/mod-core';
import { eq } from 'drizzle-orm';

import { db } from '../src/db/index.ts';
import { deleteCertificate } from '../src/modules/certificates/certificates.ts';
import { createCompany } from './fixtures.ts';

function certificateRow(tenantId: string, environment: 'homologation' | 'production') {
  return {
    tenantId,
    environment,
    pfx: Buffer.from('pfx'),
    passwordCipher: Buffer.from('cipher'),
    serialNumber: '0A1B',
    thumbprintSha256: 'a'.repeat(64),
    subjectName: 'CN=Teste',
    issuerName: 'CN=AC',
    taxId: '11222333000181',
    validFrom: new Date('2026-01-01T00:00:00Z'),
    validUntil: new Date('2027-01-01T00:00:00Z'),
  };
}

describe('exclusão de certificado', () => {
  it('apaga o certificado da empresa e recusa o de outra', async () => {
    const owner = await createCompany('Certificado dono');
    const other = await createCompany('Certificado outro');
    const [created] = await db
      .insert(tenantCertificates)
      .values(certificateRow(owner.tenantId, 'homologation'))
      .returning({ id: tenantCertificates.id });
    const [foreign] = await db
      .insert(tenantCertificates)
      .values(certificateRow(other.tenantId, 'production'))
      .returning({ id: tenantCertificates.id });

    await assert.rejects(
      () => deleteCertificate(other.tenantId, created.id),
      /Certificado não encontrado/,
    );
    const [still] = await db
      .select({ id: tenantCertificates.id })
      .from(tenantCertificates)
      .where(eq(tenantCertificates.id, created.id));
    assert.equal(still.id, created.id);

    await deleteCertificate(owner.tenantId, created.id);
    const left = await db
      .select({ id: tenantCertificates.id })
      .from(tenantCertificates)
      .where(eq(tenantCertificates.id, created.id));
    assert.equal(left.length, 0);

    const [kept] = await db
      .select({ id: tenantCertificates.id })
      .from(tenantCertificates)
      .where(eq(tenantCertificates.id, foreign.id));
    assert.equal(kept.id, foreign.id);
  });
});
