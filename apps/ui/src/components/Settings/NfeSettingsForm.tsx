import type { CertificateEnvironment } from '@erp-360/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { FloatingSelect } from '@/components/ui/FloatingField';
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
      className="max-w-lg space-y-4 rounded-lg border bg-white p-6"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <div>
        <h3 className="text-lg font-bold text-[#172337]">NF-e</h3>
        <p className="mt-1 text-sm text-[#64748b]">
          Ambiente usado na consulta de DF-e e na emissão. Homologação não vale como nota
          oficial.
        </p>
      </div>
      <FloatingSelect
        id="nfeEnvironment"
        label="Ambiente da NF-e"
        value={environment}
        pinned
        onChange={(event) => setEnvironment(event.target.value as CertificateEnvironment)}
      >
        {environments.map((item) => (
          <option key={item} value={item}>
            {environmentLabel[item]}
          </option>
        ))}
      </FloatingSelect>
      <div className="flex justify-end">
        <Button type="submit" disabled={mutation.isPending || !data}>
          {mutation.isPending ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>
    </form>
  );
}
