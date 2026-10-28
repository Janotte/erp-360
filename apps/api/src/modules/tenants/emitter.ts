import '../../types/fastify.ts';

import { tenants } from '@erp-360/mod-core';
import { cities, states } from '@erp-360/mod-persons';
import {
  emptyToNull,
  isValidCnpj,
  normalizeEmail,
  onlyDigits,
  toTitleCasePtBr,
} from '@erp-360/shared';
import { eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { db } from '../../db/index.ts';

class EmitterError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const crtValues = ['1', '2', '3', '4'] as const;

const emitterBody = z.object({
  name: z.string().trim().min(1).max(60),
  tradeName: z.string().trim().min(1).max(60),
  cnpj: z.string().trim().min(14).max(18),
  stateRegistration: z.string().trim().max(14).nullish(),
  municipalRegistration: z.string().trim().max(15).nullish(),
  cnae: z.string().trim().max(10).nullish(),
  email: z.string().trim().max(80).nullish(),
  phone: z.string().trim().max(20).nullish(),
  mobilePhone: z.string().trim().max(20).nullish(),
  whatsapp: z.string().trim().max(20).nullish(),
  logo: z.string().trim().max(500).nullish(),
  crt: z.enum(crtValues),
  postalCode: z.string().trim().max(9).nullish(),
  street: z.string().trim().max(60).nullish(),
  number: z.string().trim().max(60).nullish(),
  complement: z.string().trim().max(60).nullish(),
  neighborhood: z.string().trim().max(60).nullish(),
  cityId: z.string().uuid(),
});

function requiredName(value: string, label: string) {
  const name = toTitleCasePtBr(value).slice(0, 60);
  if (name.length < 2) {
    throw new EmitterError(400, `${label} deve ter ao menos 2 caracteres.`);
  }
  return name;
}

function optionalText(value: string | null | undefined, max: number) {
  const text = toTitleCasePtBr(emptyToNull(value) ?? '').slice(0, max);
  return text || null;
}

function optionalPlain(value: string | null | undefined, max: number) {
  const text = emptyToNull(value)?.slice(0, max) ?? '';
  return text || null;
}

function normalizeStateRegistration(value: string | null | undefined) {
  const raw = emptyToNull(value);
  if (!raw) return null;
  if (/^isento$/i.test(raw)) return 'ISENTO';
  const digits = onlyDigits(raw);
  if (digits.length < 2 || digits.length > 14) {
    throw new EmitterError(
      400,
      'Inscrição estadual deve ter de 2 a 14 dígitos, ou ISENTO.',
    );
  }
  return digits;
}

function normalizeCnae(value: string | null | undefined) {
  const raw = emptyToNull(value);
  if (!raw) return null;
  const digits = onlyDigits(raw);
  if (digits.length !== 7) {
    throw new EmitterError(400, 'CNAE deve ter 7 dígitos.');
  }
  return digits;
}

function normalizePhone(value: string | null | undefined, label = 'Telefone') {
  const raw = emptyToNull(value);
  if (!raw) return null;
  const digits = onlyDigits(raw);
  if (digits.length < 6 || digits.length > 14) {
    throw new EmitterError(400, `${label} deve ter de 6 a 14 dígitos.`);
  }
  return digits;
}

function normalizeLogo(value: string | null | undefined) {
  const logo = emptyToNull(value);
  if (!logo) return null;
  if (logo.length > 500 || !/^https?:\/\//i.test(logo)) {
    throw new EmitterError(400, 'Logo deve ser uma URL http ou https de até 500 caracteres.');
  }
  return logo;
}

function normalizeEmitterEmail(value: string | null | undefined) {
  const email = normalizeEmail(emptyToNull(value));
  if (!email) return null;
  if (!email.includes('@') || email.length > 80) {
    throw new EmitterError(400, 'E-mail inválido.');
  }
  return email;
}

function normalizePostalCode(value: string | null | undefined) {
  const raw = emptyToNull(value);
  if (!raw) return null;
  const digits = onlyDigits(raw);
  if (digits.length !== 8) {
    throw new EmitterError(400, 'CEP deve ter 8 dígitos.');
  }
  return digits;
}

async function loadEmitter(tenantId: string) {
  const [row] = await db
    .select({
      name: tenants.name,
      tradeName: tenants.tradeName,
      cnpj: tenants.cnpj,
      stateRegistration: tenants.stateRegistration,
      municipalRegistration: tenants.municipalRegistration,
      cnae: tenants.cnae,
      email: tenants.email,
      phone: tenants.phone,
      mobilePhone: tenants.mobilePhone,
      whatsapp: tenants.whatsapp,
      logo: tenants.logo,
      crt: tenants.crt,
      postalCode: tenants.postalCode,
      street: tenants.street,
      number: tenants.number,
      complement: tenants.complement,
      neighborhood: tenants.neighborhood,
      cityId: tenants.cityId,
      cityName: cities.name,
      stateId: cities.stateId,
      stateAbbreviation: states.abbreviation,
    })
    .from(tenants)
    .leftJoin(cities, eq(tenants.cityId, cities.id))
    .leftJoin(states, eq(cities.stateId, states.id))
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!row) throw new EmitterError(404, 'Empresa não encontrada.');
  return row;
}

export const emitterRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('preHandler', fastify.autenticarETenant);

  fastify.get('/emitter', async (request) => {
    return loadEmitter(request.user.tenantId);
  });

  fastify.put('/emitter', { schema: { body: emitterBody } }, async (request) => {
    const tenantId = request.user.tenantId;
    const body = request.body;
    const cnpj = onlyDigits(body.cnpj).slice(0, 14);
    if (!isValidCnpj(cnpj)) {
      throw new EmitterError(400, 'CNPJ inválido.');
    }

    const [city] = await db
      .select({ id: cities.id })
      .from(cities)
      .where(eq(cities.id, body.cityId))
      .limit(1);
    if (!city) throw new EmitterError(400, 'Cidade não encontrada.');

    const [updated] = await db
      .update(tenants)
      .set({
        name: requiredName(body.name, 'Razão social'),
        tradeName: requiredName(body.tradeName, 'Nome fantasia'),
        cnpj,
        stateRegistration: normalizeStateRegistration(body.stateRegistration),
        municipalRegistration: optionalPlain(body.municipalRegistration, 15),
        cnae: normalizeCnae(body.cnae),
        email: normalizeEmitterEmail(body.email),
        phone: normalizePhone(body.phone),
        mobilePhone: normalizePhone(body.mobilePhone, 'Celular'),
        whatsapp: normalizePhone(body.whatsapp, 'WhatsApp'),
        logo: normalizeLogo(body.logo),
        crt: body.crt,
        postalCode: normalizePostalCode(body.postalCode),
        street: optionalText(body.street, 60),
        number: optionalPlain(body.number, 60),
        complement: optionalText(body.complement, 60),
        neighborhood: optionalText(body.neighborhood, 60),
        cityId: body.cityId,
      })
      .where(eq(tenants.id, tenantId))
      .returning({ id: tenants.id });

    if (!updated) throw new EmitterError(404, 'Empresa não encontrada.');
    return loadEmitter(tenantId);
  });
};
