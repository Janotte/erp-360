import tls from 'node:tls';

import { extraTrustedCertificates } from './extra-cas.ts';

// A coleção Mozilla do Node não inclui a Raiz Brasileira v10, usada pela SEFAZ.
// O e-CAC omite a intermediária AC SERPRO AR46, assinada pela GlobalSign Root R46.

let cached: string[] | undefined;

export function trustedCertificates() {
  cached ??= [...tls.rootCertificates, ...extraTrustedCertificates];
  return cached;
}
