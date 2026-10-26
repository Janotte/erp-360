import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  discoveryAction,
  readDfeNote,
  readInboundEvent,
} from '../src/modules/inbound/dfe-note.ts';

const key = '42261018371298000101550010000021161300002070';

describe('nota descoberta a partir do DF-e', () => {
  it('lê número, série, emitente, valor e situação do resumo', () => {
    const note = readDfeNote(
      'summary',
      `<resNFe><chNFe>${key}</chNFe><CNPJ>18371298000101</CNPJ><xNome>Fornecedor</xNome><dhEmi>2026-10-23T10:00:00-03:00</dhEmi><vNF>1358.10</vNF><cSitNFe>1</cSitNFe></resNFe>`,
    );
    assert.deepEqual(note, {
      role: 'nfe',
      accessKey: key,
      emitterTaxId: '18371298000101',
      emitterName: 'Fornecedor',
      issueOn: '2026-10-23',
      number: '2116',
      series: '1',
      amount: 135810,
      authorizationStatus: 'authorized',
      manifestation: null,
      eventAt: null,
    });
  });

  it('lê cancelada, denegada e o evento de ciência', () => {
    assert.equal(
      readDfeNote(
        'summary',
        `<resNFe><chNFe>${key}</chNFe><CNPJ>18371298000101</CNPJ><cSitNFe>3</cSitNFe></resNFe>`,
      ).authorizationStatus,
      'cancelled',
    );
    assert.equal(
      readDfeNote(
        'summary',
        `<resNFe><chNFe>${key}</chNFe><CNPJ>18371298000101</CNPJ><cSitNFe>2</cSitNFe></resNFe>`,
      ).authorizationStatus,
      'denied',
    );
    const event = readDfeNote(
      'event',
      `<procEventoNFe><infEvento><chNFe>${key}</chNFe><tpEvento>210210</tpEvento><dhEvento>2026-10-26T14:00:00-03:00</dhEvento><nSeqEvento>1</nSeqEvento></infEvento></procEventoNFe>`,
    );
    assert.equal(event.role, 'event');
    assert.equal(event.manifestation, 'aware');
    assert.equal(event.eventAt, '2026-10-26T14:00:00-03:00');
  });

  it('escolhe a confirmação do duplo clique', () => {
    assert.equal(
      discoveryAction({
        status: 'discovered',
        authorizationStatus: 'cancelled',
        recipientManifestation: 'none',
        hasCompleteXml: false,
      }).kind,
      'blocked',
    );
    assert.equal(
      discoveryAction({
        status: 'discovered',
        authorizationStatus: 'authorized',
        recipientManifestation: 'none',
        hasCompleteXml: true,
      }).kind,
      'import',
    );
    assert.equal(
      discoveryAction({
        status: 'discovered',
        authorizationStatus: 'authorized',
        recipientManifestation: 'none',
        hasCompleteXml: false,
      }).kind,
      'manifest',
    );
    assert.equal(
      discoveryAction({
        status: 'discovered',
        authorizationStatus: 'authorized',
        recipientManifestation: 'aware',
        hasCompleteXml: false,
      }).kind,
      'download',
    );
    assert.equal(
      discoveryAction({
        status: 'pre_note',
        authorizationStatus: 'authorized',
        recipientManifestation: 'none',
        hasCompleteXml: true,
      }).kind,
      'none',
    );
  });

  it('nomeia o evento de manifestação para a consulta', () => {
    const event = readInboundEvent(
      `<procEventoNFe><evento><infEvento><tpEvento>210240</tpEvento><dhEvento>2026-10-26T14:00:00-03:00</dhEvento></infEvento></evento><retEvento><infEvento><cStat>135</cStat><xMotivo>Evento registrado</xMotivo><nProt>123</nProt></infEvento></retEvento></procEventoNFe>`,
    );
    assert.deepEqual(event, {
      code: '210240',
      label: 'Operação não realizada',
      at: '2026-10-26T14:00:00-03:00',
      protocol: '123',
      status: '135',
      reason: 'Evento registrado',
    });
    assert.equal(readInboundEvent('<resNFe></resNFe>'), null);
  });
});
