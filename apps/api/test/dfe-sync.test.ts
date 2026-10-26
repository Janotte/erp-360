import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { gzipSync } from 'node:zlib';

import { dfeCursors, dfeDocuments } from '@erp-360/mod-inbound';
import { and, eq } from 'drizzle-orm';

import { db } from '../src/db/index.ts';
import {
  collectDfePages,
  dfeBlockedUntil,
  runDfeSync,
  syncTenantDfe,
} from '../src/modules/inbound/dfe-sync.ts';
import { createCompany } from './fixtures.ts';

const cnpj = '18371298000101';
const now = new Date('2026-10-26T15:00:00.000Z');
const queriedAt = new Date('2026-10-26T14:30:00.000Z');

function soap(ultNsu: string, maxNsu: string, cStat: string, xml?: string) {
  const doc = xml
    ? `<loteDistDFeInt><docZip NSU="${ultNsu}" schema="resNFe_v1.01.xsd">${gzipSync(Buffer.from(xml)).toString('base64')}</docZip></loteDistDFeInt>`
    : '';
  return `<retDistDFeInt><cStat>${cStat}</cStat><xMotivo>ok</xMotivo><ultNSU>${ultNsu}</ultNSU><maxNSU>${maxNsu}</maxNSU>${doc}</retDistDFeInt>`;
}

describe('espera da distribuição de DF-e', () => {
  const caughtUp = {
    ultNsu: '000000000000020',
    maxNsu: '000000000000020',
    lastStatus: '137',
    queriedAt,
  };

  it('libera a primeira consulta e continua enquanto houver NSU à frente', () => {
    assert.equal(
      dfeBlockedUntil(
        {
          ultNsu: '000000000000000',
          maxNsu: '000000000000000',
          lastStatus: null,
          queriedAt: null,
        },
        now,
        'sync',
      ),
      null,
    );
    assert.equal(
      dfeBlockedUntil(
        {
          ultNsu: '000000000000010',
          maxNsu: '000000000000020',
          lastStatus: '138',
          queriedAt,
        },
        now,
        'sync',
      ),
      null,
    );
  });

  it('espera uma hora quando o cursor já alcançou o máximo', () => {
    const until = dfeBlockedUntil(caughtUp, now, 'sync');
    assert.equal(until?.toISOString(), '2026-10-26T15:30:00.000Z');
    assert.equal(dfeBlockedUntil(caughtUp, now, 'lookup'), null);
  });

  it('bloqueia qualquer consulta por uma hora depois do consumo indevido', () => {
    const blocked = { ...caughtUp, ultNsu: '000000000000010', lastStatus: '656' };
    assert.equal(
      dfeBlockedUntil(blocked, now, 'sync')?.toISOString(),
      '2026-10-26T15:30:00.000Z',
    );
    assert.equal(
      dfeBlockedUntil(blocked, now, 'lookup')?.toISOString(),
      '2026-10-26T15:30:00.000Z',
    );
    assert.equal(
      dfeBlockedUntil(blocked, new Date('2026-10-26T15:30:00.000Z'), 'sync'),
      null,
    );
  });
});

describe('páginas da distribuição de DF-e', () => {
  it('avança o NSU até alcançar o máximo', async () => {
    const sent: string[] = [];
    const result = await collectDfePages({
      cUF: '42',
      cnpj,
      environment: 'homologation',
      ultNsu: '000000000000000',
      fetch: async (request) => {
        sent.push(request.body);
        const ultNsu = request.body.includes('>000000000000000<')
          ? '000000000000002'
          : '000000000000004';
        return soap(ultNsu, '000000000000004', '138');
      },
    });
    assert.equal(result.stopped, 'caught-up');
    assert.equal(result.pages.length, 2);
    assert.match(sent[1], />000000000000002</);
  });

  it('para no bloqueio 656 e quando a resposta não avança', async () => {
    const blocked = await collectDfePages({
      cUF: '42',
      cnpj,
      environment: 'production',
      ultNsu: '000000000000010',
      fetch: async () => soap('000000000000010', '000000000000040', '656'),
    });
    assert.equal(blocked.stopped, 'blocked');
    assert.equal(blocked.pages.length, 1);

    const stalled = await collectDfePages({
      cUF: '42',
      cnpj,
      environment: 'production',
      ultNsu: '000000000000010',
      fetch: async () => soap('000000000000010', '000000000000040', '137'),
    });
    assert.equal(stalled.stopped, 'stalled');
    assert.equal(stalled.pages.length, 1);
  });
});

describe('gravação da busca de DF-e', () => {
  it('grava o lote e não consulta de novo dentro da hora', async () => {
    const company = await createCompany('Busca DF-e');
    let calls = 0;
    const first = await runDfeSync({
      tenantId: company.tenantId,
      environment: 'homologation',
      cnpj,
      cUF: '42',
      query: { kind: 'cursor' },
      now,
      fetch: async () => {
        calls += 1;
        return soap(
          '000000000000001',
          '000000000000001',
          '138',
          '<resNFe><chNFe>42261018371298000101550010000021161300002070</chNFe></resNFe>',
        );
      },
    });
    assert.equal(calls, 1);
    assert.equal(first.received, 1);
    assert.equal(first.blockedUntil, null);
    assert.equal(first.ultNsu, '000000000000001');

    const second = await runDfeSync({
      tenantId: company.tenantId,
      environment: 'homologation',
      cnpj,
      cUF: '42',
      query: { kind: 'cursor' },
      now: new Date('2026-10-26T15:10:00.000Z'),
      fetch: async () => {
        calls += 1;
        return soap('000000000000001', '000000000000001', '137');
      },
    });
    assert.equal(calls, 1);
    assert.equal(second.received, 0);
    assert.equal(second.blockedUntil, '2026-10-26T16:00:00.000Z');

    const [stored] = await db
      .select({ accessKey: dfeDocuments.accessKey })
      .from(dfeDocuments)
      .where(
        and(
          eq(dfeDocuments.tenantId, company.tenantId),
          eq(dfeDocuments.environment, 'homologation'),
        ),
      );
    assert.equal(stored.accessKey, '42261018371298000101550010000021161300002070');
    const [cursor] = await db
      .select({ ultNsu: dfeCursors.ultNsu })
      .from(dfeCursors)
      .where(eq(dfeCursors.tenantId, company.tenantId));
    assert.equal(cursor.ultNsu, '000000000000001');
  });

  it('exige o certificado do ambiente antes de consultar a SEFAZ', async () => {
    const company = await createCompany('DF-e sem certificado');
    await assert.rejects(
      () => syncTenantDfe(company.tenantId, { kind: 'cursor' }),
      /certificado A1/,
    );
  });
});
