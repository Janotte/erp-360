import { z } from 'zod';

export const certificateEnvironments = ['homologation', 'production'] as const;
export type CertificateEnvironment = (typeof certificateEnvironments)[number];

export const certificateModels = ['a1', 'a3'] as const;

export const CERTIFICATE_WARNING_DAYS = 30;

export const tenantCertificateSchema = z.object({
  id: z.string().uuid(),
  model: z.enum(certificateModels),
  environment: z.enum(certificateEnvironments),
  label: z.string().nullable(),
  serialNumber: z.string(),
  thumbprintSha256: z.string(),
  subjectName: z.string(),
  issuerName: z.string(),
  taxId: z.string(),
  validFrom: z.string(),
  validUntil: z.string(),
  isActive: z.boolean(),
  daysLeft: z.number().int(),
  expired: z.boolean(),
});

export type TenantCertificateView = z.infer<typeof tenantCertificateSchema>;

export const tenantCertificateListSchema = z.array(tenantCertificateSchema);

export const certificateInspectionSchema = tenantCertificateSchema
  .omit({ id: true, isActive: true, environment: true })
  .extend({
    current: z.boolean(),
    belongsToTenant: z.boolean(),
    messages: z.array(z.string()),
  });

export type CertificateInspection = z.infer<typeof certificateInspectionSchema>;

export const certificateWarningSchema = z.object({
  environment: z.enum(certificateEnvironments),
  label: z.string().nullable(),
  validUntil: z.string(),
  daysLeft: z.number().int(),
  expired: z.boolean(),
});

export type CertificateWarning = z.infer<typeof certificateWarningSchema>;

export const certificateConnectionTargets = ['sefaz', 'ecac'] as const;
export type CertificateConnectionTarget = (typeof certificateConnectionTargets)[number];

export const certificateConnectionSchema = z.object({
  validLocal: z.boolean(),
  validRemote: z.boolean(),
  checkedAt: z.string(),
  target: z.enum(certificateConnectionTargets),
  endpoint: z.string(),
  localChecks: z.object({
    certificateFound: z.boolean(),
    isActive: z.boolean(),
    notExpired: z.boolean(),
    hasPrivateKey: z.boolean(),
    hasCertificate: z.boolean(),
  }),
  remote: z.object({
    ok: z.boolean(),
    statusCode: z.number().int().nullable(),
    statusMessage: z.string().nullable(),
    latencyMs: z.number().int(),
    error: z.string().nullable(),
  }),
});

export type CertificateConnection = z.infer<typeof certificateConnectionSchema>;
