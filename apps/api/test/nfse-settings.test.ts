import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { type NfseSettings, nfseSettingsMessage } from '@erp-360/shared';

function settings(patch: Partial<NfseSettings> = {}): NfseSettings {
  return {
    environment: 'homologation',
    simplesNacional: 'non_optant',
    simplesAssessment: null,
    ibsCbsAssessment: null,
    specialTaxRegime: 'none',
    issqnTaxation: 'taxable',
    ...patch,
  };
}

describe('configuração do prestador da NFS-e', () => {
  it('aceita não optante sem regime de apuração', () => {
    assert.equal(nfseSettingsMessage(settings()), null);
  });

  it('aceita MEI sem regime de apuração e sem regime especial', () => {
    assert.equal(nfseSettingsMessage(settings({ simplesNacional: 'mei' })), null);
  });

  it('recusa regime de apuração fora de ME/EPP e optante pendente', () => {
    assert.equal(
      nfseSettingsMessage(settings({ simplesAssessment: 'outside_simples' })),
      'O regime de apuração dos tributos federais e do ISS só vale para ME/EPP ou optante pendente.',
    );
    assert.equal(
      nfseSettingsMessage(
        settings({ simplesNacional: 'mei', ibsCbsAssessment: 'both_regular' }),
      ),
      'O regime de apuração do IBS e da CBS só vale para ME/EPP ou optante pendente.',
    );
  });

  it('exige os dois regimes de apuração para ME/EPP e optante pendente', () => {
    assert.equal(
      nfseSettingsMessage(settings({ simplesNacional: 'me_epp' })),
      'Informe o regime de apuração dos tributos federais e do ISS.',
    );
    assert.equal(
      nfseSettingsMessage(
        settings({
          simplesNacional: 'pending',
          simplesAssessment: 'federal_by_simples',
        }),
      ),
      'Informe o regime de apuração do IBS e da CBS.',
    );
  });

  it('aceita ME/EPP e optante pendente com os dois regimes', () => {
    assert.equal(
      nfseSettingsMessage(
        settings({
          simplesNacional: 'me_epp',
          simplesAssessment: 'outside_simples',
          ibsCbsAssessment: 'both_regular',
          specialTaxRegime: 'estimate',
        }),
      ),
      null,
    );
    assert.equal(
      nfseSettingsMessage(
        settings({
          simplesNacional: 'pending',
          simplesAssessment: 'federal_and_municipal',
          ibsCbsAssessment: 'both_by_simples',
          specialTaxRegime: 'professionals_society',
        }),
      ),
      null,
    );
  });

  it('recusa regime especial no MEI, no Simples completo e fora da tributação', () => {
    assert.equal(
      nfseSettingsMessage(
        settings({ simplesNacional: 'mei', specialTaxRegime: 'self_employed' }),
      ),
      'MEI não usa regime especial de tributação.',
    );
    assert.equal(
      nfseSettingsMessage(
        settings({
          simplesNacional: 'me_epp',
          simplesAssessment: 'federal_and_municipal',
          ibsCbsAssessment: 'both_by_simples',
          specialTaxRegime: 'estimate',
        }),
      ),
      'ME/EPP com tributos pelo Simples Nacional não usa regime especial.',
    );
    assert.equal(
      nfseSettingsMessage(
        settings({ issqnTaxation: 'immunity', specialTaxRegime: 'other' }),
      ),
      'Imunidade, exportação e não incidência não usam regime especial de tributação.',
    );
    assert.equal(nfseSettingsMessage(settings({ issqnTaxation: 'export' })), null);
  });
});
