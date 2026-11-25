import { tenants } from '@erp-360/mod-core';
import { sql } from 'drizzle-orm';
import { check, pgEnum, pgTable, uuid, varchar } from 'drizzle-orm/pg-core';

/** Ambiente da NFS-e nacional. Independente do ambiente da NF-e. */
export const nfseEnvironmentEnum = pgEnum('nfse_environment', [
  'homologation',
  'production',
]);

/** opSimpNac. 1 não optante, 2 MEI, 3 ME/EPP, 4 optante pendente. */
export const nfseSimplesNacionalEnum = pgEnum('nfse_simples_nacional', [
  'non_optant',
  'mei',
  'me_epp',
  'pending',
]);

/** regApTribSN. Tributos federais e ISSQN. */
export const nfseSimplesAssessmentEnum = pgEnum('nfse_simples_assessment', [
  'federal_and_municipal',
  'federal_by_simples',
  'outside_simples',
]);

/** regApIBSCBSSN. Apuração do IBS e da CBS no Simples Nacional. */
export const nfseIbsCbsAssessmentEnum = pgEnum('nfse_ibs_cbs_assessment', [
  'both_by_simples',
  'cbs_by_simples',
  'both_regular',
]);

/** regEspTrib. 0 nenhum, 1 a 6 e 9 outros. */
export const nfseSpecialTaxRegimeEnum = pgEnum('nfse_special_tax_regime', [
  'none',
  'cooperative_act',
  'estimate',
  'municipal_microenterprise',
  'notary',
  'self_employed',
  'professionals_society',
  'other',
]);

/** tribISSQN. Padrão que a nota copia. */
export const nfseIssqnTaxationEnum = pgEnum('nfse_issqn_taxation', [
  'taxable',
  'immunity',
  'export',
  'non_incidence',
]);

export const nfseSettings = pgTable(
  'nfse_settings',
  {
    tenantId: uuid('tenant_id')
      .primaryKey()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    environment: nfseEnvironmentEnum('environment').default('homologation').notNull(),
    /** Série da DPS, 00001 a 49999. Nula até a empresa escolher uma faixa própria. */
    series: varchar('series', { length: 5 }),
    simplesNacional: nfseSimplesNacionalEnum('simples_nacional')
      .default('non_optant')
      .notNull(),
    /** Nulo para não optante e MEI. Obrigatório para ME/EPP e optante pendente. */
    simplesAssessment: nfseSimplesAssessmentEnum('simples_assessment'),
    /** Nulo para não optante e MEI. Obrigatório para ME/EPP e optante pendente. */
    ibsCbsAssessment: nfseIbsCbsAssessmentEnum('ibs_cbs_assessment'),
    specialTaxRegime: nfseSpecialTaxRegimeEnum('special_tax_regime')
      .default('none')
      .notNull(),
    issqnTaxation: nfseIssqnTaxationEnum('issqn_taxation').default('taxable').notNull(),
  },
  (table) => [
    check(
      'nfse_settings_series_check',
      sql`${table.series} is null or (
        ${table.series} ~ '^[0-9]{5}$'
        and ${table.series}::integer between 1 and 49999
      )`,
    ),
    check(
      'nfse_settings_simples_assessment_check',
      sql`(
        (${table.simplesNacional} in ('me_epp', 'pending') and ${table.simplesAssessment} is not null)
        or (${table.simplesNacional} in ('non_optant', 'mei') and ${table.simplesAssessment} is null)
      )`,
    ),
    check(
      'nfse_settings_ibs_cbs_assessment_check',
      sql`(
        (${table.simplesNacional} in ('me_epp', 'pending') and ${table.ibsCbsAssessment} is not null)
        or (${table.simplesNacional} in ('non_optant', 'mei') and ${table.ibsCbsAssessment} is null)
      )`,
    ),
    check(
      'nfse_settings_special_regime_check',
      sql`(
        ${table.specialTaxRegime} = 'none'
        or (
          ${table.simplesNacional} <> 'mei'
          and not (
            ${table.simplesNacional} = 'me_epp'
            and ${table.simplesAssessment} = 'federal_and_municipal'
          )
          and ${table.issqnTaxation} = 'taxable'
        )
      )`,
    ),
  ],
);
