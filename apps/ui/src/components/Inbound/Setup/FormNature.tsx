import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { CatalogSearchSelect } from '@/components/ui/CatalogSearchSelect';
import { FloatingInput, FloatingSelect } from '@/components/ui/FloatingField';
import { financialService } from '@/services/financials';
import {
  type FiscalPurpose,
  inboundSetupService,
  type OperationNature,
  type OperationNatureInput,
} from '@/services/inboundSetup';

import { fiscalPurposeLabels, fiscalPurposes } from './labels';

function YesNo({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <FloatingSelect
      label={label}
      value={checked ? 'sim' : 'nao'}
      pinned
      disabled={disabled}
      onChange={(event) => onChange(event.target.value === 'sim')}
    >
      <option value="sim">Sim</option>
      <option value="nao">Não</option>
    </FloatingSelect>
  );
}

export function FormNature({
  natureToUpdate,
  onSuccess,
  onCancel,
  onDeleted,
}: {
  natureToUpdate?: OperationNature | null;
  onSuccess?: () => void;
  onCancel?: () => void;
  onDeleted?: () => void;
}) {
  const queryClient = useQueryClient();
  const natureId = natureToUpdate?.id;
  const [code, setCode] = useState(natureToUpdate?.code ?? '');
  const [name, setName] = useState(natureToUpdate?.name ?? '');
  const [fiscalPurpose, setFiscalPurpose] = useState<FiscalPurpose>(
    natureToUpdate?.fiscalPurpose ?? 'resale',
  );
  const [movesStock, setMovesStock] = useState(natureToUpdate?.movesStock === true);
  const [createsPayable, setCreatesPayable] = useState(
    natureToUpdate?.createsPayable !== false,
  );
  const [updatesAverageCost, setUpdatesAverageCost] = useState(
    natureToUpdate?.updatesAverageCost === true,
  );
  const [suggestsListPrice, setSuggestsListPrice] = useState(
    natureToUpdate?.suggestsListPrice === true,
  );
  const [freightInCost, setFreightInCost] = useState(
    natureToUpdate?.freightInCost !== false,
  );
  const [insuranceInCost, setInsuranceInCost] = useState(
    natureToUpdate?.insuranceInCost !== false,
  );
  const [otherInCost, setOtherInCost] = useState(natureToUpdate?.otherInCost !== false);
  const [discountInCost, setDiscountInCost] = useState(
    natureToUpdate?.discountInCost !== false,
  );
  const [ipiInCost, setIpiInCost] = useState(natureToUpdate?.ipiInCost === true);
  const [stInCost, setStInCost] = useState(natureToUpdate?.stInCost !== false);
  const [icmsInCost, setIcmsInCost] = useState(natureToUpdate?.icmsInCost === true);
  const [planAccountId, setPlanAccountId] = useState(natureToUpdate?.planAccountId ?? '');
  const [isActive, setIsActive] = useState(natureToUpdate?.isActive !== false);
  const [openDelete, setOpenDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { data: accounts = [], isLoading: loadingAccounts } = useQuery({
    queryKey: ['plan-accounts', 'entries'],
    queryFn: () => financialService.listPlanAccounts({ acceptsEntries: true }),
  });

  const accountChoices = (() => {
    if (!planAccountId || accounts.some((account) => account.id === planAccountId)) {
      return accounts;
    }
    const label = [natureToUpdate?.planAccountCode, natureToUpdate?.planAccountName]
      .filter(Boolean)
      .join(' - ');
    return [{ id: planAccountId, label: label || 'Conta vinculada' }, ...accounts];
  })();

  const mutation = useMutation({
    mutationFn: (dados: OperationNatureInput) =>
      natureId
        ? inboundSetupService.updateNature(natureId, dados)
        : inboundSetupService.createNature(dados),
    onSuccess: (saved) => {
      queryClient.setQueryData(['operation-nature', saved.id], saved);
      queryClient.invalidateQueries({ queryKey: ['operation-natures'] });
      queryClient.invalidateQueries({ queryKey: ['inbound', 'natures'] });
      toast.success(natureId ? 'Natureza atualizada.' : 'Natureza cadastrada.');
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Falha ao salvar a natureza.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => inboundSetupService.deleteNature(natureId ?? ''),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['operation-natures'] });
      queryClient.invalidateQueries({ queryKey: ['inbound', 'natures'] });
      toast.success('Natureza excluída.');
      onDeleted?.();
    },
    onError: (error: Error) => setDeleteError(error.message),
  });

  const changeStock = (next: boolean) => {
    setMovesStock(next);
    if (!next) {
      setUpdatesAverageCost(false);
      setSuggestsListPrice(false);
    }
  };

  const busy = mutation.isPending || deleteMutation.isPending;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!code.trim()) {
      toast.error('Informe o código.');
      return;
    }
    if (!name.trim()) {
      toast.error('Informe o nome.');
      return;
    }
    mutation.mutate({
      code,
      name,
      fiscalPurpose,
      movesStock,
      createsPayable,
      updatesAverageCost: movesStock && updatesAverageCost,
      recordsEntryPrice: movesStock && (natureToUpdate?.recordsEntryPrice ?? false),
      suggestsListPrice: movesStock && suggestsListPrice,
      freightInCost,
      insuranceInCost,
      otherInCost,
      discountInCost,
      ipiInCost,
      stInCost,
      icmsInCost,
      planAccountId: planAccountId || null,
      isActive,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FloatingInput
          label="Código"
          value={code}
          maxLength={20}
          required
          autoFocus
          onChange={(event) => setCode(event.target.value)}
        />
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
      </div>
      <FloatingInput
        label="Nome"
        value={name}
        maxLength={60}
        required
        onChange={(event) => setName(event.target.value)}
      />
      <CatalogSearchSelect
        label="Conta do plano"
        value={planAccountId}
        onChange={setPlanAccountId}
        options={accountChoices}
        placeholder="Buscar conta..."
        emptyMessage="Nenhuma conta encontrada."
        allowClear
        isLoading={loadingAccounts}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <YesNo label="Movimenta estoque" checked={movesStock} onChange={changeStock} />
        <YesNo
          label="Gera contas a pagar"
          checked={createsPayable}
          onChange={setCreatesPayable}
        />
        <YesNo
          label="Atualiza custo médio"
          checked={movesStock && updatesAverageCost}
          disabled={!movesStock}
          onChange={setUpdatesAverageCost}
        />
        <YesNo
          label="Sugere preço de tabela"
          checked={movesStock && suggestsListPrice}
          disabled={!movesStock}
          onChange={setSuggestsListPrice}
        />
        <FloatingSelect
          label="Situação"
          value={isActive ? 'ativo' : 'inativo'}
          pinned
          onChange={(event) => setIsActive(event.target.value === 'ativo')}
        >
          <option value="ativo">Ativo</option>
          <option value="inativo">Inativo</option>
        </FloatingSelect>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium text-[#172337]">Composição do custo</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <YesNo
            label="Inclui frete"
            checked={freightInCost}
            onChange={setFreightInCost}
          />
          <YesNo
            label="Inclui seguro"
            checked={insuranceInCost}
            onChange={setInsuranceInCost}
          />
          <YesNo
            label="Inclui outras despesas"
            checked={otherInCost}
            onChange={setOtherInCost}
          />
          <YesNo
            label="Abate o desconto"
            checked={discountInCost}
            onChange={setDiscountInCost}
          />
          <YesNo label="Inclui IPI" checked={ipiInCost} onChange={setIpiInCost} />
          <YesNo label="Inclui ST" checked={stInCost} onChange={setStInCost} />
          <YesNo label="Inclui ICMS" checked={icmsInCost} onChange={setIcmsInCost} />
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
        ) : null}
        {natureId && onDeleted ? (
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
          {mutation.isPending ? 'Salvando...' : natureId ? 'Atualizar' : 'Cadastrar'}
        </Button>
      </div>

      <AlertDialog open={openDelete} onOpenChange={setOpenDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir natureza</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteError ??
                `Deseja excluir ${name || 'esta natureza'}? Uma natureza usada em nota não pode sair.`}
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
