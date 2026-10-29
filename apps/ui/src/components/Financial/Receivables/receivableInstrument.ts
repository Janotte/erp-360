export const instrumentFields = [
  'financialInstitution',
  'cardBrand',
  'transactionAuthorization',
  'bearerName',
  'bankSlipOurNumber',
  'barcode',
] as const;

export type InstrumentField = (typeof instrumentFields)[number];

export interface InstrumentProfile {
  fields: InstrumentField[];
  cardBrandRequiredWhenNotIntegrated: boolean;
  requiresPaymentMethod: boolean;
}

const emptyProfile: InstrumentProfile = {
  fields: [],
  cardBrandRequiredWhenNotIntegrated: false,
  requiresPaymentMethod: false,
};

const institutionOnly: InstrumentProfile = {
  ...emptyProfile,
  fields: ['financialInstitution'],
};

const cardProfile: InstrumentProfile = {
  fields: ['financialInstitution', 'cardBrand', 'transactionAuthorization'],
  cardBrandRequiredWhenNotIntegrated: true,
  requiresPaymentMethod: false,
};

const boletoProfile: InstrumentProfile = {
  ...emptyProfile,
  fields: ['financialInstitution', 'bearerName', 'bankSlipOurNumber', 'barcode'],
};

const electronicProfile: InstrumentProfile = {
  ...emptyProfile,
  fields: ['financialInstitution', 'transactionAuthorization'],
};

const profiles: Record<string, InstrumentProfile> = {
  '02': institutionOnly,
  '03': cardProfile,
  '04': cardProfile,
  '15': boletoProfile,
  '16': institutionOnly,
  '17': electronicProfile,
  '18': institutionOnly,
  '20': electronicProfile,
  '23': electronicProfile,
  '24': electronicProfile,
  '99': { ...emptyProfile, requiresPaymentMethod: true },
};

export function instrumentProfile(code: string | undefined): InstrumentProfile {
  if (!code) return emptyProfile;
  return profiles[code] ?? emptyProfile;
}

export function visibleInstrumentFields(input: {
  code: string | undefined;
  meansUnchanged: boolean;
  retained: Partial<Record<InstrumentField, string | null | undefined>>;
}): InstrumentField[] {
  const visible = new Set<InstrumentField>(instrumentProfile(input.code).fields);
  if (input.meansUnchanged) {
    for (const field of instrumentFields) {
      const value = input.retained[field];
      if (typeof value === 'string' && value.trim() !== '') visible.add(field);
    }
  }
  return instrumentFields.filter((field) => visible.has(field));
}
