import {
  type CertificateConnection,
  type CertificateConnectionTarget,
  type CertificateEnvironment,
  type CertificateInspection,
  formatCnpj,
  formatRawDate,
  type TenantCertificateView,
} from '@erp-360/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { certificateService } from '@/services/certificates';

const environmentLabel: Record<CertificateEnvironment, string> = {
  homologation: 'Homologação',
  production: 'Produção',
};

function readFileAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Não foi possível ler o arquivo.'));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}

function endpointHost(endpoint: string) {
  if (!endpoint) return '';
  try {
    return new URL(endpoint).hostname;
  } catch {
    return '';
  }
}

function CertificateCard({ certificate }: { certificate: TenantCertificateView }) {
  const queryClient = useQueryClient();
  const [result, setResult] = useState<CertificateConnection | null>(null);
  const [confirming, setConfirming] = useState(false);
  const remove = useMutation({
    mutationFn: () => certificateService.remove(certificate.id),
    onSuccess: () => {
      setConfirming(false);
      queryClient.invalidateQueries({ queryKey: ['certificates'] });
      toast.success('Certificado excluído.');
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const connection = useMutation({
    mutationFn: (target: CertificateConnectionTarget) =>
      certificateService.testConnection(certificate.id, target),
    onSuccess: setResult,
    onError: (error: Error) => toast.error(error.message),
  });
  const pendingTarget = connection.isPending ? connection.variables : null;
  const checks = result
    ? [
        ['Ativo', result.localChecks.isActive],
        ['Dentro da validade', result.localChecks.notExpired],
        ['Chave privada', result.localChecks.hasPrivateKey],
        ['Certificado', result.localChecks.hasCertificate],
      ]
    : [];

  return (
    <li className="rounded-lg border bg-white p-4 text-sm">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-medium text-zinc-900">
          {certificate.label || environmentLabel[certificate.environment]}
        </p>
        <span
          className={
            certificate.expired || certificate.daysLeft <= 30
              ? 'text-rose-700'
              : 'text-emerald-700'
          }
        >
          {validityText(certificate.daysLeft, certificate.expired)}
        </span>
      </div>
      <p className="mt-1 text-zinc-500">{environmentLabel[certificate.environment]}</p>
      <p className="text-zinc-500">{certificate.subjectName}</p>
      <p className="text-zinc-500">
        CNPJ {formatCnpj(certificate.taxId)} · série {certificate.serialNumber}
      </p>
      <p className="text-zinc-500">
        {formatRawDate(certificate.validFrom)} a {formatRawDate(certificate.validUntil)}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={connection.isPending}
          onClick={() => connection.mutate('sefaz')}
        >
          {pendingTarget === 'sefaz' ? 'Testando...' : 'Testar SEFAZ'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={connection.isPending}
          onClick={() => connection.mutate('ecac')}
        >
          {pendingTarget === 'ecac' ? 'Testando...' : 'Testar e-CAC'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={remove.isPending}
          onClick={() => setConfirming(true)}
        >
          Excluir
        </Button>
      </div>
      {result ? (
        <div className="mt-3 space-y-1 rounded-md border border-zinc-200 bg-zinc-50 p-3">
          <p className={result.validLocal ? 'text-emerald-700' : 'text-rose-700'}>
            {result.validLocal
              ? 'Certificado pronto para uso.'
              : 'O certificado não passou na checagem local.'}
          </p>
          <p className="text-zinc-500">
            {checks.map(([label, ok]) => `${label}: ${ok ? 'sim' : 'não'}`).join(' · ')}
          </p>
          <p className={result.validRemote ? 'text-emerald-700' : 'text-rose-700'}>
            {result.validRemote
              ? 'Conexão aceita.'
              : (result.remote.error ?? 'Falha na conexão.')}
          </p>
          {result.validRemote && result.remote.statusMessage ? (
            <p className="text-zinc-600">{result.remote.statusMessage}</p>
          ) : null}
          {result.endpoint ? (
            <p className="text-zinc-500">
              {[endpointHost(result.endpoint), `${result.remote.latencyMs} ms`]
                .filter(Boolean)
                .join(' · ')}
            </p>
          ) : null}
        </div>
      ) : null}
      <AlertDialog
        open={confirming}
        onOpenChange={(open) => !open && setConfirming(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir certificado</AlertDialogTitle>
            <AlertDialogDescription>
              O certificado de {environmentLabel[certificate.environment].toLowerCase()}{' '}
              deixa de ser usado na SEFAZ. O arquivo e a senha salva são apagados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              onClick={(event) => {
                event.preventDefault();
                remove.mutate();
              }}
            >
              {remove.isPending ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

function validityText(daysLeft: number, expired: boolean) {
  if (expired) return 'Vencido';
  if (daysLeft === 0) return 'Vence hoje';
  if (daysLeft <= 30) return `Vence em ${daysLeft} dias`;
  return 'Válido';
}

export function CertificateSettings() {
  const queryClient = useQueryClient();
  const { data: certificates = [] } = useQuery({
    queryKey: ['certificates'],
    queryFn: certificateService.list,
  });
  const [environment, setEnvironment] = useState<CertificateEnvironment>('production');
  const [label, setLabel] = useState('');
  const [password, setPassword] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [inspection, setInspection] = useState<CertificateInspection | null>(null);

  async function payload() {
    if (!file) throw new Error('Selecione o arquivo .pfx ou .p12.');
    if (!password) throw new Error('Informe a senha do certificado.');
    return {
      environment,
      label: label.trim() || null,
      password,
      pfxBase64: await readFileAsBase64(file),
    };
  }

  const inspect = useMutation({
    mutationFn: async () => {
      const dados = await payload();
      return certificateService.inspect(dados);
    },
    onSuccess: (result) => {
      setInspection(result);
      if (result.belongsToTenant && result.current) {
        toast.success(result.messages[0] ?? 'Certificado válido.');
        return;
      }
      toast.error(result.messages[0] ?? 'Certificado recusado.');
    },
    onError: (error: Error) => {
      setInspection(null);
      toast.error(error.message);
    },
  });

  const importCertificate = useMutation({
    mutationFn: async () => certificateService.import(await payload()),
    onSuccess: () => {
      setPassword('');
      setFile(null);
      setFileKey((current) => current + 1);
      setInspection(null);
      queryClient.invalidateQueries({ queryKey: ['certificates'] });
      toast.success('Certificado importado.');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="max-w-3xl space-y-6">
      <form
        className="space-y-4 rounded-lg border bg-white p-4"
        onSubmit={(event) => {
          event.preventDefault();
          importCertificate.mutate();
        }}
      >
        <div>
          <h3 className="text-lg font-bold text-zinc-900">Certificado digital</h3>
          <p className="text-sm text-zinc-500">
            Importe o certificado A1 da empresa. A senha fica cifrada e o arquivo não é
            exibido depois.
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="certificateEnvironment">Ambiente</Label>
          <select
            id="certificateEnvironment"
            value={environment}
            onChange={(event) =>
              setEnvironment(event.target.value as CertificateEnvironment)
            }
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
          >
            <option value="production">Produção</option>
            <option value="homologation">Homologação</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="certificateLabel">Apelido</Label>
          <Input
            id="certificateLabel"
            value={label}
            maxLength={60}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Opcional"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="certificateFile">Arquivo (.pfx ou .p12)</Label>
          <Input
            key={fileKey}
            id="certificateFile"
            type="file"
            accept=".pfx,.p12,application/x-pkcs12"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setInspection(null);
            }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="certificatePassword">Senha</Label>
          <Input
            id="certificatePassword"
            type="password"
            autoComplete="off"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        {inspection ? (
          <div className="space-y-1 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm">
            <p className="text-zinc-700">{inspection.subjectName}</p>
            <p className="text-zinc-500">CNPJ {formatCnpj(inspection.taxId)}</p>
            <p className="text-zinc-500">
              Validade {formatRawDate(inspection.validFrom)} a{' '}
              {formatRawDate(inspection.validUntil)} ·{' '}
              {validityText(inspection.daysLeft, inspection.expired)}
            </p>
            {inspection.messages.map((message) => (
              <p key={message} className="text-zinc-600">
                {message}
              </p>
            ))}
          </div>
        ) : null}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={inspect.isPending}
            onClick={() => inspect.mutate()}
          >
            {inspect.isPending ? 'Testando...' : 'Testar'}
          </Button>
          <Button type="submit" disabled={importCertificate.isPending}>
            {importCertificate.isPending ? 'Importando...' : 'Importar'}
          </Button>
        </div>
      </form>

      <section className="space-y-3">
        <h3 className="text-sm font-medium text-zinc-800">Certificados ativos</h3>
        {certificates.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhum certificado importado.</p>
        ) : (
          <ul className="space-y-2">
            {certificates.map((certificate) => (
              <CertificateCard key={certificate.id} certificate={certificate} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
