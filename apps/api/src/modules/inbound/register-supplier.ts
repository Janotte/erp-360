import { personAddresses, personContacts, persons } from '@erp-360/mod-persons';
import { normalizePhone, onlyDigits, toTitleCasePtBr } from '@erp-360/shared';
import { and, eq } from 'drizzle-orm';

import { db } from '../../db/index.ts';
import { uniqueViolation } from '../../lib/postgres-errors.ts';
import { type CnpjLookupResult } from '../persons/cnpj-lookup.ts';
import { InboundError } from './errors.ts';

export type SupplierRegistration = 'linked' | 'complete' | 'basic';

function taxpayerType(stateRegistration: string | null) {
  if (!stateRegistration) return 9;
  if (/^isento$/i.test(stateRegistration)) return 2;
  return 1;
}

function addressNote(address: CnpjLookupResult['address']) {
  if (!address || address.cityId) return '';
  const parts = [
    [address.street, address.number].filter(Boolean).join(', '),
    address.complement,
    address.neighborhood,
    [address.cityName, address.stateAbbreviation].filter(Boolean).join('/'),
    address.postalCode ? `CEP ${address.postalCode}` : '',
  ].filter(Boolean);
  return parts.length > 0 ? `Endereço: ${parts.join(', ')}` : '';
}

function profileNotes(profile: CnpjLookupResult) {
  const lines = [
    profile.tradeName ? `Nome fantasia: ${profile.tradeName}` : '',
    profile.cnae ? `CNAE ${profile.cnae}` : '',
    addressNote(profile.address),
  ].filter(Boolean);
  return lines.length > 0 ? lines.join('. ') : null;
}

function contactPhone(phone: string | null) {
  const digits = normalizePhone(phone);
  if (digits.length < 8) return { phone: null, mobilePhone: null };
  if (digits.length === 11 && digits[2] === '9')
    return { phone: null, mobilePhone: digits };
  return { phone: digits, mobilePhone: null };
}

export async function registerInboundSupplier(input: {
  tenantId: string;
  supplierTaxId: string;
  supplierName: string;
  lookup: () => Promise<CnpjLookupResult | null>;
}): Promise<{
  supplierId: string;
  registration: SupplierRegistration;
  addressSaved: boolean;
}> {
  const taxId = onlyDigits(input.supplierTaxId).slice(0, 14);
  const [existing] = await db
    .select({ id: persons.id })
    .from(persons)
    .where(and(eq(persons.tenantId, input.tenantId), eq(persons.taxId, taxId)))
    .limit(1);
  if (existing) {
    await db
      .update(persons)
      .set({ isSupplier: true })
      .where(and(eq(persons.id, existing.id), eq(persons.tenantId, input.tenantId)));
    return { supplierId: existing.id, registration: 'linked', addressSaved: false };
  }

  const profile = await input.lookup();
  const name = (profile?.name ?? toTitleCasePtBr(input.supplierName)).slice(0, 120);
  const phones = contactPhone(profile?.phone ?? null);
  const contactName = (profile?.tradeName || name).slice(0, 60);
  const address = profile?.address?.cityId ? profile.address : null;

  try {
    const supplierId = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(persons)
        .values({
          tenantId: input.tenantId,
          type: 'company',
          name,
          taxId,
          isSupplier: true,
          birthDate: profile?.birthDate ?? null,
          nfeEmail: profile?.nfeEmail ?? null,
          stateRegistration: profile?.stateRegistration ?? null,
          taxpayerType: taxpayerType(profile?.stateRegistration ?? null),
          notes: profile ? profileNotes(profile) : null,
        })
        .returning({ id: persons.id });

      if (address?.cityId) {
        await tx.insert(personAddresses).values({
          tenantId: input.tenantId,
          personId: created.id,
          type: 'Principal',
          postalCode: address.postalCode,
          street: address.street,
          number: address.number,
          complement: address.complement,
          neighborhood: address.neighborhood,
          cityId: address.cityId,
        });
      }

      if (profile && (phones.phone || phones.mobilePhone || profile.nfeEmail)) {
        await tx.insert(personContacts).values({
          tenantId: input.tenantId,
          personId: created.id,
          type: 'Principal',
          name: contactName,
          email: profile.nfeEmail,
          phone: phones.phone,
          mobilePhone: phones.mobilePhone,
        });
      }

      return created.id;
    });

    return {
      supplierId,
      registration: profile ? 'complete' : 'basic',
      addressSaved: Boolean(address?.cityId),
    };
  } catch (error) {
    if (uniqueViolation(error)) {
      throw new InboundError(
        409,
        'Já existe uma pessoa com este nome ou CNPJ. Vincule o fornecedor manualmente.',
      );
    }
    throw error;
  }
}
