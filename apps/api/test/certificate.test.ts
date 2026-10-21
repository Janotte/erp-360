import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { before, describe, it } from 'node:test';

import { isValidCnpj } from '@erp-360/shared';
import forge from 'node-forge';

import { decryptPassword, encryptPassword } from '../src/modules/certificates/cipher.ts';
import { CertificateError } from '../src/modules/certificates/errors.ts';
import { extractCertificateTaxId, readPfx, readPfxMaterial } from '../src/modules/certificates/pfx.ts';
import { subjectStateAbbreviation } from '../src/modules/certificates/sefaz.ts';
import {
  certificateDaysLeft,
  certificateIsCurrent,
  certificateNotice,
} from '../src/modules/certificates/status.ts';

const cnpj = '11222333000181';
const password = 'senha-teste';

function buildPfx(options: {
  commonName: string;
  notBefore: Date;
  notAfter: Date;
  passphrase?: string;
  state?: string;
}) {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const certificate = forge.pki.createCertificate();
  certificate.publicKey = keys.publicKey;
  certificate.serialNumber = '0A1B';
  certificate.validity.notBefore = options.notBefore;
  certificate.validity.notAfter = options.notAfter;
  const attributes = [
    { name: 'commonName', value: options.commonName },
    { name: 'organizationName', value: 'ICP-Brasil' },
    ...(options.state ? [{ shortName: 'ST', value: options.state }] : []),
  ];
  certificate.setSubject(attributes);
  certificate.setIssuer(attributes);
  certificate.sign(keys.privateKey);
  const asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [certificate], options.passphrase ?? password);
  return Buffer.from(forge.asn1.toDer(asn1).getBytes(), 'binary');
}

describe('certificado digital', () => {
  let currentPfx: Buffer;

  before(() => {
    assert.equal(isValidCnpj(cnpj), true);
    const notBefore = new Date('2026-01-01T00:00:00Z');
    const notAfter = new Date('2027-01-01T00:00:00Z');
    currentPfx = buildPfx({
      commonName: `EMPRESA TESTE:${cnpj}`,
      notBefore,
      notAfter,
    });
  });

  it('avisa a partir de 30 dias e marca o certificado vencido', () => {
    const validUntil = new Date('2026-11-20T15:00:00Z');
    assert.equal(certificateDaysLeft(validUntil, '2026-10-21'), 30);
    assert.deepEqual(certificateNotice(validUntil, '2026-10-21'), {
      daysLeft: 30,
      expired: false,
    });
    assert.equal(certificateNotice(validUntil, '2026-10-20'), null);
    assert.deepEqual(certificateNotice(new Date('2026-10-01T12:00:00Z'), '2026-10-21'), {
      daysLeft: -20,
      expired: true,
    });
    assert.equal(certificateDaysLeft(validUntil, '2026-11-20'), 0);
  });

  it('considera vigente só dentro do intervalo', () => {
    const from = new Date('2026-01-01T00:00:00Z');
    const until = new Date('2026-12-31T00:00:00Z');
    assert.equal(certificateIsCurrent(from, until, new Date('2026-06-01T00:00:00Z')), true);
    assert.equal(certificateIsCurrent(from, until, new Date('2025-12-31T00:00:00Z')), false);
    assert.equal(certificateIsCurrent(from, until, new Date('2027-01-01T00:00:00Z')), false);
  });

  it('cifra a senha e recupera o mesmo texto', () => {
    const secret = 'segredo-de-teste-com-32-caracteres';
    const cipher = encryptPassword(password, secret);
    assert.equal(decryptPassword(cipher, secret), password);
    assert.notEqual(cipher.toString('utf8'), password);
  });

  it('lê o CNPJ do nome e do OID da ICP-Brasil', () => {
    const oid = Buffer.from([0x60, 0x4c, 0x01, 0x03, 0x03]);
    const der = Buffer.concat([Buffer.from('prefixo'), oid, Buffer.from(cnpj)]);
    assert.equal(extractCertificateTaxId(null, der), cnpj);
    assert.equal(extractCertificateTaxId(`EMPRESA:${cnpj}`, Buffer.alloc(0)), cnpj);
    assert.equal(extractCertificateTaxId('SEM DOCUMENTO', Buffer.alloc(0)), null);
  });

  it('abre o A1 e recusa senha errada, vencido ou sem CNPJ', () => {
    const parsed = readPfx(currentPfx, password);
    assert.equal(parsed.taxId, cnpj);
    assert.equal(parsed.serialNumber, '0A1B');
    assert.equal(parsed.thumbprintSha256, createHash('sha256').update(
      Buffer.from(
        forge.asn1
          .toDer(
            forge.pki.certificateToAsn1(
              forge.pkcs12.pkcs12FromAsn1(
                forge.asn1.fromDer(forge.util.createBuffer(currentPfx.toString('binary'))),
                password,
              ).getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]![0]!.cert!,
            ),
          )
          .getBytes(),
        'binary',
      ),
    ).digest('hex'));
    assert.match(parsed.subjectName, /EMPRESA TESTE/);

    assert.throws(() => readPfx(currentPfx, 'outra-senha'), CertificateError);

    const expired = buildPfx({
      commonName: `EMPRESA TESTE:${cnpj}`,
      notBefore: new Date('2020-01-01T00:00:00Z'),
      notAfter: new Date('2021-01-01T00:00:00Z'),
    });
    const expiredParsed = readPfx(expired, password);
    assert.equal(certificateIsCurrent(expiredParsed.validFrom, expiredParsed.validUntil, new Date()), false);

    const withoutTaxId = buildPfx({
      commonName: 'SEM CNPJ',
      notBefore: new Date('2026-01-01T00:00:00Z'),
      notAfter: new Date('2027-01-01T00:00:00Z'),
    });
    assert.throws(
      () => readPfx(withoutTaxId, password),
      (error: unknown) =>
        error instanceof CertificateError &&
        error.message === 'Não foi possível identificar o CNPJ do certificado.',
    );
  });

  it('exporta chave e certificado e lê a UF', () => {
    const pfx = buildPfx({
      commonName: `EMPRESA TESTE:${cnpj}`,
      notBefore: new Date('2026-01-01T00:00:00Z'),
      notAfter: new Date('2027-01-01T00:00:00Z'),
      state: 'SC',
    });
    const material = readPfxMaterial(pfx, password);
    assert.match(material.certificatePem, /BEGIN CERTIFICATE/);
    assert.match(material.privateKeyPem, /PRIVATE KEY/);
    assert.equal(subjectStateAbbreviation(material.certificatePem), 'SC');
    assert.throws(() => readPfxMaterial(pfx, 'outra-senha'), CertificateError);
  });
});
