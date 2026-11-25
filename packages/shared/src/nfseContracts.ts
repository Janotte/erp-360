import { z } from 'zod';

export const nfseEnvironments = ['homologation', 'production'] as const;
export type NfseEnvironment = (typeof nfseEnvironments)[number];

export const nfseEnvironmentLabels: Record<NfseEnvironment, string> = {
  homologation: 'Homologação',
  production: 'Produção',
};

/** opSimpNac. */
export const nfseSimplesNacionalOptions = [
  'non_optant',
  'mei',
  'me_epp',
  'pending',
] as const;
export type NfseSimplesNacional = (typeof nfseSimplesNacionalOptions)[number];

export const nfseSimplesNacionalLabels: Record<NfseSimplesNacional, string> = {
  non_optant: 'Não optante',
  mei: 'Optante, MEI',
  me_epp: 'Optante, ME/EPP',
  pending: 'Optante pendente',
};

/** regApTribSN. */
export const nfseSimplesAssessments = [
  'federal_and_municipal',
  'federal_by_simples',
  'outside_simples',
] as const;
export type NfseSimplesAssessment = (typeof nfseSimplesAssessments)[number];

export const nfseSimplesAssessmentLabels: Record<NfseSimplesAssessment, string> = {
  federal_and_municipal: 'Federais e municipal pelo Simples Nacional',
  federal_by_simples: 'Federais pelo Simples Nacional e ISSQN pela NFS-e',
  outside_simples: 'Federais e municipal pela NFS-e',
};

/** regApIBSCBSSN. */
export const nfseIbsCbsAssessments = [
  'both_by_simples',
  'cbs_by_simples',
  'both_regular',
] as const;
export type NfseIbsCbsAssessment = (typeof nfseIbsCbsAssessments)[number];

export const nfseIbsCbsAssessmentLabels: Record<NfseIbsCbsAssessment, string> = {
  both_by_simples: 'IBS e CBS pelo Simples Nacional',
  cbs_by_simples: 'CBS pelo Simples Nacional e IBS pelo regime regular',
  both_regular: 'IBS e CBS pelo regime regular',
};

/** regEspTrib. */
export const nfseSpecialTaxRegimes = [
  'none',
  'cooperative_act',
  'estimate',
  'municipal_microenterprise',
  'notary',
  'self_employed',
  'professionals_society',
  'other',
] as const;
export type NfseSpecialTaxRegime = (typeof nfseSpecialTaxRegimes)[number];

export const nfseSpecialTaxRegimeLabels: Record<NfseSpecialTaxRegime, string> = {
  none: 'Nenhum',
  cooperative_act: 'Ato cooperado (cooperativa)',
  estimate: 'Estimativa',
  municipal_microenterprise: 'Microempresa municipal',
  notary: 'Notário ou registrador',
  self_employed: 'Profissional autônomo',
  professionals_society: 'Sociedade de profissionais',
  other: 'Outros',
};

/** tribISSQN. */
export const nfseIssqnTaxations = [
  'taxable',
  'immunity',
  'export',
  'non_incidence',
] as const;
export type NfseIssqnTaxation = (typeof nfseIssqnTaxations)[number];

export const nfseIssqnTaxationLabels: Record<NfseIssqnTaxation, string> = {
  taxable: 'Operação tributável',
  immunity: 'Imunidade',
  export: 'Exportação de serviço',
  non_incidence: 'Não incidência',
};

/** Série da DPS na faixa de aplicativo próprio. 00001 a 49999. */
export function normalizeNfseSeries(value: string | null | undefined): string | null {
  const raw = (value ?? '').trim();
  if (!raw) return null;
  if (!/^[0-9]{1,5}$/.test(raw)) return null;
  const number = Number(raw);
  if (!Number.isInteger(number) || number < 1 || number > 49999) return null;
  return String(number).padStart(5, '0');
}

export const nfseSettingsSchema = z.object({
  environment: z.enum(nfseEnvironments),
  series: z.string().max(5).nullable(),
  simplesNacional: z.enum(nfseSimplesNacionalOptions),
  simplesAssessment: z.enum(nfseSimplesAssessments).nullable(),
  ibsCbsAssessment: z.enum(nfseIbsCbsAssessments).nullable(),
  specialTaxRegime: z.enum(nfseSpecialTaxRegimes),
  issqnTaxation: z.enum(nfseIssqnTaxations),
});

export type NfseSettings = z.infer<typeof nfseSettingsSchema>;

export function nfseAssessmentApplies(simplesNacional: NfseSimplesNacional) {
  return simplesNacional === 'me_epp' || simplesNacional === 'pending';
}

export function nfseSpecialRegimeLocked(settings: NfseSettings) {
  if (settings.simplesNacional === 'mei') return true;
  if (
    settings.simplesNacional === 'me_epp' &&
    settings.simplesAssessment === 'federal_and_municipal'
  ) {
    return true;
  }
  return settings.issqnTaxation !== 'taxable';
}

const federalAssessmentMessage =
  'O regime de apuração dos tributos federais e do ISS só vale para ME/EPP ou optante pendente.';
const federalAssessmentRequired =
  'Informe o regime de apuração dos tributos federais e do ISS.';
const ibsCbsAssessmentMessage =
  'O regime de apuração do IBS e da CBS só vale para ME/EPP ou optante pendente.';
const ibsCbsAssessmentRequired = 'Informe o regime de apuração do IBS e da CBS.';

/** Recusa a combinação que o padrão nacional rejeita na DPS. */
export function nfseSettingsMessage(settings: NfseSettings): string | null {
  const series = settings.series?.trim() ?? '';
  if (series && normalizeNfseSeries(series) == null) {
    return 'A série da NFS-e vai de 00001 a 49999.';
  }
  const applies = nfseAssessmentApplies(settings.simplesNacional);
  if (applies && settings.simplesAssessment == null) return federalAssessmentRequired;
  if (!applies && settings.simplesAssessment != null) return federalAssessmentMessage;
  if (applies && settings.ibsCbsAssessment == null) return ibsCbsAssessmentRequired;
  if (!applies && settings.ibsCbsAssessment != null) return ibsCbsAssessmentMessage;
  if (settings.specialTaxRegime === 'none') return null;
  if (settings.simplesNacional === 'mei') {
    return 'MEI não usa regime especial de tributação.';
  }
  if (
    settings.simplesNacional === 'me_epp' &&
    settings.simplesAssessment === 'federal_and_municipal'
  ) {
    return 'ME/EPP com tributos pelo Simples Nacional não usa regime especial.';
  }
  if (settings.issqnTaxation !== 'taxable') {
    return 'Imunidade, exportação e não incidência não usam regime especial de tributação.';
  }
  return null;
}
