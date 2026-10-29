import {
  civilDate,
  formatCurrency,
  formatCurrencyInput,
  formatRawDate,
  maskCurrencyInput,
  parseCurrencyToCents,
  type PaymentIntegrationType,
} from '@erp-360/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { PersonSearchSelect } from '@/components/Persons/PersonSearchSelect';
import { Button } from '@/components/ui/button';
import { CatalogSearchSelect } from '@/components/ui/CatalogSearchSelect';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  type CreateReceivableInput,
  type FinancialAccount,
  financialService,
} from '@/services/financials';
import { type PaymentMethod, paymentMethodsService } from '@/services/paymentMethods';
import { type BankAccount, treasuryService } from '@/services/treasury';

import {
  instrumentProfile,
  type InstrumentField,
  visibleInstrumentFields,
} from './receivableInstrument';

interface ReceivableFormProps {
  accountToUpdate?: FinancialAccount | null;
  readOnly?: boolean;
  onSuccess: () => void;
  onReplicate?: () => void;
}

interface MethodOption {
  id: string;
  label: string;
  meansOfPaymentId: string;
  integrationType: PaymentIntegrationType | null;
  acquirerId: string | null;
  cardBrandId: string | null;
  bankAccountId: string | null;
}

function toMethodOption(method: PaymentMethod): MethodOption {
  return {
    id: method.id,
    label: `${method.code} - ${method.name}`,
    meansOfPaymentId: method.meansOfPaymentId,
    integrationType: method.integrationType,
    acquirerId: method.acquirerId,
    cardBrandId: method.cardBrandId,
    bankAccountId: method.bankAccountId,
  };
}

function institutionIdOf(method: MethodOption, accounts: BankAccount[]): string {
  if (method.acquirerId) return method.acquirerId;
  if (!method.bankAccountId) return '';
  return (
    accounts.find((account) => account.id === method.bankAccountId)?.financialInstitutionId || ''
  );
}

export function ReceivableForm({
  accountToUpdate,
  readOnly = false,
  onSuccess,
  onReplicate,
}: ReceivableFormProps) {
  const queryClient = useQueryClient();
  const bankPrefillFor = useRef('');
  const [personId, setPersonId] = useState(accountToUpdate?.personId ?? '');
  const [documentNumber, setDocumentNumber] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [description, setDescription] = useState('');
  const [issueOn, setIssueOn] = useState(civilDate());
  const [dueOn, setDueOn] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [planAccountId, setPlanAccountId] = useState('');
  const [financialInstitutionId, setFinancialInstitutionId] = useState('');
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [meansOfPaymentId, setMeansOfPaymentId] = useState('');
  const [cardBrandId, setCardBrandId] = useState('');
  const [bearerName, setBearerName] = useState('');
  const [barcode, setBarcode] = useState('');
  const [bankSlipOurNumber, setBankSlipOurNumber] = useState('');
  const [transactionAuthorization, setTransactionAuthorization] = useState('');

  const restoreInstrument = (account: FinancialAccount) => {
    setFinancialInstitutionId(account.financialInstitutionId || '');
    setCardBrandId(account.cardBrandId || '');
    setBearerName(account.bearerName || '');
    setBarcode(account.barcode || '');
    setBankSlipOurNumber(account.bankSlipOurNumber || '');
    setTransactionAuthorization(account.transactionAuthorization || '');
  };

  const clearInstrument = () => {
    setFinancialInstitutionId('');
    setCardBrandId('');
    setBearerName('');
    setBarcode('');
    setBankSlipOurNumber('');
    setTransactionAuthorization('');
  };

  useEffect(() => {
    if (!accountToUpdate) return;
    setPersonId(accountToUpdate.personId);
    setDocumentNumber(accountToUpdate.documentNumber || '');
    setInvoiceNumber(accountToUpdate.invoiceNumber || '');
    setDescription(accountToUpdate.description);
    setIssueOn(accountToUpdate.issueOn?.slice(0, 10) || '');
    setDueOn(accountToUpdate.dueOn?.slice(0, 10) || '');
    setAmountStr(formatCurrencyInput(accountToUpdate.installmentAmount));
    setPlanAccountId(accountToUpdate.planAccountId || '');
    setFinancialInstitutionId(accountToUpdate.financialInstitutionId || '');
    setPaymentMethodId(accountToUpdate.paymentMethodId || '');
    setMeansOfPaymentId(accountToUpdate.meansOfPaymentId || '');
    setCardBrandId(accountToUpdate.cardBrandId || '');
    setBearerName(accountToUpdate.bearerName || '');
    setBarcode(accountToUpdate.barcode || '');
    setBankSlipOurNumber(accountToUpdate.bankSlipOurNumber || '');
    setTransactionAuthorization(accountToUpdate.transactionAuthorization || '');
    bankPrefillFor.current = accountToUpdate.paymentMethodId || '';
  }, [accountToUpdate]);

  const { data: planAccounts = [] } = useQuery({
    queryKey: ['financial', 'plan-accounts'],
    queryFn: () => financialService.listPlanAccounts({ acceptsEntries: true }),
  });

  const { data: meansOfPayment = [] } = useQuery({
    queryKey: ['financial', 'means-of-payment'],
    queryFn: () => financialService.listMeansOfPayment(),
  });

  const { data: paymentMethodPage } = useQuery({
    queryKey: ['payment-methods', 'receivable-picker'],
    queryFn: () =>
      paymentMethodsService.list({
        page: 1,
        limit: 100,
        sortField: 'sortOrder',
        sortOrder: 'asc',
        isActive: true,
      }),
  });

  const linkedMethodId = accountToUpdate?.paymentMethodId;
  const { data: linkedMethod } = useQuery({
    queryKey: ['payment-method', linkedMethodId],
    enabled: Boolean(linkedMethodId),
    queryFn: () => paymentMethodsService.get(linkedMethodId!),
  });

  const { data: cardBrands = [] } = useQuery({
    queryKey: ['financial', 'card-brands'],
    queryFn: () => financialService.listCardBrands(),
  });

  const paymentMethodOptions = useMemo(() => {
    const options = (paymentMethodPage?.data ?? []).map(toMethodOption);
    if (linkedMethod && !options.some((item) => item.id === linkedMethod.id)) {
      options.push(toMethodOption(linkedMethod));
    }
    return options;
  }, [paymentMethodPage, linkedMethod]);

  const needsBankAccounts = paymentMethodOptions.some((method) => method.bankAccountId);
  const { data: bankAccounts = [] } = useQuery({
    queryKey: ['treasury', 'bank-accounts'],
    queryFn: () => treasuryService.bankAccounts(),
    enabled: needsBankAccounts,
  });

  const meanCode = meansOfPayment.find((item) => item.id === meansOfPaymentId)?.code;
  const selectedMethod = paymentMethodOptions.find((item) => item.id === paymentMethodId);
  const profile = instrumentProfile(meanCode);
  const meansUnchanged = Boolean(
    accountToUpdate && meansOfPaymentId === (accountToUpdate.meansOfPaymentId || ''),
  );
  const visibleFields = visibleInstrumentFields({
    code: meanCode,
    meansUnchanged,
    retained: {
      financialInstitution: accountToUpdate?.financialInstitutionId,
      cardBrand: accountToUpdate?.cardBrandId,
      transactionAuthorization: accountToUpdate?.transactionAuthorization,
      bearerName: accountToUpdate?.bearerName,
      bankSlipOurNumber: accountToUpdate?.bankSlipOurNumber,
      barcode: accountToUpdate?.barcode,
    },
  });
  const show = (field: InstrumentField) => visibleFields.includes(field);
  const brandRequired =
    profile.cardBrandRequiredWhenNotIntegrated &&
    selectedMethod?.integrationType === 'not_integrated';

  const methodChoices = (
    meansOfPaymentId
      ? paymentMethodOptions.filter((item) => item.meansOfPaymentId === meansOfPaymentId)
      : paymentMethodOptions
  ).map(({ id, label }) => ({ id, label }));

  useEffect(() => {
    if (readOnly || !paymentMethodId) return;
    if (bankPrefillFor.current === paymentMethodId) return;
    const method = paymentMethodOptions.find((item) => item.id === paymentMethodId);
    if (!method || method.acquirerId || !method.bankAccountId) {
      if (method) bankPrefillFor.current = paymentMethodId;
      return;
    }
    const institutionId = bankAccounts.find(
      (account) => account.id === method.bankAccountId,
    )?.financialInstitutionId;
    if (!institutionId) return;
    const code = meansOfPayment.find((item) => item.id === method.meansOfPaymentId)?.code;
    if (!instrumentProfile(code).fields.includes('financialInstitution')) {
      bankPrefillFor.current = paymentMethodId;
      return;
    }
    bankPrefillFor.current = paymentMethodId;
    setFinancialInstitutionId((current) => current || institutionId);
  }, [readOnly, paymentMethodId, paymentMethodOptions, bankAccounts, meansOfPayment]);

  const applyMethod = (id: string) => {
    setPaymentMethodId(id);
    if (!id) {
      bankPrefillFor.current = '';
      return;
    }
    const method = paymentMethodOptions.find((item) => item.id === id);
    if (!method) return;
    if (accountToUpdate?.paymentMethodId === id) {
      setMeansOfPaymentId(method.meansOfPaymentId);
      restoreInstrument(accountToUpdate);
      bankPrefillFor.current = id;
      return;
    }
    const code = meansOfPayment.find((item) => item.id === method.meansOfPaymentId)?.code;
    const fields = new Set(instrumentProfile(code).fields);
    const institutionId = institutionIdOf(method, bankAccounts);
    const keepTyped = method.meansOfPaymentId === meansOfPaymentId;
    setMeansOfPaymentId(method.meansOfPaymentId);
    setFinancialInstitutionId((current) =>
      fields.has('financialInstitution') ? (keepTyped && current ? current : institutionId) : '',
    );
    setCardBrandId((current) =>
      fields.has('cardBrand') ? (keepTyped && current ? current : method.cardBrandId || '') : '',
    );
    if (!keepTyped || !fields.has('transactionAuthorization')) setTransactionAuthorization('');
    if (!keepTyped || !fields.has('bearerName')) setBearerName('');
    if (!keepTyped || !fields.has('bankSlipOurNumber')) setBankSlipOurNumber('');
    if (!keepTyped || !fields.has('barcode')) setBarcode('');
    bankPrefillFor.current = method.acquirerId || !method.bankAccountId || institutionId ? id : '';
  };

  const applyMeans = (id: string) => {
    setMeansOfPaymentId(id);
    if (accountToUpdate && id === (accountToUpdate.meansOfPaymentId || '')) {
      restoreInstrument(accountToUpdate);
      return;
    }
    clearInstrument();
  };

  const mutation = useMutation({
    mutationFn: (dados: CreateReceivableInput) =>
      accountToUpdate
        ? financialService.update('receivable', accountToUpdate.id, dados)
        : financialService.create('receivable', dados),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial', 'receivable'] });
      toast.success(
        accountToUpdate
          ? 'Conta a receber atualizada com sucesso!'
          : 'Conta a receber lançada com sucesso!',
      );
      onSuccess();
    },
    onError: (err: Error) => toast.error(`Erro: ${err.message}`),
  });

  const optionalId = (value: string) => (value ? value : undefined);
  const shownValue = (field: InstrumentField, value: string) =>
    visibleFields.includes(field) ? value || undefined : undefined;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    const installmentAmount = parseCurrencyToCents(amountStr);
    if (!personId || !description || !dueOn || installmentAmount <= 0) return;
    if (meansOfPaymentId && !meanCode) {
      toast.error('Aguarde o carregamento do meio de pagamento.');
      return;
    }
    if (profile.requiresPaymentMethod && !paymentMethodId) {
      toast.error('Outros exige uma forma de pagamento.');
      return;
    }
    if (brandRequired && !cardBrandId) {
      toast.error('Informe a bandeira do cartão.');
      return;
    }

    mutation.mutate({
      personId,
      documentNumber: documentNumber || undefined,
      invoiceNumber: invoiceNumber || undefined,
      description,
      issueOn: issueOn || undefined,
      installmentAmount,
      dueOn,
      planAccountId: optionalId(planAccountId),
      financialInstitutionId: shownValue('financialInstitution', financialInstitutionId),
      meansOfPaymentId: optionalId(meansOfPaymentId),
      paymentMethodId: paymentMethodId || null,
      cardBrandId: shownValue('cardBrand', cardBrandId),
      bearerName: shownValue('bearerName', bearerName),
      barcode: shownValue('barcode', barcode),
      bankSlipOurNumber: shownValue('bankSlipOurNumber', bankSlipOurNumber),
      transactionAuthorization: shownValue('transactionAuthorization', transactionAuthorization),
    });
  };

  const showSettlement =
    readOnly &&
    accountToUpdate &&
    (accountToUpdate.status === 'recebido' || accountToUpdate.settledOn);

  const documentLabel =
    meanCode === '02' ? 'Nº do cheque' : meanCode === '14' ? 'Nº da duplicata' : 'Nº do Documento';

  return (
    <form
      onSubmit={handleSubmit}
      className="max-h-[70vh] space-y-4 overflow-y-auto pr-1 pt-2"
    >
      {showSettlement && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm space-y-1">
          <p className="font-medium text-emerald-800">Liquidação</p>
          <p className="text-emerald-700">
            Data: <strong>{formatRawDate(accountToUpdate.settledOn) || '-'}</strong>
          </p>
          <p className="text-emerald-700">
            Valor recebido:{' '}
            <strong>{formatCurrency(accountToUpdate.settledAmount)}</strong>
          </p>
          <p className="text-emerald-700">
            Status: <strong>{accountToUpdate.status}</strong>
          </p>
        </div>
      )}

      <div className="space-y-1">
        <Label>Cliente</Label>
        <PersonSearchSelect
          value={personId}
          onChange={setPersonId}
          type="cliente"
          placeholder="Buscar cliente por nome ou documento..."
          required={!readOnly}
          disabled={readOnly}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="documentNumber">{documentLabel}</Label>
          <Input
            id="documentNumber"
            value={documentNumber}
            maxLength={44}
            onChange={(e) => setDocumentNumber(e.target.value)}
            disabled={readOnly}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="invoiceNumber">Nº da Fatura</Label>
          <Input
            id="invoiceNumber"
            value={invoiceNumber}
            maxLength={44}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            disabled={readOnly}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="description">Descrição da venda ou serviço</Label>
        <Input
          id="description"
          value={description}
          maxLength={255}
          onChange={(e) => setDescription(e.target.value)}
          required={!readOnly}
          disabled={readOnly}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="issueOn">Emissão</Label>
          <Input
            id="issueOn"
            type="date"
            value={issueOn}
            onChange={(e) => setIssueOn(e.target.value)}
            required={!readOnly}
            disabled={readOnly}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="dueOn">Vencimento</Label>
          <Input
            id="dueOn"
            type="date"
            value={dueOn}
            onChange={(e) => setDueOn(e.target.value)}
            required={!readOnly}
            disabled={readOnly}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="amount">Valor (R$)</Label>
          <Input
            id="amount"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="0,00"
            value={amountStr}
            onChange={(e) => setAmountStr(maskCurrencyInput(e.target.value))}
            required={!readOnly}
            disabled={readOnly}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label>Plano de contas</Label>
        <CatalogSearchSelect
          value={planAccountId}
          onChange={setPlanAccountId}
          options={planAccounts}
          placeholder="Buscar plano de contas..."
          emptyMessage="Nenhum plano de contas cadastrado."
          allowClear={!readOnly}
          disabled={readOnly}
        />
      </div>

      <div className="space-y-1">
        <Label>Forma de pagamento</Label>
        <CatalogSearchSelect
          value={paymentMethodId}
          onChange={applyMethod}
          options={methodChoices}
          placeholder="Buscar forma de pagamento..."
          emptyMessage={
            meansOfPaymentId
              ? 'Nenhuma forma ativa para este meio.'
              : 'Nenhuma forma de pagamento ativa.'
          }
          allowClear={!readOnly}
          disabled={readOnly}
          required={!readOnly && profile.requiresPaymentMethod}
        />
        {meanCode === '99' && !paymentMethodId ? (
          <p className="text-xs text-zinc-500">
            Outros exige uma forma. O nome dela identifica o pagamento.
          </p>
        ) : meansOfPaymentId && !paymentMethodId ? (
          <p className="text-xs text-zinc-500">A lista mostra as formas deste meio.</p>
        ) : null}
      </div>

      <div className="space-y-1">
        <Label>Meio de pagamento</Label>
        <CatalogSearchSelect
          value={meansOfPaymentId}
          onChange={applyMeans}
          options={meansOfPayment}
          placeholder="Buscar meio de pagamento..."
          emptyMessage="Nenhum meio de pagamento cadastrado."
          allowClear={!readOnly && !paymentMethodId}
          disabled={readOnly || Boolean(paymentMethodId)}
        />
        {paymentMethodId ? (
          <p className="text-xs text-zinc-500">O meio vem da forma escolhida.</p>
        ) : null}
      </div>

      {show('financialInstitution') ? (
        <div className="space-y-1">
          <Label>Instituição financeira</Label>
          <PersonSearchSelect
            value={financialInstitutionId}
            onChange={setFinancialInstitutionId}
            type="instituicao"
            placeholder="Buscar instituição (opcional)..."
            allowClear={!readOnly}
            disabled={readOnly}
          />
        </div>
      ) : null}

      {show('cardBrand') || show('transactionAuthorization') ? (
        <div className="grid grid-cols-2 gap-4">
          {show('cardBrand') ? (
            <div className="space-y-1">
              <Label>Bandeira do cartão</Label>
              <CatalogSearchSelect
                value={cardBrandId}
                onChange={setCardBrandId}
                options={cardBrands}
                placeholder="Buscar bandeira..."
                emptyMessage="Nenhuma bandeira cadastrada."
                allowClear={!readOnly}
                disabled={readOnly}
                required={!readOnly && brandRequired}
              />
            </div>
          ) : null}
          {show('transactionAuthorization') ? (
            <div className="space-y-1">
              <Label htmlFor="transactionAuthorization">Autorização da transação</Label>
              <Input
                id="transactionAuthorization"
                value={transactionAuthorization}
                maxLength={128}
                onChange={(e) => setTransactionAuthorization(e.target.value)}
                disabled={readOnly}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {show('bearerName') || show('bankSlipOurNumber') ? (
        <div className="grid grid-cols-2 gap-4">
          {show('bearerName') ? (
            <div className="space-y-1">
              <Label htmlFor="bearerName">Portador do boleto</Label>
              <Input
                id="bearerName"
                value={bearerName}
                maxLength={60}
                onChange={(e) => setBearerName(e.target.value)}
                disabled={readOnly}
              />
            </div>
          ) : null}
          {show('bankSlipOurNumber') ? (
            <div className="space-y-1">
              <Label htmlFor="bankSlipOurNumber">Nosso número</Label>
              <Input
                id="bankSlipOurNumber"
                value={bankSlipOurNumber}
                maxLength={20}
                onChange={(e) => setBankSlipOurNumber(e.target.value)}
                disabled={readOnly}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {show('barcode') ? (
        <div className="space-y-1">
          <Label htmlFor="barcode">Código de barras</Label>
          <Input
            id="barcode"
            value={barcode}
            maxLength={50}
            onChange={(e) => setBarcode(e.target.value)}
            disabled={readOnly}
          />
        </div>
      ) : null}

      {readOnly ? (
        <div className="mt-2 flex gap-2">
          {onReplicate && accountToUpdate && (
            <Button type="button" className="flex-1" onClick={onReplicate}>
              Replicar
            </Button>
          )}
          <Button type="button" variant="outline" className="flex-1" onClick={onSuccess}>
            Fechar
          </Button>
        </div>
      ) : (
        <div className="mt-2 flex gap-2">
          {onReplicate && accountToUpdate && (
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={onReplicate}
            >
              Replicar
            </Button>
          )}
          <Button
            type="submit"
            className="flex-1 bg-zinc-900 text-white hover:bg-zinc-800"
            disabled={mutation.isPending}
          >
            {mutation.isPending
              ? 'Salvando...'
              : accountToUpdate
                ? 'Atualizar'
                : 'Confirmar Lançamento'}
          </Button>
        </div>
      )}
    </form>
  );
}
