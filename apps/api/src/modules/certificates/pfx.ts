import { createHash } from 'node:crypto';

import { isValidCnpj } from '@erp-360/shared';
import forge from 'node-forge';

import { CertificateError } from './errors.ts';

const cnpjOid = Buffer.from([0x60, 0x4c, 0x01, 0x03, 0x03]);

export interface ParsedCertificate {
  serialNumber: string;
  thumbprintSha256: string;
  subjectName: string;
  issuerName: string;
  taxId: string;
  validFrom: Date;
  validUntil: Date;
}

function distinguishedName(attributes: forge.pki.CertificateField[]) {
  return attributes
    .map((attribute) => {
      const name = attribute.shortName || attribute.name || 'DN';
      const value = Array.isArray(attribute.value) ? attribute.value.join(' ') : attribute.value;
      return `${name}=${value ?? ''}`;
    })
    .join(', ');
}

function cnpjsInText(value: string) {
  return value.match(/\d{14}/g) ?? [];
}

export function extractCertificateTaxId(commonName: string | null, der: Buffer) {
  const fromOid: string[] = [];
  let offset = 0;
  while (offset < der.length) {
    const index = der.indexOf(cnpjOid, offset);
    if (index < 0) break;
    const window = der.subarray(index, Math.min(der.length, index + 80)).toString('latin1');
    fromOid.push(...cnpjsInText(window));
    offset = index + cnpjOid.length;
  }

  const candidates = [...fromOid, ...(commonName ? cnpjsInText(commonName) : [])];
  return candidates.find((candidate) => isValidCnpj(candidate)) ?? null;
}

function certificateDer(certificate: forge.pki.Certificate) {
  return Buffer.from(forge.asn1.toDer(forge.pki.certificateToAsn1(certificate)).getBytes(), 'binary');
}

function openPkcs12(pfx: Buffer, password: string) {
  try {
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(pfx.toString('binary')));
    return forge.pkcs12.pkcs12FromAsn1(asn1, password);
  } catch {
    throw new CertificateError(
      400,
      'Não foi possível abrir o certificado. Confira o arquivo e a senha.',
    );
  }
}

function rsaModulus(key: unknown) {
  if (!key || typeof key !== 'object' || !('n' in key)) return null;
  const modulus = key.n;
  if (!modulus || typeof modulus !== 'object' || !('compareTo' in modulus)) return null;
  return modulus as forge.jsbn.BigInteger;
}

function certificatesOf(pkcs12: forge.pkcs12.Pkcs12Pfx) {
  const bags = pkcs12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
  return bags.flatMap((bag) => (bag.cert ? [bag.cert] : []));
}

export function readPfx(pfx: Buffer, password: string): ParsedCertificate {
  const certificates = certificatesOf(openPkcs12(pfx, password));
  const certificate = certificates[0];

  if (!certificate) {
    throw new CertificateError(400, 'O arquivo não contém um certificado.');
  }

  const der = certificateDer(certificate);
  const commonName = certificate.subject.getField('CN')?.value;
  const taxId = extractCertificateTaxId(typeof commonName === 'string' ? commonName : null, der);
  if (!taxId) {
    throw new CertificateError(400, 'Não foi possível identificar o CNPJ do certificado.');
  }

  const serialNumber = certificate.serialNumber.toUpperCase();
  if (!/^[0-9A-F]{1,40}$/.test(serialNumber)) {
    throw new CertificateError(400, 'O número de série do certificado não é válido.');
  }

  return {
    serialNumber,
    thumbprintSha256: createHash('sha256').update(der).digest('hex'),
    subjectName: distinguishedName(certificate.subject.attributes),
    issuerName: distinguishedName(certificate.issuer.attributes),
    taxId,
    validFrom: certificate.validity.notBefore,
    validUntil: certificate.validity.notAfter,
  };
}

export function readPfxMaterial(pfx: Buffer, password: string) {
  const pkcs12 = openPkcs12(pfx, password);
  const shroudedOid = forge.pki.oids.pkcs8ShroudedKeyBag;
  const keyBagOid = forge.pki.oids.keyBag;
  const keys = [
    ...(pkcs12.getBags({ bagType: shroudedOid })[shroudedOid] ?? []),
    ...(pkcs12.getBags({ bagType: keyBagOid })[keyBagOid] ?? []),
  ].flatMap((bag) => (bag.key ? [bag.key] : []));
  const privateKey = keys[0];
  let privateKeyPem = '';
  if (privateKey) {
    try {
      privateKeyPem = forge.pki.privateKeyToPem(privateKey);
    } catch {
      privateKeyPem = '';
    }
  }

  const modulus = rsaModulus(privateKey);
  const certificates = certificatesOf(pkcs12);
  const leafIndex = modulus
    ? certificates.findIndex((certificate) => {
        const publicModulus = rsaModulus(certificate.publicKey);
        return publicModulus !== null && publicModulus.compareTo(modulus) === 0;
      })
    : 0;
  const ordered =
    leafIndex > 0
      ? [certificates[leafIndex], ...certificates.filter((_, index) => index !== leafIndex)]
      : certificates;
  const leaf = ordered[0];

  return {
    certificatePem: ordered.map((certificate) => forge.pki.certificateToPem(certificate)).join(''),
    privateKeyPem,
    subjectName: leaf ? distinguishedName(leaf.subject.attributes) : '',
  };
}

export function decodePfxBase64(value: string) {
  const base64 = value.replace(/^data:[^;]+;base64,/i, '').replace(/\s/g, '');
  const pfx = Buffer.from(base64, 'base64');
  if (pfx.length === 0 || pfx.length > 1_000_000) {
    throw new CertificateError(400, 'Arquivo de certificado inválido.');
  }
  return pfx;
}
