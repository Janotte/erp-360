import {
  nfseAssessmentApplies,
  type NfseEnvironment,
  nfseEnvironmentLabels,
  nfseEnvironments,
  type NfseIbsCbsAssessment,
  nfseIbsCbsAssessmentLabels,
  nfseIbsCbsAssessments,
  type NfseIssqnTaxation,
  nfseIssqnTaxationLabels,
  nfseIssqnTaxations,
  type NfseSettings,
  nfseSettingsMessage,
  type NfseSimplesAssessment,
  nfseSimplesAssessmentLabels,
  nfseSimplesAssessments,
  type NfseSimplesNacional,
  nfseSimplesNacionalLabels,
  nfseSimplesNacionalOptions,
  nfseSpecialRegimeLocked,
  type NfseSpecialTaxRegime,
  nfseSpecialTaxRegimeLabels,
  nfseSpecialTaxRegimes,
} from '@erp-360/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { FloatingSelect } from '@/components/ui/FloatingField';
import { nfseSettingsService } from '@/services/nfseSettings';

const emptySettings: NfseSettings = {
  environment: 'homologation',
  simplesNacional: 'non_optant',
  simplesAssessment: null,
  ibsCbsAssessment: null,
  specialTaxRegime: 'none',
  issqnTaxation: 'taxable',
};

function optionsOf<T extends string>(items: readonly T[], labels: Record<T, string>) {
  return items.map((item) => (
    <option key={item} value={item}>
      {labels[item]}
    </option>
  ));
}

export function NfseSettingsForm() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['settings', 'nfse'],
    queryFn: nfseSettingsService.get,
  });
  const [settings, setSettings] = useState<NfseSettings>(emptySettings);

  useEffect(() => {
    if (!data) return;
    setSettings(data);
  }, [data]);

  const assessmentApplies = nfseAssessmentApplies(settings.simplesNacional);
  const regimeLocked = nfseSpecialRegimeLocked(settings);

  const mutation = useMutation({
    mutationFn: () => nfseSettingsService.save(settings),
    onSuccess: (saved) => {
      setSettings(saved);
      queryClient.setQueryData(['settings', 'nfse'], saved);
      toast.success('Configurações da NFS-e salvas.');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const patch = (next: Partial<NfseSettings>) => {
    setSettings((current) => {
      const merged = { ...current, ...next };
      if (!nfseAssessmentApplies(merged.simplesNacional)) {
        merged.simplesAssessment = null;
        merged.ibsCbsAssessment = null;
      }
      if (nfseSpecialRegimeLocked(merged)) merged.specialTaxRegime = 'none';
      return merged;
    });
  };

  return (
    <form
      className="max-w-2xl space-y-4 rounded-lg border bg-white p-6"
      onSubmit={(event) => {
        event.preventDefault();
        const message = nfseSettingsMessage(settings);
        if (message) {
          toast.error(message);
          return;
        }
        mutation.mutate();
      }}
    >
      <div>
        <h3 className="text-lg font-bold text-[#172337]">NFS-e</h3>
        <p className="mt-1 text-sm text-[#64748b]">
          Regime do prestador no padrão nacional. A tributação do ISSQN é o padrão copiado
          para a nota. Homologação não vale como nota oficial.
        </p>
      </div>
      <FloatingSelect
        id="nfseEnvironment"
        label="Ambiente da NFS-e"
        value={settings.environment}
        pinned
        onChange={(event) =>
          patch({ environment: event.target.value as NfseEnvironment })
        }
      >
        {optionsOf(nfseEnvironments, nfseEnvironmentLabels)}
      </FloatingSelect>
      <FloatingSelect
        id="nfseSimplesNacional"
        label="Simples Nacional"
        value={settings.simplesNacional}
        pinned
        onChange={(event) =>
          patch({ simplesNacional: event.target.value as NfseSimplesNacional })
        }
      >
        {optionsOf(nfseSimplesNacionalOptions, nfseSimplesNacionalLabels)}
      </FloatingSelect>
      {assessmentApplies ? (
        <>
          <FloatingSelect
            id="nfseSimplesAssessment"
            label="Apuração federal e ISS"
            value={settings.simplesAssessment ?? ''}
            pinned
            required
            onChange={(event) =>
              patch({
                simplesAssessment:
                  event.target.value === ''
                    ? null
                    : (event.target.value as NfseSimplesAssessment),
              })
            }
          >
            <option value="">Selecione</option>
            {optionsOf(nfseSimplesAssessments, nfseSimplesAssessmentLabels)}
          </FloatingSelect>
          <FloatingSelect
            id="nfseIbsCbsAssessment"
            label="Apuração do IBS e da CBS"
            value={settings.ibsCbsAssessment ?? ''}
            pinned
            required
            onChange={(event) =>
              patch({
                ibsCbsAssessment:
                  event.target.value === ''
                    ? null
                    : (event.target.value as NfseIbsCbsAssessment),
              })
            }
          >
            <option value="">Selecione</option>
            {optionsOf(nfseIbsCbsAssessments, nfseIbsCbsAssessmentLabels)}
          </FloatingSelect>
        </>
      ) : null}
      <FloatingSelect
        id="nfseIssqnTaxation"
        label="Tributação do ISSQN"
        value={settings.issqnTaxation}
        pinned
        onChange={(event) =>
          patch({ issqnTaxation: event.target.value as NfseIssqnTaxation })
        }
      >
        {optionsOf(nfseIssqnTaxations, nfseIssqnTaxationLabels)}
      </FloatingSelect>
      <FloatingSelect
        id="nfseSpecialTaxRegime"
        label="Regime especial de tributação"
        value={settings.specialTaxRegime}
        pinned
        disabled={regimeLocked}
        onChange={(event) =>
          patch({ specialTaxRegime: event.target.value as NfseSpecialTaxRegime })
        }
      >
        {optionsOf(nfseSpecialTaxRegimes, nfseSpecialTaxRegimeLabels)}
      </FloatingSelect>
      {regimeLocked ? (
        <p className="text-sm text-[#64748b]">
          Este enquadramento não admite regime especial.
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={mutation.isPending || !data}>
          {mutation.isPending ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>
    </form>
  );
}
