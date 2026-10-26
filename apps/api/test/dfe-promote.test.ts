import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { tenants } from '@erp-360/mod-core';
import { inboundDocuments } from '@erp-360/mod-inbound';
import { eq } from 'drizzle-orm';

import { db } from '../src/db/index.ts';
import { promoteDfeNotes } from '../src/modules/inbound/dfe-promote.ts';
import { listInboundDocuments } from '../src/modules/inbound/inbound.ts';
import { createCompany } from './fixtures.ts';

const key = '42261018371298000101550010000021161300002070';
const summary = `<resNFe><chNFe>${key}</chNFe><CNPJ>18371298000101</CNPJ><xNome>Fornecedor</xNome><dhEmi>2026-10-23T10:00:00-03:00</dhEmi><vNF>1358.10</vNF><cSitNFe>1</cSitNFe></resNFe>`;

async function tenantCnpj(tenantId: string) {
  const [row] = await db
    .select({ cnpj: tenants.cnpj })
    .from(tenants)
    .where(eq(tenants.id, tenantId));
  return row.cnpj;
}

describe('promoção do DF-e para a entrada', () => {
  it('cria a descoberta e não duplica a chave', async () => {
    const company = await createCompany('DF-e descoberta');
    const cnpj = await tenantCnpj(company.tenantId);
    assert.notEqual(cnpj, '18371298000101');
    await promoteDfeNotes(db, company.tenantId, 'homologation', cnpj, [
      { kind: 'summary', accessKey: key, xml: summary },
    ]);
    await promoteDfeNotes(db, company.tenantId, 'homologation', cnpj, [
      { kind: 'summary', accessKey: key, xml: summary },
    ]);
    const rows = await db
      .select()
      .from(inboundDocuments)
      .where(eq(inboundDocuments.tenantId, company.tenantId));
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.status, 'discovered');
    assert.equal(rows[0]?.number, '2116');
    assert.equal(rows[0]?.series, '1');
    assert.equal(rows[0]?.totalAmount, 135810);
    assert.equal(rows[0]?.recipientManifestation, 'none');
  });

  it('ignora nota da própria empresa e evento sem nota', async () => {
    const company = await createCompany('DF-e própria');
    const cnpj = await tenantCnpj(company.tenantId);
    const ownKey = `42${key.slice(2, 6)}${cnpj}${key.slice(20)}`.slice(0, 44);
    await promoteDfeNotes(db, company.tenantId, 'homologation', cnpj, [
      {
        kind: 'summary',
        accessKey: ownKey,
        xml: summary.replaceAll('18371298000101', cnpj).replaceAll(key, ownKey),
      },
      {
        kind: 'event',
        accessKey: key,
        xml: `<procEventoNFe><infEvento><chNFe>${key}</chNFe><tpEvento>210210</tpEvento><dhEvento>2026-10-26T14:00:00-03:00</dhEvento></infEvento></procEventoNFe>`,
      },
    ]);
    const rows = await db
      .select({ id: inboundDocuments.id })
      .from(inboundDocuments)
      .where(eq(inboundDocuments.tenantId, company.tenantId));
    assert.equal(rows.length, 0);
  });

  it('grava a ciência na nota existente e não rebaixa quem já saiu de descoberta', async () => {
    const company = await createCompany('DF-e manifesto');
    const cnpj = await tenantCnpj(company.tenantId);
    await promoteDfeNotes(db, company.tenantId, 'homologation', cnpj, [
      { kind: 'summary', accessKey: key, xml: summary },
    ]);
    await db
      .update(inboundDocuments)
      .set({ status: 'pre_note' })
      .where(eq(inboundDocuments.tenantId, company.tenantId));
    await promoteDfeNotes(db, company.tenantId, 'homologation', cnpj, [
      {
        kind: 'event',
        accessKey: key,
        xml: `<procEventoNFe><infEvento><chNFe>${key}</chNFe><tpEvento>210210</tpEvento><dhEvento>2026-10-26T15:00:00-03:00</dhEvento></infEvento></procEventoNFe>`,
      },
    ]);
    const [row] = await db
      .select({
        status: inboundDocuments.status,
        recipientManifestation: inboundDocuments.recipientManifestation,
      })
      .from(inboundDocuments)
      .where(eq(inboundDocuments.tenantId, company.tenantId));
    assert.equal(row.status, 'pre_note');
    assert.equal(row.recipientManifestation, 'aware');
  });

  it('não reautoriza a nota cancelada quando o XML não traz a situação', async () => {
    const company = await createCompany('DF-e situação');
    const cnpj = await tenantCnpj(company.tenantId);
    const cancelled = `<resNFe><chNFe>${key}</chNFe><CNPJ>18371298000101</CNPJ><xNome>Fornecedor</xNome><dhEmi>2026-10-23T10:00:00-03:00</dhEmi><vNF>1358.10</vNF><cSitNFe>3</cSitNFe></resNFe>`;
    const withoutSituation = `<resNFe><chNFe>${key}</chNFe><CNPJ>18371298000101</CNPJ><xNome>Fornecedor</xNome><dhEmi>2026-10-23T10:00:00-03:00</dhEmi><vNF>1358.10</vNF></resNFe>`;
    await promoteDfeNotes(db, company.tenantId, 'homologation', cnpj, [
      { kind: 'summary', accessKey: key, xml: cancelled },
    ]);
    await promoteDfeNotes(db, company.tenantId, 'homologation', cnpj, [
      { kind: 'summary', accessKey: key, xml: withoutSituation },
    ]);
    const [row] = await db
      .select({
        status: inboundDocuments.status,
        authorizationStatus: inboundDocuments.authorizationStatus,
      })
      .from(inboundDocuments)
      .where(eq(inboundDocuments.tenantId, company.tenantId));
    assert.equal(row.status, 'discovered');
    assert.equal(row.authorizationStatus, 'cancelled');
  });

  it('encontra a nota pelo número, pela chave e pelo emitente', async () => {
    const company = await createCompany('DF-e filtro');
    const cnpj = await tenantCnpj(company.tenantId);
    await promoteDfeNotes(db, company.tenantId, 'homologation', cnpj, [
      { kind: 'summary', accessKey: key, xml: summary },
    ]);
    const byNumber = await listInboundDocuments(company.tenantId, { search: '2116' });
    const byKey = await listInboundDocuments(company.tenantId, { search: key });
    const byName = await listInboundDocuments(company.tenantId, { search: 'Fornecedor' });
    const byStatus = await listInboundDocuments(company.tenantId, { status: 'posted' });
    assert.equal(byNumber.length, 1);
    assert.equal(byKey.length, 1);
    assert.equal(byName[0]?.supplierName, 'Fornecedor');
    assert.equal(byStatus.length, 0);
  });
});
