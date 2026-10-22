import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { financialService } from '@/services/financials';
import {
  type FiscalPurpose,
  inboundSetupService,
  type OperationNature,
  type OperationNatureInput,
} from '@/services/inboundSetup';

import { fiscalPurposeLabels, fiscalPurposes, selectClassName } from './labels';

function Flag({
  id,
  label,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center space-x-2">
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onChange(!!value)}
      />
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
    </div>
  );
}

interface FormNatureProps {
  natureToUpdate?: OperationNature | null;
  onSuccess?: () => void;
}

export function FormNature({ natureToUpdate, onSuccess }: FormNatureProps) {
  const queryClient = useQueryClient();
  const [natureId, setNatureId] = useState(natureToUpdate?.id);
  const [code, setCode] = useState(natureToUpdate?.code ?? '');
  const [name, setName] = useState(natureToUpdate?.name ?? '');
  const [fiscalPurpose, setFiscalPurpose] = useState<FiscalPurpose>(
    natureToUpdate?.fiscalPurpose ?? 'resale',
  );
  const [movesStock, setMovesStock] = useState(natureToUpdate?.movesStock === true);
  const [createsPayable, setCreatesPayable] = useState(natureToUpdate?.createsPayable !== false);
  const [updatesAverageCost, setUpdatesAverageCost] = useState(
    natureToUpdate?.updatesAverageCost === true,
  );
  const [suggestsListPrice, setSuggestsListPrice] = useState(
    natureToUpdate?.suggestsListPrice === true,
  );
  const [freightInCost, setFreightInCost] = useState(natureToUpdate?.freightInCost !== false);
  const [insuranceInCost, setInsuranceInCost] = useState(natureToUpdate?.insuranceInCost !== false);
  const [otherInCost, setOtherInCost] = useState(natureToUpdate?.otherInCost !== false);
  const [discountInCost, setDiscountInCost] = useState(natureToUpdate?.discountInCost !== false);
  const [ipiInCost, setIpiInCost] = useState(natureToUpdate?.ipiInCost === true);
  const [stInCost, setStInCost] = useState(natureToUpdate?.stInCost !== false);
  const [icmsInCost, setIcmsInCost] = useState(natureToUpdate?.icmsInCost === true);
  const [planAccountId, setPlanAccountId] = useState(natureToUpdate?.planAccountId ?? '');
  const [isActive, setIsActive] = useState(natureToUpdate?.isActive !== false);

  const { data: loaded } = useQuery({
    queryKey: ['operation-nature', natureId],
    enabled: Boolean(natureId),
    staleTime: 0,
    queryFn: () => inboundSetupService.getNature(natureId!),
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['plan-accounts', 'entries'],
    queryFn: () => financialService.listPlanAccounts({ acceptsEntries: true }),
  });

  useEffect(() => {
    if (!loaded && !natureToUpdate) return;
    const nature = { ...natureToUpdate, ...loaded };
    setCode(nature.code ?? '');
    setName(nature.name ?? '');
    setFiscalPurpose(nature.fiscalPurpose ?? 'resale');
    setMovesStock(nature.movesStock === true);
    setCreatesPayable(nature.createsPayable !== false);
    setUpdatesAverageCost(nature.updatesAverageCost === true);
    setSuggestsListPrice(nature.suggestsListPrice === true);
    setFreightInCost(nature.freightInCost !== false);
    setInsuranceInCost(nature.insuranceInCost !== false);
    setOtherInCost(nature.otherInCost !== false);
    setDiscountInCost(nature.discountInCost !== false);
    setIpiInCost(nature.ipiInCost === true);
    setStInCost(nature.stInCost !== false);
    setIcmsInCost(nature.icmsInCost === true);
    setPlanAccountId(nature.planAccountId ?? '');
    setIsActive(nature.isActive !== false);
  }, [loaded, natureToUpdate]);

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
      const created = !natureId;
      setNatureId(saved.id);
      queryClient.setQueryData(['operation-nature', saved.id], saved);
      queryClient.invalidateQueries({ queryKey: ['operation-natures'] });
      queryClient.invalidateQueries({ queryKey: ['inbound', 'natures'] });
      onSuccess?.();
      toast.success(created ? 'Natureza cadastrada.' : 'Natureza atualizada.');
    },
    onError: (error) => {
      toast.error(error.message || 'Falha ao salvar a natureza.');
    },
  });

  const changeStock = (next: boolean) => {
    setMovesStock(next);
    if (!next) {
      setUpdatesAverageCost(false);
      setSuggestsListPrice(false);
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate({
      code,
      name,
      fiscalPurpose,
      movesStock,
      createsPayable,
      updatesAverageCost: movesStock && updatesAverageCost,
      recordsEntryPrice:
        movesStock && (loaded?.recordsEntryPrice ?? natureToUpdate?.recordsEntryPrice ?? false),
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
    <form onSubmit={handleSubmit} className="space-y-4 pt-2">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="natureCode">
            Código <span className="text-destructive">*</span>
          </Label>
          <Input
            id="natureCode"
            value={code}
            maxLength={20}
            required
            onChange={(event) => setCode(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="naturePurpose">Finalidade</Label>
          <select
            id="naturePurpose"
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
      </div>
      <div className="space-y-1">
        <Label htmlFor="natureName">
          Nome <span className="text-destructive">*</span>
        </Label>
        <Input
          id="natureName"
          value={name}
          maxLength={60}
          required
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="natureAccount">Conta do plano</Label>
        <select
          id="natureAccount"
          value={planAccountId}
          onChange={(event) => setPlanAccountId(event.target.value)}
          className={selectClassName}
        >
          <option value="">Nenhuma</option>
          {accountChoices.map((account) => (
            <option key={account.id} value={account.id}>
              {account.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Flag id="natureStock" label="Movimenta estoque" checked={movesStock} onChange={changeStock} />
        <Flag
          id="naturePayable"
          label="Gera contas a pagar"
          checked={createsPayable}
          onChange={setCreatesPayable}
        />
        <Flag
          id="natureCost"
          label="Atualiza custo médio"
          checked={movesStock && updatesAverageCost}
          disabled={!movesStock}
          onChange={setUpdatesAverageCost}
        />
        <Flag
          id="naturePrice"
          label="Sugere preço de tabela"
          checked={movesStock && suggestsListPrice}
          disabled={!movesStock}
          onChange={setSuggestsListPrice}
        />
        <Flag id="natureActive" label="Ativa" checked={isActive} onChange={setIsActive} />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-zinc-900">Composição do custo</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Flag id="natureFreight" label="Inclui frete" checked={freightInCost} onChange={setFreightInCost} />
          <Flag
            id="natureInsurance"
            label="Inclui seguro"
            checked={insuranceInCost}
            onChange={setInsuranceInCost}
          />
          <Flag
            id="natureOther"
            label="Inclui outras despesas"
            checked={otherInCost}
            onChange={setOtherInCost}
          />
          <Flag
            id="natureDiscount"
            label="Abate o desconto"
            checked={discountInCost}
            onChange={setDiscountInCost}
          />
          <Flag id="natureIpi" label="Inclui IPI" checked={ipiInCost} onChange={setIpiInCost} />
          <Flag id="natureSt" label="Inclui ST" checked={stInCost} onChange={setStInCost} />
          <Flag id="natureIcms" label="Inclui ICMS" checked={icmsInCost} onChange={setIcmsInCost} />
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Salvando...' : natureId ? 'Atualizar' : 'Cadastrar'}
        </Button>
      </div>
    </form>
  );
}
