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
import { useState } from 'react';
import { toast } from 'sonner';

import { PersonSearchSelect } from '@/components/Persons/PersonSearchSelect';
import { Button } from '@/components/ui/button';
import { CatalogSearchSelect } from '@/components/ui/CatalogSearchSelect';
import { FloatingInput, FloatingSelect } from '@/components/ui/FloatingField';
import { financialService, type MeansOfPaymentOption } from '@/services/financials';
import {
  type PaymentMethod,
  type PaymentMethodInput,
  paymentMethodsService,
} from '@/services/paymentMethods';
import { treasuryService } from '@/services/treasury';

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
  if (
    group === 'other' &&
    (draft.name.trim().length < 2 || draft.name.trim().length > 60)
  ) {
    return 'No meio Outros, o nome precisa ter de 2 a 60 caracteres.';
  }
  if (!draft.meansOfPaymentId) return 'Selecione o meio de pagamento.';
  if (!draft.receiptKind) return 'Selecione para onde o valor vai.';
  if (
    !draft.useInQuote &&
    !draft.useInSale &&
    !draft.useInPos &&
    !draft.useInServiceOrder
  ) {
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
  if (draft.receiptKind === 'bank' && !draft.bankAccountId)
    return 'Informe a conta bancária.';
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
  onCancel?: () => void;
}

export function FormPaymentMethod({
  methodToUpdate,
  onSuccess,
  onCancel,
}: FormPaymentMethodProps) {
  const queryClient = useQueryClient();
  const methodId = methodToUpdate?.id;
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
    methodToUpdate?.terms.length
      ? methodToUpdate.terms.map(termFromMethod)
      : [blankTerm()],
  );

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
    receiptKind === 'acquirer_receivable' ||
    integrationType === 'integrated' ||
    showIntegration;
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
        if (patch.interestType === 'none' || patch.interestType === 'issuer') {
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
      queryClient.setQueryData(['payment-method', saved.id], saved);
      queryClient.invalidateQueries({ queryKey: ['payment-methods'] });
      toast.success(
        methodId
          ? 'Forma de pagamento atualizada com sucesso!'
          : 'Forma de pagamento cadastrada com sucesso!',
      );
      onSuccess?.();
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
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FloatingInput
          label="Código"
          value={code}
          maxLength={15}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          required
          autoFocus
        />
        <FloatingInput
          label="Ordem"
          inputMode="numeric"
          value={sortOrder}
          onChange={(event) => setSortOrder(event.target.value)}
        />
      </div>

      <div className="space-y-1">
        <FloatingInput
          label="Nome"
          value={name}
          maxLength={60}
          onChange={(event) => setName(event.target.value)}
          required
        />
        {group === 'other' ? (
          <p className="text-xs text-[#64748b]">
            Este nome vai na NF-e como descrição do pagamento, de 2 a 60 caracteres.
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <CatalogSearchSelect
          label="Meio de pagamento"
          value={meansOfPaymentId}
          onChange={(id) => applyMean(id, means)}
          options={means}
          placeholder="Buscar meio..."
          emptyMessage="Nenhum meio selecionável."
          isLoading={loadingMeans}
          required
        />
        <div className="space-y-1">
          <FloatingSelect
            label="Recebimento"
            value={receiptKind}
            pinned={Boolean(receiptKind)}
            required
            onChange={(event) => {
              const next = event.target.value as PaymentReceiptKind | '';
              setReceiptKind(next);
              if (next !== 'acquirer_receivable') setSettlementDays('');
            }}
          >
            <option value="" disabled>
              Selecione o recebimento
            </option>
            {paymentReceiptKinds.map((kind) => (
              <option key={kind} value={kind}>
                {paymentReceiptKindLabels[kind]}
              </option>
            ))}
          </FloatingSelect>
          {receiptKind === 'store_credit' ? (
            <p className="text-xs text-[#64748b]">
              A forma pode ser salva. Venda e PDV recusam este pagamento até existir o
              saldo do cliente.
            </p>
          ) : null}
        </div>
      </div>

      {showIntegration || showBrand || showAcquirer || showBank || showSettlement ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {showIntegration ? (
            <FloatingSelect
              label="Integração"
              value={integrationType}
              pinned={Boolean(integrationType)}
              required
              onChange={(event) =>
                setIntegrationType(event.target.value as PaymentIntegrationType | '')
              }
            >
              <option value="" disabled>
                Selecione a integração
              </option>
              {paymentIntegrationTypes.map((item) => (
                <option key={item} value={item}>
                  {paymentIntegrationTypeLabels[item]}
                </option>
              ))}
            </FloatingSelect>
          ) : null}
          {showBrand ? (
            <CatalogSearchSelect
              label="Bandeira"
              value={cardBrandId}
              onChange={setCardBrandId}
              options={brands}
              placeholder="Buscar bandeira..."
              allowClear={integrationType !== 'not_integrated'}
              isLoading={loadingBrands}
              required={integrationType === 'not_integrated'}
            />
          ) : null}
          {showAcquirer ? (
            <PersonSearchSelect
              label="Credenciadora"
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
          ) : null}
          {showBank ? (
            <CatalogSearchSelect
              label="Conta bancária"
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
          ) : null}
          {showSettlement ? (
            <div className="space-y-1">
              <FloatingInput
                label="Dias até o crédito"
                inputMode="numeric"
                value={settlementDays}
                onChange={(event) => setSettlementDays(event.target.value)}
              />
              <p className="text-xs text-[#64748b]">
                Obrigatório quando alguma condição usa juros do emissor.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {(
          [
            ['Orçamento', useInQuote, setUseInQuote],
            ['Venda', useInSale, setUseInSale],
            ['PDV', useInPos, setUseInPos],
            ['Ordem de serviço', useInServiceOrder, setUseInServiceOrder],
          ] as const
        ).map(([label, checked, setChecked]) => (
          <FloatingSelect
            key={label}
            label={label}
            value={checked ? 'sim' : 'nao'}
            pinned
            onChange={(event) => setChecked(event.target.value === 'sim')}
          >
            <option value="sim">Sim</option>
            <option value="nao">Não</option>
          </FloatingSelect>
        ))}
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
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-[#172337]">Condições</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setTerms((current) => [...current, blankTerm()])}
          >
            <Plus className="h-4 w-4" /> Condição
          </Button>
        </div>
        <p className="text-xs text-[#64748b]">
          100 basis points = 1,00%. A taxa administrativa é custo da loja e não entra no
          total do cliente.
        </p>
        <div className="space-y-3">
          {terms.map((term) => {
            const count = parseCount(term.installmentCount);
            const rateLocked =
              term.interestType === 'none' || term.interestType === 'issuer';
            return (
              <div
                key={term.key}
                className="grid gap-3 rounded-md border border-zinc-200 p-3 md:grid-cols-4"
              >
                <FloatingInput
                  label="Parcelas"
                  inputMode="numeric"
                  value={term.installmentCount}
                  onChange={(event) =>
                    updateTerm(term.key, { installmentCount: event.target.value })
                  }
                />
                <FloatingInput
                  label="1ª em dias"
                  inputMode="numeric"
                  value={term.firstDueDays}
                  onChange={(event) =>
                    updateTerm(term.key, { firstDueDays: event.target.value })
                  }
                />
                <FloatingInput
                  label="Intervalo"
                  inputMode="numeric"
                  value={term.intervalDays}
                  disabled={count === 1}
                  onChange={(event) =>
                    updateTerm(term.key, { intervalDays: event.target.value })
                  }
                />
                <FloatingSelect
                  label="Juros"
                  value={term.interestType}
                  pinned
                  onChange={(event) =>
                    updateTerm(term.key, {
                      interestType: event.target.value as PaymentInterestType,
                    })
                  }
                >
                  {paymentInterestTypes.map((item) => (
                    <option key={item} value={item}>
                      {paymentInterestTypeLabels[item]}
                    </option>
                  ))}
                </FloatingSelect>
                <FloatingInput
                  label="Juros (bps)"
                  inputMode="numeric"
                  value={term.interestRateBps}
                  disabled={rateLocked}
                  onChange={(event) =>
                    updateTerm(term.key, { interestRateBps: event.target.value })
                  }
                />
                <FloatingInput
                  label="Taxa adm. (bps)"
                  inputMode="numeric"
                  value={term.administrativeFeeBps}
                  onChange={(event) =>
                    updateTerm(term.key, { administrativeFeeBps: event.target.value })
                  }
                />
                <FloatingInput
                  label="Taxa fixa"
                  inputMode="decimal"
                  value={term.fixedFeeAmount}
                  pinned={Boolean(term.fixedFeeAmount)}
                  onChange={(event) =>
                    updateTerm(term.key, {
                      fixedFeeAmount: maskCurrencyInput(event.target.value),
                    })
                  }
                />
                <div className="flex items-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remover condição"
                    disabled={terms.length === 1}
                    onClick={() =>
                      setTerms((current) =>
                        current.filter((item) => item.key !== term.key),
                      )
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

      <div className="flex flex-wrap justify-end gap-2">
        {onCancel ? (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={mutation.isPending}
          >
            Cancelar
          </Button>
        ) : null}
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Salvando...' : methodId ? 'Atualizar' : 'Cadastrar'}
        </Button>
      </div>
    </form>
  );
}
