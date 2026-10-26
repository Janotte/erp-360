import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { describe, it } from 'node:test';

import { tenants } from '@erp-360/mod-core';
import {
  dfeDocuments,
  inboundDocumentLines,
  inboundDocuments,
} from '@erp-360/mod-inbound';
import { eq } from 'drizzle-orm';
import forge from 'node-forge';

import { db } from '../src/db/index.ts';
import { discoverInboundDocument } from '../src/modules/inbound/dfe-discover.ts';
import { promoteDfeNotes } from '../src/modules/inbound/dfe-promote.ts';
import { createCompany } from './fixtures.ts';

const key = '42261018371298000101550010000021161300002070';
const emitterTaxId = '18371298000101';
const awareMessage =
  'A ciência foi registrada. O XML completo ainda não está disponível.';

function summary(situation: '1' | '3') {
  return `<resNFe><chNFe>${key}</chNFe><CNPJ>${emitterTaxId}</CNPJ><xNome>Fornecedor</xNome><dhEmi>2026-10-23T10:00:00-03:00</dhEmi><vNF>1358.10</vNF><cSitNFe>${situation}</cSitNFe></resNFe>`;
}

function procNfe(recipientTaxId: string) {
  return [
    '<nfeProc><NFe>',
    `<infNFe Id="NFe${key}">`,
    '<ide><mod>55</mod><serie>1</serie><nNF>2116</nNF><dhEmi>2026-10-23T10:00:00-03:00</dhEmi></ide>',
    `<emit><CNPJ>${emitterTaxId}</CNPJ><xNome>Fornecedor</xNome></emit>`,
    `<dest><CNPJ>${recipientTaxId}</CNPJ></dest>`,
    '<det><prod><cProd>ABC</cProd><xProd>Item</xProd><CFOP>1102</CFOP>',
    '<qCom>1.0000</qCom><uCom>UN</uCom><vUnCom>10.0000</vUnCom><vProd>10.00</vProd></prod></det>',
    '<total><ICMSTot><vNF>10.00</vNF></ICMSTot></total>',
    '</infNFe><Signature>ok</Signature></NFe>',
    `<protNFe><infProt><chNFe>${key}</chNFe><cStat>100</cStat></infProt></protNFe>`,
    '</nfeProc>',
  ].join('');
}

function certificateMaterial(taxId: string) {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const certificate = forge.pki.createCertificate();
  certificate.publicKey = forge.pki.publicKeyFromPem(
    pair.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  );
  certificate.serialNumber = '01';
  certificate.validity.notBefore = new Date('2026-01-01T00:00:00Z');
  certificate.validity.notAfter = new Date('2027-01-01T00:00:00Z');
  const attrs = [{ name: 'commonName', value: 'ERP 360' }];
  certificate.setSubject(attrs);
  certificate.setIssuer(attrs);
  certificate.sign(
    forge.pki.privateKeyFromPem(
      pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    ),
    forge.md.sha256.create(),
  );
  return {
    certificatePem: forge.pki.certificateToPem(certificate),
    privateKeyPem: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    taxId,
  };
}

function sefazDeps(taxId: string) {
  return {
    material: certificateMaterial(taxId),
    emitter: { cnpj: taxId, cUF: '42' },
  };
}

async function tenantCnpj(tenantId: string) {
  const [row] = await db
    .select({ cnpj: tenants.cnpj })
    .from(tenants)
    .where(eq(tenants.id, tenantId));
  return row.cnpj;
}

async function promoted(label: string, situation: '1' | '3') {
  const company = await createCompany(label);
  const cnpj = await tenantCnpj(company.tenantId);
  await promoteDfeNotes(db, company.tenantId, 'homologation', cnpj, [
    { kind: 'summary', accessKey: key, xml: summary(situation) },
  ]);
  const [document] = await db
    .select()
    .from(inboundDocuments)
    .where(eq(inboundDocuments.tenantId, company.tenantId));
  return { company, cnpj, document };
}

describe('descoberta da NF-e na entrada', () => {
  it('recusa a nota cancelada sem consultar a SEFAZ', async () => {
    const { company, document } = await promoted('DF-e cancelada', '3');
    let calls = 0;
    await assert.rejects(
      () =>
        discoverInboundDocument(company.tenantId, document.id, async () => {
          calls += 1;
          return '';
        }),
      /cancelada na SEFAZ/,
    );
    assert.equal(calls, 0);
  });

  it('importa o procNFe arquivado na mesma linha', async () => {
    const { company, cnpj, document } = await promoted('DF-e procNFe', '1');
    await db.insert(dfeDocuments).values({
      tenantId: company.tenantId,
      environment: 'homologation',
      nsu: '000000000000009',
      schemaName: 'procNFe_v4.00.xsd',
      kind: 'nfe',
      accessKey: key,
      xml: procNfe(cnpj),
    });
    let calls = 0;
    await discoverInboundDocument(company.tenantId, document.id, async () => {
      calls += 1;
      return '';
    });
    assert.equal(calls, 0);
    const [row] = await db
      .select({ id: inboundDocuments.id, status: inboundDocuments.status })
      .from(inboundDocuments)
      .where(eq(inboundDocuments.tenantId, company.tenantId));
    assert.equal(row.id, document.id);
    assert.equal(row.status, 'pre_note');
    const lines = await db
      .select({ id: inboundDocumentLines.id })
      .from(inboundDocumentLines)
      .where(eq(inboundDocumentLines.documentId, document.id));
    assert.equal(lines.length, 1);
  });

  it('registra a ciência quando o XML completo ainda não chegou', async () => {
    const { company, document } = await promoted('DF-e ciência', '1');
    const taxId = '18371298000101';
    const deps = sefazDeps(taxId);
    assert.equal(deps.emitter.cnpj, deps.material.taxId);
    assert.equal(deps.emitter.cUF, '42');
    const calls: string[] = [];
    const result = await discoverInboundDocument(
      company.tenantId,
      document.id,
      async (request) => {
        calls.push(request.body);
        if (calls.length === 1) {
          return '<retEnvEvento><cStat>128</cStat><retEvento><infEvento><cStat>135</cStat><xMotivo>Evento registrado</xMotivo></infEvento></retEvento></retEnvEvento>';
        }
        return '<retDistDFeInt><cStat>137</cStat><xMotivo>Nenhum documento localizado</xMotivo></retDistDFeInt>';
      },
      deps,
    );
    assert.equal(calls.length, 2);
    assert.match(calls[0] ?? '', /<tpEvento>210210<\/tpEvento>/);
    assert.match(calls[1] ?? '', new RegExp(`<chNFe>${key}</chNFe>`));
    assert.deepEqual(result, { outcome: 'aware', message: awareMessage });
    const [row] = await db
      .select({
        status: inboundDocuments.status,
        recipientManifestation: inboundDocuments.recipientManifestation,
      })
      .from(inboundDocuments)
      .where(eq(inboundDocuments.id, document.id));
    assert.equal(row.recipientManifestation, 'aware');
    assert.equal(row.status, 'discovered');
  });

  it('não grava o manifesto quando a ciência é rejeitada', async () => {
    const { company, document } = await promoted('DF-e rejeitada', '1');
    await assert.rejects(
      () =>
        discoverInboundDocument(
          company.tenantId,
          document.id,
          async () =>
            '<retEnvEvento><cStat>128</cStat><retEvento><infEvento><cStat>999</cStat><xMotivo>Rejeicao</xMotivo></infEvento></retEvento></retEnvEvento>',
          sefazDeps('18371298000101'),
        ),
      /Rejeicao/,
    );
    const [row] = await db
      .select({
        recipientManifestation: inboundDocuments.recipientManifestation,
      })
      .from(inboundDocuments)
      .where(eq(inboundDocuments.id, document.id));
    assert.equal(row.recipientManifestation, 'none');
  });
});
