import {
  formatCurrencyInput,
  maskCurrencyInput,
  type MeansFiscalGroup,
  parseCurrencyToCents,
  type PaymentIntegrationType,
  paymentIntegrationTypeLabels,
  paymentIntegrationTypes,
  type PaymentInterestType,
  paymentInterestTypeLabels,
  paymentInterestTypes,
  type PaymentReceiptKind,
  paymentReceiptKindLabels,
  paymentReceiptKinds,
} from '@erp-360/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { PersonSearchSelect } from '@/components/Persons/PersonSearchSelect';
import { Button } from '@/components/ui/button';
import { CatalogSearchSelect } from '@/components/ui/CatalogSearchSelect';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { financialService, type MeansOfPaymentOption } from '@/services/financials';
import {
  type PaymentMethod,
  type PaymentMethodInput,
  paymentMethodsService,
} from '@/services/paymentMethods';
import { treasuryService } from '@/services/treasury';

const selectClassName =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

type TermDraft = {
  key: string;
  installmentCount: string;
  firstDueDays: string;
  intervalDays: string;
  interestType: PaymentInterestType;
  interestRateBps: string;
  administrativeFeeBps: string;
  fixedFeeAmount: string;
};

function blankTerm(): TermDraft {
  return {
    key: crypto.randomUUID(),
    installmentCount: '1',
    firstDueDays: '0',
    intervalDays: '0',
    interestType: 'none',
    interestRateBps: '0',
    administrativeFeeBps: '0',
    fixedFeeAmount: '',
  };
}

function termFromMethod(term: PaymentMethod['terms'][number]): TermDraft {
  return {
    key: term.id,
    installmentCount: String(term.installmentCount),
    firstDueDays: String(term.firstDueDays),
    intervalDays: String(term.intervalDays),
    interestType: term.interestType,
    interestRateBps: String(term.interestRateBps),
    administrativeFeeBps: String(term.administrativeFeeBps),
    fixedFeeAmount: term.fixedFeeAmount ? formatCurrencyInput(term.fixedFeeAmount) : '',
  };
}

function parseCount(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function needsIntegration(group: MeansFiscalGroup | undefined) {
  return group === 'card' || group === 'electronic';
}

function draftMessage(
  draft: {
    code: string;
    name: string;
    meansOfPaymentId: string;
    receiptKind: PaymentReceiptKind | '';
    settlementDays: string;
    integrationType: PaymentIntegrationType | '';
    acquirerId: string;
    cardBrandId: string;
    bankAccountId: string;
    useInQuote: boolean;
    useInSale: boolean;
    useInPos: boolean;
    useInServiceOrder: boolean;
    terms: TermDraft[];
  },
  group: MeansFiscalGroup | undefined,
): string | null {
  if (!/^[A-Z0-9][A-Z0-9-]{0,14}$/.test(draft.code)) {
    return 'O código usa letras, números e hífen, em maiúsculas.';
  }
  if (!draft.name.trim()) return 'Informe o nome da forma.';
  if (group === 'other' && (draft.name.trim().length < 2 || draft.name.trim().length > 60)) {
    return 'No meio Outros, o nome precisa ter de 2 a 60 caracteres.';
  }
  if (!draft.meansOfPaymentId) return 'Selecione o meio de pagamento.';
  if (!draft.receiptKind) return 'Selecione para onde o valor vai.';
  if (!draft.useInQuote && !draft.useInSale && !draft.useInPos && !draft.useInServiceOrder) {
    return 'Marque ao menos um uso: orçamento, venda, PDV ou ordem de serviço.';
  }
  if (needsIntegration(group) && !draft.integrationType) {
    return 'Informe se o pagamento é integrado.';
  }
  if (
    group === 'card' &&
    draft.integrationType === 'not_integrated' &&
    !draft.cardBrandId
  ) {
    return 'No cartão não integrado, informe a bandeira.';
  }
  if (draft.receiptKind === 'bank' && !draft.bankAccountId) return 'Informe a conta bancária.';
  if (draft.receiptKind === 'acquirer_receivable' && !draft.acquirerId) {
    return 'Informe a credenciadora.';
  }
  if (draft.integrationType === 'integrated' && !draft.acquirerId) {
    return 'O pagamento integrado exige a credenciadora.';
  }
  if (draft.terms.length === 0) return 'Informe ao menos uma condição.';

  const counts = draft.terms.map((term) => parseCount(term.installmentCount));
  if (new Set(counts).size !== counts.length) {
    return 'Cada quantidade de parcelas só pode aparecer uma vez.';
  }

  const settlement = draft.settlementDays.trim()
    ? parseCount(draft.settlementDays)
    : null;
  if (
    settlement !== null &&
    (!Number.isFinite(settlement) || settlement < 0 || settlement > 365)
  ) {
    return 'Os dias até o crédito vão de 0 a 365.';
  }
  if (
    draft.receiptKind === 'acquirer_receivable' &&
    draft.terms.some((term) => term.interestType === 'issuer') &&
    settlement === null
  ) {
    return 'Informe os dias até o crédito da credenciadora.';
  }

  for (const term of draft.terms) {
    const count = parseCount(term.installmentCount);
    const firstDue = parseCount(term.firstDueDays);
    const interval = parseCount(term.intervalDays);
    const rate = parseCount(term.interestRateBps);
    const fee = parseCount(term.administrativeFeeBps);
    if (
      !Number.isFinite(count) ||
      !Number.isFinite(firstDue) ||
      !Number.isFinite(interval) ||
      !Number.isFinite(rate) ||
      !Number.isFinite(fee)
    ) {
      return 'Informe números inteiros nas condições.';
    }
    if (count < 1 || count > 48) return 'A quantidade de parcelas vai de 1 a 48.';
    if (firstDue < 0 || firstDue > 365) return 'A carência vai de 0 a 365 dias.';
    if (count === 1 && interval !== 0) return 'À vista não tem intervalo entre parcelas.';
    if (count > 1 && (interval < 1 || interval > 365)) {
      return 'Informe o intervalo entre as parcelas.';
    }
    const rateFree = term.interestType === 'none' || term.interestType === 'issuer';
    if (rate < 0 || rate > 10000 || fee < 0 || fee > 10000) {
      return 'A taxa vai de 0 a 10000 basis points.';
    }
    if (rateFree && rate !== 0) return 'Esta condição não leva taxa de juros.';
    if (!rateFree && rate <= 0) return 'Informe a taxa de juros em basis points.';
  }
  return null;
}

interface FormPaymentMethodProps {
  methodToUpdate?: PaymentMethod | null;
  onSuccess?: () => void;
}

export function FormPaymentMethod({ methodToUpdate, onSuccess }: FormPaymentMethodProps) {
  const queryClient = useQueryClient();
  const [methodId, setMethodId] = useState(methodToUpdate?.id);
  const [code, setCode] = useState(methodToUpdate?.code ?? '');
  const [name, setName] = useState(methodToUpdate?.name ?? '');
  const [meansOfPaymentId, setMeansOfPaymentId] = useState(
    methodToUpdate?.meansOfPaymentId ?? '',
  );
  const [isActive, setIsActive] = useState(methodToUpdate?.isActive !== false);
  const [receiptKind, setReceiptKind] = useState<PaymentReceiptKind | ''>(
    methodToUpdate?.receiptKind ?? '',
  );
  const [settlementDays, setSettlementDays] = useState(
    methodToUpdate?.settlementDays != null ? String(methodToUpdate.settlementDays) : '',
  );
  const [integrationType, setIntegrationType] = useState<PaymentIntegrationType | ''>(
    methodToUpdate?.integrationType ?? '',
  );
  const [acquirerId, setAcquirerId] = useState(methodToUpdate?.acquirerId ?? '');
  const [cardBrandId, setCardBrandId] = useState(methodToUpdate?.cardBrandId ?? '');
  const [bankAccountId, setBankAccountId] = useState(methodToUpdate?.bankAccountId ?? '');
  const [useInQuote, setUseInQuote] = useState(methodToUpdate?.useInQuote !== false);
  const [useInSale, setUseInSale] = useState(methodToUpdate?.useInSale !== false);
  const [useInPos, setUseInPos] = useState(methodToUpdate?.useInPos !== false);
  const [useInServiceOrder, setUseInServiceOrder] = useState(
    methodToUpdate?.useInServiceOrder !== false,
  );
  const [sortOrder, setSortOrder] = useState(String(methodToUpdate?.sortOrder ?? 0));
  const [terms, setTerms] = useState<TermDraft[]>(
    methodToUpdate?.terms.length ? methodToUpdate.terms.map(termFromMethod) : [blankTerm()],
  );

  const { data: loaded } = useQuery({
    queryKey: ['payment-method', methodId],
    enabled: Boolean(methodId),
    staleTime: 0,
    queryFn: () => paymentMethodsService.get(methodId!),
  });

  useEffect(() => {
    const method = loaded ?? methodToUpdate;
    if (!method) return;
    setCode(method.code);
    setName(method.name);
    setMeansOfPaymentId(method.meansOfPaymentId);
    setIsActive(method.isActive);
    setReceiptKind(method.receiptKind);
    setSettlementDays(method.settlementDays != null ? String(method.settlementDays) : '');
    setIntegrationType(method.integrationType ?? '');
    setAcquirerId(method.acquirerId ?? '');
    setCardBrandId(method.cardBrandId ?? '');
    setBankAccountId(method.bankAccountId ?? '');
    setUseInQuote(method.useInQuote);
    setUseInSale(method.useInSale);
    setUseInPos(method.useInPos);
    setUseInServiceOrder(method.useInServiceOrder);
    setSortOrder(String(method.sortOrder));
    setTerms(method.terms.length ? method.terms.map(termFromMethod) : [blankTerm()]);
  }, [loaded, methodToUpdate]);

  const { data: means = [], isLoading: loadingMeans } = useQuery({
    queryKey: ['financial', 'means-of-payment'],
    queryFn: () => financialService.listMeansOfPayment(),
  });
  const { data: brands = [], isLoading: loadingBrands } = useQuery({
    queryKey: ['financial', 'card-brands'],
    queryFn: () => financialService.listCardBrands(),
  });
  const { data: accounts = [], isLoading: loadingAccounts } = useQuery({
    queryKey: ['treasury', 'bank-accounts'],
    queryFn: () => treasuryService.bankAccounts(),
  });

  const selectedMean = means.find((item) => item.id === meansOfPaymentId);
  const group = selectedMean?.fiscalGroup;
  const showIntegration = needsIntegration(group);
  const showBrand = group === 'card';
  const showAcquirer =
    receiptKind === 'acquirer_receivable' || integrationType === 'integrated' || showIntegration;
  const showBank = receiptKind === 'bank' || receiptKind === 'acquirer_receivable';
  const showSettlement = receiptKind === 'acquirer_receivable';

  const applyMean = (id: string, options: MeansOfPaymentOption[]) => {
    const next = options.find((item) => item.id === id);
    setMeansOfPaymentId(id);
    if (!needsIntegration(next?.fiscalGroup)) setIntegrationType('');
    if (next?.fiscalGroup !== 'card') setCardBrandId('');
  };

  const updateTerm = (key: string, patch: Partial<TermDraft>) => {
    setTerms((current) =>
      current.map((term) => {
        if (term.key !== key) return term;
        const next = { ...term, ...patch };
        if (patch.installmentCount != null) {
          const count = parseCount(patch.installmentCount);
          if (count === 1) next.intervalDays = '0';
          else if (parseCount(next.intervalDays) === 0) next.intervalDays = '30';
        }
        if (
          patch.interestType === 'none' ||
          patch.interestType === 'issuer'
        ) {
          next.interestRateBps = '0';
        }
        return next;
      }),
    );
  };

  const mutation = useMutation({
    mutationFn: (dados: PaymentMethodInput) =>
      methodId
        ? paymentMethodsService.update(methodId, dados)
        : paymentMethodsService.create(dados),
    onSuccess: (saved) => {
      const created = !methodId;
      setMethodId(saved.id);
      queryClient.setQueryData(['payment-method', saved.id], saved);
      queryClient.invalidateQueries({ queryKey: ['payment-methods'] });
      onSuccess?.();
      toast.success(
        created
          ? 'Forma de pagamento cadastrada com sucesso!'
          : 'Forma de pagamento atualizada com sucesso!',
      );
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Falha ao salvar a forma de pagamento.');
    },
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const normalizedCode = code.trim().toUpperCase();
    const message = draftMessage(
      {
        code: normalizedCode,
        name,
        meansOfPaymentId,
        receiptKind,
        settlementDays: showSettlement ? settlementDays : '',
        integrationType: showIntegration ? integrationType : '',
        acquirerId: showAcquirer ? acquirerId : '',
        cardBrandId: showBrand ? cardBrandId : '',
        bankAccountId: showBank ? bankAccountId : '',
        useInQuote,
        useInSale,
        useInPos,
        useInServiceOrder,
        terms,
      },
      group,
    );
    if (message || !receiptKind) {
      toast.error(message || 'Selecione para onde o valor vai.');
      return;
    }
    const order = parseCount(sortOrder);
    mutation.mutate({
      code: normalizedCode,
      name: name.trim(),
      meansOfPaymentId,
      isActive,
      receiptKind,
      settlementDays:
        showSettlement && settlementDays.trim() ? parseCount(settlementDays) : null,
      integrationType: showIntegration && integrationType ? integrationType : null,
      acquirerId: showAcquirer && acquirerId ? acquirerId : null,
      cardBrandId: showBrand && cardBrandId ? cardBrandId : null,
      bankAccountId: showBank && bankAccountId ? bankAccountId : null,
      useInQuote,
      useInSale,
      useInPos,
      useInServiceOrder,
      sortOrder: Number.isFinite(order) ? order : 0,
      terms: terms.map((term) => ({
        installmentCount: parseCount(term.installmentCount),
        firstDueDays: parseCount(term.firstDueDays),
        intervalDays: parseCount(term.intervalDays),
        interestType: term.interestType,
        interestRateBps: parseCount(term.interestRateBps),
        administrativeFeeBps: parseCount(term.administrativeFeeBps),
        fixedFeeAmount: parseCurrencyToCents(term.fixedFeeAmount),
      })),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-2">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="paymentMethodCode">Código</Label>
          <Input
            id="paymentMethodCode"
            value={code}
            maxLength={15}
            className="uppercase"
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="paymentMethodSort">Ordem</Label>
          <Input
            id="paymentMethodSort"
            inputMode="numeric"
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="paymentMethodName">Nome</Label>
        <Input
          id="paymentMethodName"
          value={name}
          maxLength={60}
          onChange={(event) => setName(event.target.value)}
          required
        />
        {group === 'other' ? (
          <p className="text-xs text-zinc-500">
            Este nome vai na NF-e como descrição do pagamento, de 2 a 60 caracteres.
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Meio de pagamento</Label>
          <CatalogSearchSelect
            value={meansOfPaymentId}
            onChange={(id) => applyMean(id, means)}
            options={means}
            placeholder="Buscar meio..."
            emptyMessage="Nenhum meio selecionável."
            isLoading={loadingMeans}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="paymentReceiptKind">Recebimento</Label>
          <select
            id="paymentReceiptKind"
            value={receiptKind}
            onChange={(event) => {
              const next = event.target.value as PaymentReceiptKind | '';
              setReceiptKind(next);
              if (next !== 'acquirer_receivable') setSettlementDays('');
            }}
            className={selectClassName}
            required
          >
            <option value="" disabled>
              Selecione o recebimento
            </option>
            {paymentReceiptKinds.map((kind) => (
              <option key={kind} value={kind}>
                {paymentReceiptKindLabels[kind]}
              </option>
            ))}
          </select>
          {receiptKind === 'store_credit' ? (
            <p className="text-xs text-zinc-500">
              A forma pode ser salva. Venda e PDV recusam este pagamento até existir o saldo do
              cliente.
            </p>
          ) : null}
        </div>
      </div>

      {showIntegration || showBrand || showAcquirer || showBank || showSettlement ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {showIntegration ? (
            <div className="space-y-1">
              <Label htmlFor="paymentIntegration">Integração</Label>
              <select
                id="paymentIntegration"
                value={integrationType}
                onChange={(event) =>
                  setIntegrationType(event.target.value as PaymentIntegrationType | '')
                }
                className={selectClassName}
                required
              >
                <option value="" disabled>
                  Selecione a integração
                </option>
                {paymentIntegrationTypes.map((item) => (
                  <option key={item} value={item}>
                    {paymentIntegrationTypeLabels[item]}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {showBrand ? (
            <div className="space-y-1">
              <Label>Bandeira</Label>
              <CatalogSearchSelect
                value={cardBrandId}
                onChange={setCardBrandId}
                options={brands}
                placeholder="Buscar bandeira..."
                allowClear={integrationType !== 'not_integrated'}
                isLoading={loadingBrands}
                required={integrationType === 'not_integrated'}
              />
            </div>
          ) : null}
          {showAcquirer ? (
            <div className="space-y-1">
              <Label>Credenciadora</Label>
              <PersonSearchSelect
                value={acquirerId}
                onChange={setAcquirerId}
                type="instituicao"
                placeholder="Buscar instituição financeira..."
                allowClear={
                  receiptKind !== 'acquirer_receivable' && integrationType !== 'integrated'
                }
                required={
                  receiptKind === 'acquirer_receivable' || integrationType === 'integrated'
                }
              />
            </div>
          ) : null}
          {showBank ? (
            <div className="space-y-1">
              <Label>Conta bancária</Label>
              <CatalogSearchSelect
                value={bankAccountId}
                onChange={setBankAccountId}
                options={accounts.map((account) => ({
                  id: account.id,
                  label: account.name,
                }))}
                placeholder="Buscar conta..."
                allowClear={receiptKind !== 'bank'}
                isLoading={loadingAccounts}
                required={receiptKind === 'bank'}
              />
            </div>
          ) : null}
          {showSettlement ? (
            <div className="space-y-1">
              <Label htmlFor="settlementDays">Dias até o crédito</Label>
              <Input
                id="settlementDays"
                inputMode="numeric"
                value={settlementDays}
                onChange={(event) => setSettlementDays(event.target.value)}
              />
              <p className="text-xs text-zinc-500">
                Obrigatório quando alguma condição usa juros do emissor.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-4">
        {(
          [
            ['useInQuote', 'Orçamento', useInQuote, setUseInQuote],
            ['useInSale', 'Venda', useInSale, setUseInSale],
            ['useInPos', 'PDV', useInPos, setUseInPos],
            ['useInServiceOrder', 'Ordem de serviço', useInServiceOrder, setUseInServiceOrder],
          ] as const
        ).map(([id, label, checked, setChecked]) => (
          <div key={id} className="flex items-center space-x-2">
            <Checkbox
              id={id}
              checked={checked}
              onCheckedChange={(value) => setChecked(value === true)}
            />
            <label htmlFor={id} className="text-sm font-medium">
              {label}
            </label>
          </div>
        ))}
        <div className="flex items-center space-x-2">
          <Checkbox
            id="paymentMethodActive"
            checked={isActive}
            onCheckedChange={(value) => setIsActive(value === true)}
          />
          <label htmlFor="paymentMethodActive" className="text-sm font-medium">
            Ativa
          </label>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Condições</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setTerms((current) => [...current, blankTerm()])}
          >
            <Plus className="h-4 w-4" /> Condição
          </Button>
        </div>
        <p className="text-xs text-zinc-500">
          100 basis points = 1,00%. A taxa administrativa é custo da loja e não entra no total do
          cliente.
        </p>
        <div className="space-y-3">
          {terms.map((term) => {
            const count = parseCount(term.installmentCount);
            const rateLocked = term.interestType === 'none' || term.interestType === 'issuer';
            return (
              <div
                key={term.key}
                className="grid gap-2 rounded-md border border-zinc-200 p-3 md:grid-cols-4"
              >
                <div className="space-y-1">
                  <Label htmlFor={`${term.key}-count`}>Parcelas</Label>
                  <Input
                    id={`${term.key}-count`}
                    inputMode="numeric"
                    value={term.installmentCount}
                    onChange={(event) =>
                      updateTerm(term.key, { installmentCount: event.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`${term.key}-first`}>1ª em dias</Label>
                  <Input
                    id={`${term.key}-first`}
                    inputMode="numeric"
                    value={term.firstDueDays}
                    onChange={(event) =>
                      updateTerm(term.key, { firstDueDays: event.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`${term.key}-interval`}>Intervalo</Label>
                  <Input
                    id={`${term.key}-interval`}
                    inputMode="numeric"
                    value={term.intervalDays}
                    disabled={count === 1}
                    onChange={(event) =>
                      updateTerm(term.key, { intervalDays: event.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`${term.key}-interest`}>Juros</Label>
                  <select
                    id={`${term.key}-interest`}
                    value={term.interestType}
                    onChange={(event) =>
                      updateTerm(term.key, {
                        interestType: event.target.value as PaymentInterestType,
                      })
                    }
                    className={selectClassName}
                  >
                    {paymentInterestTypes.map((item) => (
                      <option key={item} value={item}>
                        {paymentInterestTypeLabels[item]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`${term.key}-rate`}>Juros (bps)</Label>
                  <Input
                    id={`${term.key}-rate`}
                    inputMode="numeric"
                    value={term.interestRateBps}
                    disabled={rateLocked}
                    onChange={(event) =>
                      updateTerm(term.key, { interestRateBps: event.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`${term.key}-mdr`}>Taxa adm. (bps)</Label>
                  <Input
                    id={`${term.key}-mdr`}
                    inputMode="numeric"
                    value={term.administrativeFeeBps}
                    onChange={(event) =>
                      updateTerm(term.key, { administrativeFeeBps: event.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`${term.key}-fee`}>Taxa fixa</Label>
                  <Input
                    id={`${term.key}-fee`}
                    inputMode="decimal"
                    value={term.fixedFeeAmount}
                    onChange={(event) =>
                      updateTerm(term.key, {
                        fixedFeeAmount: maskCurrencyInput(event.target.value),
                      })
                    }
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remover condição"
                    disabled={terms.length === 1}
                    onClick={() =>
                      setTerms((current) => current.filter((item) => item.key !== term.key))
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>
    </form>
  );
}
