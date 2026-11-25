import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { nfseSettings } from '@erp-360/mod-nfse';
import { eq } from 'drizzle-orm';

import { buildApp } from '../src/app.ts';
import { env } from '../src/config/index.ts';
import { db } from '../src/db/index.ts';
import { createCompany, removeCompany } from './fixtures.ts';

describe('configuração da NFS-e', { concurrency: false }, () => {
  const app = buildApp({ logger: false });
  let token = '';
  let tenantId = '';

  before(async () => {
    assert.equal(
      env.database.name,
      'erp360_test',
      'Os testes só rodam no banco erp360_test.',
    );
    await app.ready();
    const company = await createCompany('Nfse');
    tenantId = company.tenantId;
    token = app.jwt.sign({ userId: company.userId, tenantId });
  });

  after(async () => {
    if (tenantId) {
      await db.delete(nfseSettings).where(eq(nfseSettings.tenantId, tenantId));
      await removeCompany(tenantId);
    }
    await app.close();
  });

  function call(method: 'GET' | 'PUT', payload?: unknown) {
    return app.inject({
      method,
      url: '/settings/nfse',
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
  }

  it('cria a configuração em homologação, sem optante do Simples', async () => {
    const response = await call('GET');
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.json(), {
      environment: 'homologation',
      series: null,
      simplesNacional: 'non_optant',
      simplesAssessment: null,
      ibsCbsAssessment: null,
      specialTaxRegime: 'none',
      issqnTaxation: 'taxable',
    });
  });

  it('grava ME/EPP com os dois regimes e devolve a mesma linha na segunda leitura', async () => {
    const saved = await call('PUT', {
      environment: 'production',
      series: '49001',
      simplesNacional: 'me_epp',
      simplesAssessment: 'federal_by_simples',
      ibsCbsAssessment: 'cbs_by_simples',
      specialTaxRegime: 'none',
      issqnTaxation: 'taxable',
    });
    assert.equal(saved.statusCode, 200, saved.body);
    const again = await call('GET');
    assert.deepEqual(again.json(), saved.json());
  });

  it('recusa MEI com regime especial e mantém a configuração anterior', async () => {
    const refused = await call('PUT', {
      environment: 'homologation',
      series: null,
      simplesNacional: 'mei',
      simplesAssessment: null,
      ibsCbsAssessment: null,
      specialTaxRegime: 'estimate',
      issqnTaxation: 'taxable',
    });
    assert.equal(refused.statusCode, 400);
    assert.equal(refused.json().message, 'MEI não usa regime especial de tributação.');

    const current = await call('GET');
    assert.equal(current.json().simplesNacional, 'me_epp');
    assert.equal(current.json().environment, 'production');
    assert.equal(current.json().series, '49001');
  });
});
