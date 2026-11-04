import assert from 'node:assert/strict';
import { randomInt } from 'node:crypto';
import { describe, it } from 'node:test';

import {
  cities,
  countries,
  personAddresses,
  personContacts,
  persons,
  states,
} from '@erp-360/mod-persons';
import { eq } from 'drizzle-orm';

import { db } from '../src/db/index.ts';
import { registerInboundSupplier } from '../src/modules/inbound/register-supplier.ts';
import { createCompany, removeCompany } from './fixtures.ts';

async function createCity() {
  const suffix = String(randomInt(0, 10000)).padStart(4, '0');
  const [country] = await db
    .insert(countries)
    .values({
      name: `País teste ${suffix}`,
      code: suffix,
    })
    .returning({ id: countries.id });
  const [state] = await db
    .insert(states)
    .values({
      name: `Estado teste ${suffix}`,
      abbreviation: suffix.slice(0, 2),
      code: suffix.slice(2, 4),
      region: 'Sudeste',
      countryId: country.id,
    })
    .returning({ id: states.id });
  const [city] = await db
    .insert(cities)
    .values({
      name: `Cidade teste ${suffix}`,
      code: `9${suffix}00`,
      stateId: state.id,
    })
    .returning({ id: cities.id });
  return { countryId: country.id, stateId: state.id, cityId: city.id };
}

async function removeCity(place: { countryId: string; stateId: string; cityId: string }) {
  await db.delete(cities).where(eq(cities.id, place.cityId));
  await db.delete(states).where(eq(states.id, place.stateId));
  await db.delete(countries).where(eq(countries.id, place.countryId));
}

describe('cadastro do fornecedor na entrada', () => {
  it('grava inscrição, endereço e contato vindos da consulta do CNPJ', async () => {
    const company = await createCompany('Fornecedor CNPJ');
    const place = await createCity();
    try {
      const registered = await registerInboundSupplier({
        tenantId: company.tenantId,
        supplierTaxId: '33851182000163',
        supplierName: 'T.C. DE SOUSA',
        lookup: async () => ({
          taxId: '33851182000163',
          name: 'T.c. De Sousa',
          tradeName: 'Maissnegocios',
          birthDate: '2019-05-10',
          nfeEmail: 'fiscal@tcdesousa.com.br',
          phone: '11987654321',
          cnae: '6201501',
          stateRegistration: '123456789',
          address: {
            postalCode: '07666050',
            street: 'Estrada Jonas Siaulys',
            number: '0',
            complement: null,
            neighborhood: 'Corumba',
            cityId: place.cityId,
            cityName: null,
            stateAbbreviation: 'SP',
          },
          existingPersonId: null,
        }),
      });

      assert.equal(registered.registration, 'complete');
      assert.equal(registered.addressSaved, true);
      const [person] = await db
        .select()
        .from(persons)
        .where(eq(persons.id, registered.supplierId));
      assert.equal(person.name, 'T.c. De Sousa');
      assert.equal(person.taxId, '33851182000163');
      assert.equal(person.isSupplier, true);
      assert.equal(person.taxpayerType, 1);
      assert.equal(person.stateRegistration, '123456789');
      assert.equal(person.nfeEmail, 'fiscal@tcdesousa.com.br');
      assert.equal(person.birthDate, '2019-05-10');
      assert.match(person.notes ?? '', /Nome fantasia: Maissnegocios/);
      assert.match(person.notes ?? '', /CNAE 6201501/);
      assert.doesNotMatch(person.notes ?? '', /Endereço:/);

      const [address] = await db
        .select()
        .from(personAddresses)
        .where(eq(personAddresses.personId, person.id));
      assert.equal(address.cityId, place.cityId);
      assert.equal(address.street, 'Estrada Jonas Siaulys');
      assert.equal(address.type, 'Principal');

      const [contact] = await db
        .select()
        .from(personContacts)
        .where(eq(personContacts.personId, person.id));
      assert.equal(contact.mobilePhone, '11987654321');
      assert.equal(contact.phone, null);
      assert.equal(contact.email, 'fiscal@tcdesousa.com.br');
      assert.equal(contact.name, 'Maissnegocios');
    } finally {
      await removeCompany(company.tenantId);
      await removeCity(place);
    }
  });

  it('grava só CNPJ e razão social quando a consulta não responde', async () => {
    const company = await createCompany('Fornecedor básico');
    try {
      const registered = await registerInboundSupplier({
        tenantId: company.tenantId,
        supplierTaxId: '33851182000163',
        supplierName: 'T.C. DE SOUSA',
        lookup: async () => null,
      });
      assert.equal(registered.registration, 'basic');
      assert.equal(registered.addressSaved, false);
      const [person] = await db
        .select()
        .from(persons)
        .where(eq(persons.id, registered.supplierId));
      assert.equal(person.taxId, '33851182000163');
      assert.equal(person.name, 'T.C. de Sousa');
      assert.equal(person.taxpayerType, 9);
      assert.equal(person.stateRegistration, null);
      assert.equal(person.nfeEmail, null);
      const addresses = await db
        .select({ id: personAddresses.id })
        .from(personAddresses)
        .where(eq(personAddresses.personId, person.id));
      assert.equal(addresses.length, 0);
    } finally {
      await removeCompany(company.tenantId);
    }
  });

  it('guarda o endereço nas observações quando a cidade não está cadastrada', async () => {
    const company = await createCompany('Fornecedor sem cidade');
    try {
      const registered = await registerInboundSupplier({
        tenantId: company.tenantId,
        supplierTaxId: '33851182000163',
        supplierName: 'T.C. DE SOUSA',
        lookup: async () => ({
          taxId: '33851182000163',
          name: 'T.c. De Sousa',
          tradeName: null,
          birthDate: null,
          nfeEmail: null,
          phone: '1135310437',
          cnae: null,
          stateRegistration: '433229250110',
          address: {
            postalCode: '07666050',
            street: 'Estrada Jonas Siaulys',
            number: '0',
            complement: null,
            neighborhood: 'Corumba',
            cityId: null,
            cityName: 'Mairiporã',
            stateAbbreviation: 'SP',
          },
          existingPersonId: null,
        }),
      });
      assert.equal(registered.addressSaved, false);
      const [person] = await db
        .select({ notes: persons.notes, stateRegistration: persons.stateRegistration })
        .from(persons)
        .where(eq(persons.id, registered.supplierId));
      assert.equal(person.stateRegistration, '433229250110');
      assert.match(
        person.notes ?? '',
        /Endereço: Estrada Jonas Siaulys, 0, Corumba, Mairiporã\/SP, CEP 07666050/,
      );
      const [contact] = await db
        .select({ phone: personContacts.phone })
        .from(personContacts)
        .where(eq(personContacts.personId, registered.supplierId));
      assert.equal(contact.phone, '1135310437');
    } finally {
      await removeCompany(company.tenantId);
    }
  });

  it('vincula quem já tem o CNPJ sem consultar de novo', async () => {
    const company = await createCompany('Fornecedor existente');
    try {
      const [current] = await db
        .insert(persons)
        .values({
          tenantId: company.tenantId,
          type: 'company',
          name: 'T.c. De Sousa',
          taxId: '33851182000163',
          isSupplier: false,
        })
        .returning({ id: persons.id });
      const registered = await registerInboundSupplier({
        tenantId: company.tenantId,
        supplierTaxId: '33.851.182/0001-63',
        supplierName: 'Outro nome',
        lookup: async () => {
          throw new Error('A consulta não deveria rodar.');
        },
      });
      assert.equal(registered.registration, 'linked');
      assert.equal(registered.supplierId, current.id);
      const [person] = await db
        .select({ isSupplier: persons.isSupplier, name: persons.name })
        .from(persons)
        .where(eq(persons.id, current.id));
      assert.equal(person.isSupplier, true);
      assert.equal(person.name, 'T.c. De Sousa');
    } finally {
      await removeCompany(company.tenantId);
    }
  });
});
