import type { CertificateEnvironment } from '@erp-360/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { nfeSettingsService } from '@/services/nfeSettings';

const environments: CertificateEnvironment[] = ['homologation', 'production'];

const environmentLabel: Record<CertificateEnvironment, string> = {
  homologation: 'Homologação',
  production: 'Produção',
};

export function NfeSettingsForm() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['settings', 'nfe'],
    queryFn: nfeSettingsService.get,
  });
  const [environment, setEnvironment] = useState<CertificateEnvironment>('homologation');

  useEffect(() => {
    if (!data) return;
    setEnvironment(data.environment);
  }, [data]);

  const mutation = useMutation({
    mutationFn: () => nfeSettingsService.save({ environment }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'nfe'] });
      toast.success('Configurações da NF-e salvas.');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <form
      className="max-w-lg space-y-4 rounded-lg border bg-white p-4"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <div>
        <h3 className="text-lg font-bold text-zinc-900">NF-e</h3>
        <p className="text-sm text-zinc-500">
          Ambiente usado na consulta de DF-e e na emissão. Homologação não vale como nota
          oficial.
        </p>
      </div>
      <div className="space-y-1">
        <Label htmlFor="nfeEnvironment">Ambiente da NF-e</Label>
        <select
          id="nfeEnvironment"
          value={environment}
          onChange={(event) =>
            setEnvironment(event.target.value as CertificateEnvironment)
          }
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
        >
          {environments.map((item) => (
            <option key={item} value={item}>
              {environmentLabel[item]}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" disabled={mutation.isPending || !data}>
        Salvar
      </Button>
    </form>
  );
}
