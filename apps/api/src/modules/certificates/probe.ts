import https from 'node:https';
import { URL } from 'node:url';

import type { CertificateEnvironment } from '@erp-360/shared';

import { interpretSefaz, sefazStatusRequest } from './sefaz.ts';

export interface RemoteProbe {
  ok: boolean;
  statusCode: number | null;
  statusMessage: string | null;
  latencyMs: number;
  error: string | null;
}

const missingMaterial = 'Não foi possível carregar o certificado para a conexão.';

function failed(startedAt: number, error: string): RemoteProbe {
  return {
    ok: false,
    statusCode: null,
    statusMessage: null,
    latencyMs: Date.now() - startedAt,
    error,
  };
}

function describeProbeError(error: unknown) {
  if (!(error instanceof Error)) return 'Falha ao validar a conexão.';
  if (error.message === 'Tempo esgotado ao conectar no serviço.') return error.message;
  const code = 'code' in error && typeof error.code === 'string' ? error.code : '';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN')
    return 'Não foi possível localizar o serviço.';
  if (code === 'ECONNREFUSED' || code === 'ECONNRESET' || code === 'EPROTO') {
    return 'A conexão com o serviço foi recusada.';
  }
  if (code === 'CERT_HAS_EXPIRED') return 'O certificado está vencido.';
  if (
    code === 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY' ||
    code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
    code === 'DEPTH_ZERO_SELF_SIGNED_CERT'
  ) {
    return 'A cadeia do serviço remoto não foi reconhecida.';
  }
  return 'Falha ao validar a conexão.';
}

function requestHttps(input: {
  endpoint: string;
  method: 'GET' | 'POST';
  timeoutMs: number;
  certificatePem: string;
  privateKeyPem: string;
  headers?: Record<string, string>;
  body?: string;
}) {
  const url = new URL(input.endpoint);
  return new Promise<{
    statusCode: number | null;
    statusMessage: string | null;
    body: string;
  }>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      callback();
    };

    const request = https.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: input.method,
        cert: input.certificatePem,
        key: input.privateKeyPem,
        rejectUnauthorized: true,
        timeout: input.timeoutMs,
        headers: input.headers,
      },
      (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          if (size >= 64_000) return;
          const piece = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          chunks.push(piece);
          size += piece.length;
        });
        response.on('end', () => {
          finish(() =>
            resolve({
              statusCode: response.statusCode ?? null,
              statusMessage: response.statusMessage ?? null,
              body: Buffer.concat(chunks).subarray(0, 64_000).toString('utf8'),
            }),
          );
        });
      },
    );

    request.on('timeout', () => {
      request.destroy();
      finish(() => reject(new Error('Tempo esgotado ao conectar no serviço.')));
    });
    request.on('error', (error) => finish(() => reject(error)));
    if (input.body) request.write(input.body);
    request.end();
  });
}

export async function postCertificate(input: {
  endpoint: string;
  body: string;
  headers: Record<string, string>;
  timeoutMs: number;
  certificatePem: string;
  privateKeyPem: string;
}) {
  if (!input.certificatePem || !input.privateKeyPem) throw new Error(missingMaterial);
  try {
    return await requestHttps({
      endpoint: input.endpoint,
      method: 'POST',
      timeoutMs: input.timeoutMs,
      certificatePem: input.certificatePem,
      privateKeyPem: input.privateKeyPem,
      headers: {
        ...input.headers,
        'Content-Length': String(Buffer.byteLength(input.body)),
      },
      body: input.body,
    });
  } catch (error) {
    throw new Error(describeProbeError(error));
  }
}

export async function probeHttps(input: {
  endpoint: string;
  timeoutMs: number;
  certificatePem: string;
  privateKeyPem: string;
}): Promise<RemoteProbe> {
  const startedAt = Date.now();
  if (!input.certificatePem || !input.privateKeyPem)
    return failed(startedAt, missingMaterial);

  try {
    const response = await requestHttps({
      endpoint: input.endpoint,
      method: 'GET',
      timeoutMs: input.timeoutMs,
      certificatePem: input.certificatePem,
      privateKeyPem: input.privateKeyPem,
    });
    const latencyMs = Date.now() - startedAt;
    const ok = response.statusCode !== null && response.statusCode < 500;
    return {
      ok,
      statusCode: response.statusCode,
      statusMessage: response.statusMessage,
      latencyMs,
      error: ok ? null : 'O serviço remoto respondeu com erro.',
    };
  } catch (error) {
    return failed(startedAt, describeProbeError(error));
  }
}

export async function probeSefaz(input: {
  endpoint: string;
  timeoutMs: number;
  certificatePem: string;
  privateKeyPem: string;
  cUF: string;
  environment: CertificateEnvironment;
}): Promise<RemoteProbe> {
  const startedAt = Date.now();
  if (!input.certificatePem || !input.privateKeyPem)
    return failed(startedAt, missingMaterial);

  try {
    const soap = sefazStatusRequest({
      endpoint: input.endpoint,
      cUF: input.cUF,
      environment: input.environment,
    });
    const response = await requestHttps({
      endpoint: input.endpoint,
      method: 'POST',
      timeoutMs: input.timeoutMs,
      certificatePem: input.certificatePem,
      privateKeyPem: input.privateKeyPem,
      headers: {
        ...soap.headers,
        'Content-Length': String(Buffer.byteLength(soap.body)),
      },
      body: soap.body,
    });
    const interpreted = interpretSefaz(response.statusCode, response.body);
    return { ...interpreted, latencyMs: Date.now() - startedAt };
  } catch (error) {
    return failed(startedAt, describeProbeError(error));
  }
}
