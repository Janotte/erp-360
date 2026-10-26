import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';

import {
  dfeDocuments,
  inboundDocumentFiles,
  inboundDocuments,
} from '@erp-360/mod-inbound';
import { eq } from 'drizzle-orm';

import { db } from '../src/db/index.ts';
import { readDanfe } from '../src/modules/inbound/dfe-danfe.ts';
import {
  listInboundEvents,
  loadInboundDanfe,
  loadManifestationXml,
  recordRecipientManifestation,
} from '../src/modules/inbound/dfe-manifest.ts';
import { createCompany } from './fixtures.ts';

const key = '42261018371298000101550010000021161300002070';

function nfeXml() {
  return `<nfeProc><NFe><infNFe Id="NFe${key}">
    <ide><serie>1</serie><nNF>2116</nNF><dhEmi>2026-10-23T10:00:00-03:00</dhEmi></ide>
    <emit><xNome>Fornecedor</xNome><CNPJ>18371298000101</CNPJ></emit>
    <dest><xNome>Empresa</xNome></dest>
    <det nItem="1"><prod><cProd>ABC</cProd><xProd>Parafuso</xProd><qCom>1.0000</qCom><vUnCom>10.00</vUnCom><vProd>10.00</vProd></prod></det>
    <total><ICMSTot><vNF>10.00</vNF></ICMSTot></total>
  </infNFe></NFe></nfeProc>`;
}

describe('consulta de eventos e DANFE da entrada', () => {
  it('junta o evento local com o distribuído e lê o DANFE do XML da nota', async () => {
    const company = await createCompany('Manifestação entrada');
    const [document] = await db
      .insert(inboundDocuments)
      .values({
        tenantId: company.tenantId,
        number: '2116',
        series: '1',
        issueOn: '2026-10-23',
        totalAmount: 1000,
        accessKey: key,
      })
      .returning({ id: inboundDocuments.id });
    const xml = nfeXml();
    const content = Buffer.from(xml, 'utf8');
    await db.insert(inboundDocumentFiles).values({
      tenantId: company.tenantId,
      documentId: document.id,
      content,
      sha256: createHash('sha256').update(content).digest('hex'),
      fileName: 'nfe.xml',
    });
    await db.insert(dfeDocuments).values({
      tenantId: company.tenantId,
      environment: 'homologation',
      nsu: '000000000000042',
      schemaName: 'procEventoNFe',
      kind: 'event',
      accessKey: key,
      xml: `<procEventoNFe><infEvento><tpEvento>110111</tpEvento><dhEvento>2026-10-24T12:00:00-03:00</dhEvento><nProt>1</nProt></infEvento></procEventoNFe>`,
    });
    await recordRecipientManifestation(
      company.tenantId,
      document.id,
      'aware',
      `<procEventoNFe><infEvento><tpEvento>210210</tpEvento><dhEvento>2026-10-26T14:00:00-03:00</dhEvento><nProt>2</nProt></infEvento></procEventoNFe>`,
    );

    const events = await listInboundEvents(company.tenantId, document.id);
    assert.deepEqual(
      events.map((event) => event.code),
      ['210210', '110111'],
    );
    const manifestation = await loadManifestationXml(company.tenantId, document.id);
    assert.match(manifestation, /<tpEvento>210210<\/tpEvento>/);
    const danfe = await loadInboundDanfe(company.tenantId, document.id);
    assert.equal(danfe.items[0]?.description, 'Parafuso');
    assert.equal(readDanfe(manifestation), null);

    const [row] = await db
      .select({ recipientManifestation: inboundDocuments.recipientManifestation })
      .from(inboundDocuments)
      .where(eq(inboundDocuments.id, document.id));
    assert.equal(row.recipientManifestation, 'aware');
  });

  it('mostra o XML distribuído quando a manifestação ainda não foi gravada aqui', async () => {
    const company = await createCompany('Manifestação distribuída');
    const [document] = await db
      .insert(inboundDocuments)
      .values({
        tenantId: company.tenantId,
        number: '2116',
        series: '1',
        issueOn: '2026-10-23',
        totalAmount: 1000,
        accessKey: key,
      })
      .returning({ id: inboundDocuments.id });
    await db.insert(dfeDocuments).values({
      tenantId: company.tenantId,
      environment: 'homologation',
      nsu: '000000000000043',
      schemaName: 'procEventoNFe',
      kind: 'event',
      accessKey: key,
      xml: `<procEventoNFe><infEvento><tpEvento>210200</tpEvento></infEvento></procEventoNFe>`,
    });
    const xml = await loadManifestationXml(company.tenantId, document.id);
    assert.match(xml, /<tpEvento>210200<\/tpEvento>/);
    await assert.rejects(
      () => loadInboundDanfe(company.tenantId, document.id),
      /XML completo/,
    );
  });
});
