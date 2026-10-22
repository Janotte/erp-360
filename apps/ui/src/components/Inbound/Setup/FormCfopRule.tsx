import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  type CfopEntryRule,
  type CfopEntryRuleInput,
  type FiscalPurpose,
  inboundSetupService,
} from '@/services/inboundSetup';

import {
  cfopScopeLabels,
  fiscalPurposeLabels,
  fiscalPurposes,
  scopeFromSourceCfop,
  selectClassName,
} from './labels';

interface FormCfopRuleProps {
  ruleToUpdate?: CfopEntryRule | null;
  onSuccess?: () => void;
}

export function FormCfopRule({ ruleToUpdate, onSuccess }: FormCfopRuleProps) {
  const queryClient = useQueryClient();
  const [sourceCfop, setSourceCfop] = useState(ruleToUpdate?.sourceCfop ?? '');
  const [entryCfop, setEntryCfop] = useState(ruleToUpdate?.entryCfop ?? '');
  const [fiscalPurpose, setFiscalPurpose] = useState<FiscalPurpose>(
    ruleToUpdate?.fiscalPurpose ?? 'resale',
  );
  const scope = scopeFromSourceCfop(sourceCfop);

  const mutation = useMutation({
    mutationFn: (dados: CfopEntryRuleInput) =>
      ruleToUpdate
        ? inboundSetupService.updateCfopRule(ruleToUpdate.id, dados)
        : inboundSetupService.createCfopRule(dados),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cfop-rules'] });
      onSuccess?.();
      toast.success(ruleToUpdate ? 'Regra atualizada.' : 'Regra cadastrada.');
    },
    onError: (error) => {
      toast.error(error.message || 'Falha ao salvar a regra.');
    },
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate({ sourceCfop, fiscalPurpose, entryCfop });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-2">
      <p className="text-sm text-zinc-500">
        O CFOP da nota define o âmbito. A mesma nota pode ter uma entrada diferente para cada
        finalidade.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="sourceCfop">
            CFOP da nota <span className="text-destructive">*</span>
          </Label>
          <Input
            id="sourceCfop"
            value={sourceCfop}
            inputMode="numeric"
            maxLength={4}
            required
            onChange={(event) => setSourceCfop(event.target.value.replace(/\D/g, '').slice(0, 4))}
          />
          <p className="text-sm text-zinc-500">
            {scope ? cfopScopeLabels[scope] : 'Começa com 5, 6 ou 7.'}
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="entryCfop">
            CFOP de entrada <span className="text-destructive">*</span>
          </Label>
          <Input
            id="entryCfop"
            value={entryCfop}
            inputMode="numeric"
            maxLength={4}
            required
            onChange={(event) => setEntryCfop(event.target.value.replace(/\D/g, '').slice(0, 4))}
          />
          <p className="text-sm text-zinc-500">Começa com 1, 2 ou 3, no mesmo âmbito.</p>
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="rulePurpose">Finalidade</Label>
        <select
          id="rulePurpose"
          value={fiscalPurpose}
          onChange={(event) => setFiscalPurpose(event.target.value as FiscalPurpose)}
          className={selectClassName}
        >
          {fiscalPurposes.map((purpose) => (
            <option key={purpose} value={purpose}>
              {fiscalPurposeLabels[purpose]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Salvando...' : ruleToUpdate ? 'Atualizar' : 'Cadastrar'}
        </Button>
      </div>
    </form>
  );
}
