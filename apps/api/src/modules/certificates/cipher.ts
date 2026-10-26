import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

import { CertificateError } from './errors.ts';

function keyFromSecret(secret: string) {
  return createHash('sha256').update(secret).digest();
}

export function encryptPassword(password: string, secret: string) {
  const key = keyFromSecret(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]);
}

export function certificateReadMessage(error: unknown) {
  if (error instanceof CertificateError) return error.message;
  const message = error instanceof Error ? error.message : '';
  if (/unable to authenticate data|Unsupported state/i.test(message)) {
    return 'saved-password';
  }
  return 'unreadable';
}

export function decryptPassword(payload: Buffer, secret: string) {
  const key = keyFromSecret(secret);
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const encrypted = payload.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
