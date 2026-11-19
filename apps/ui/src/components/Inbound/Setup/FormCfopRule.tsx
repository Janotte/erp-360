import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { FormEvent } from 'react';
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
import { FloatingInput, FloatingSelect } from '@/components/ui/FloatingField';
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
} from './labels';

export function FormCfopRule({
  ruleToUpdate,
  onSuccess,
  onCancel,
  onDeleted,
}: {
  ruleToUpdate?: CfopEntryRule | null;
  onSuccess?: () => void;
  onCancel?: () => void;
  onDeleted?: () => void;
}) {
  const queryClient = useQueryClient();
  const [sourceCfop, setSourceCfop] = useState(ruleToUpdate?.sourceCfop ?? '');
  const [entryCfop, setEntryCfop] = useState(ruleToUpdate?.entryCfop ?? '');
  const [fiscalPurpose, setFiscalPurpose] = useState<FiscalPurpose>(
    ruleToUpdate?.fiscalPurpose ?? 'resale',
  );
  const [openDelete, setOpenDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const scope = scopeFromSourceCfop(sourceCfop);

  const mutation = useMutation({
    mutationFn: (dados: CfopEntryRuleInput) =>
      ruleToUpdate
        ? inboundSetupService.updateCfopRule(ruleToUpdate.id, dados)
        : inboundSetupService.createCfopRule(dados),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cfop-rules'] });
      toast.success(ruleToUpdate ? 'Regra atualizada.' : 'Regra cadastrada.');
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Falha ao salvar a regra.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => inboundSetupService.deleteCfopRule(ruleToUpdate?.id ?? ''),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cfop-rules'] });
      toast.success('Regra excluída.');
      onDeleted?.();
    },
    onError: (error: Error) => setDeleteError(error.message),
  });

  const busy = mutation.isPending || deleteMutation.isPending;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate({ sourceCfop, fiscalPurpose, entryCfop });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-[#64748b]">
        O CFOP da nota define o âmbito. A mesma nota pode ter uma entrada diferente para
        cada finalidade.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <FloatingInput
            label="CFOP da nota"
            value={sourceCfop}
            inputMode="numeric"
            maxLength={4}
            required
            autoFocus
            onChange={(event) =>
              setSourceCfop(event.target.value.replace(/\D/g, '').slice(0, 4))
            }
          />
          <p className="text-xs text-[#64748b]">
            {scope ? cfopScopeLabels[scope] : 'Começa com 5, 6 ou 7.'}
          </p>
        </div>
        <div className="space-y-1">
          <FloatingInput
            label="CFOP de entrada"
            value={entryCfop}
            inputMode="numeric"
            maxLength={4}
            required
            onChange={(event) =>
              setEntryCfop(event.target.value.replace(/\D/g, '').slice(0, 4))
            }
          />
          <p className="text-xs text-[#64748b]">Começa com 1, 2 ou 3, no mesmo âmbito.</p>
        </div>
      </div>
      <FloatingSelect
        label="Finalidade"
        value={fiscalPurpose}
        pinned
        onChange={(event) => setFiscalPurpose(event.target.value as FiscalPurpose)}
      >
        {fiscalPurposes.map((purpose) => (
          <option key={purpose} value={purpose}>
            {fiscalPurposeLabels[purpose]}
          </option>
        ))}
      </FloatingSelect>
      <div className="flex flex-wrap justify-end gap-2">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
        ) : null}
        {ruleToUpdate && onDeleted ? (
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={() => {
              setDeleteError(null);
              setOpenDelete(true);
            }}
          >
            Excluir
          </Button>
        ) : null}
        <Button type="submit" disabled={busy}>
          {mutation.isPending ? 'Salvando...' : ruleToUpdate ? 'Atualizar' : 'Cadastrar'}
        </Button>
      </div>

      <AlertDialog open={openDelete} onOpenChange={setOpenDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir regra</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteError ??
                `Deseja excluir a conversão de ${sourceCfop || '—'} para ${entryCfop || '—'}? Notas já lançadas permanecem com o CFOP gravado.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteMutation.isPending || !!deleteError}
              onClick={(event) => {
                event.preventDefault();
                deleteMutation.mutate();
              }}
            >
              {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
