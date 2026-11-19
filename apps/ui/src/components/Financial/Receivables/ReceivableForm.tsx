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
import { FloatingInput } from '@/components/ui/FloatingField';
import {
  type CreateReceivableInput,
  type FinancialAccount,
  financialService,
} from '@/services/financials';
import { type PaymentMethod, paymentMethodsService } from '@/services/paymentMethods';
import { type BankAccount, treasuryService } from '@/services/treasury';

import {
  type InstrumentField,
  instrumentProfile,
  visibleInstrumentFields,
} from './receivableInstrument';

interface ReceivableFormProps {
  accountToUpdate?: FinancialAccount | null;
  onSuccess?: () => void;
  onCancel?: () => void;
  onDeleted?: () => void;
  onReceive?: () => void;
  onReplicate?: () => void;
}

const statusLabels: Record<FinancialAccount['status'], string> = {
  pendente: 'Pendente',
  pago: 'Pago',
  recebido: 'Recebido',
  cancelado: 'Cancelado',
};

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
    accounts.find((account) => account.id === method.bankAccountId)
      ?.financialInstitutionId || ''
  );
}

export function ReceivableForm({
  accountToUpdate,
  onSuccess,
  onCancel,
  onDeleted,
  onReceive,
  onReplicate,
}: ReceivableFormProps) {
  const queryClient = useQueryClient();
  const readOnly = Boolean(accountToUpdate && accountToUpdate.status !== 'pendente');
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
  const [openDelete, setOpenDelete] = useState(false);
  const [openReverse, setOpenReverse] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

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
      fields.has('financialInstitution')
        ? keepTyped && current
          ? current
          : institutionId
        : '',
    );
    setCardBrandId((current) =>
      fields.has('cardBrand')
        ? keepTyped && current
          ? current
          : method.cardBrandId || ''
        : '',
    );
    if (!keepTyped || !fields.has('transactionAuthorization'))
      setTransactionAuthorization('');
    if (!keepTyped || !fields.has('bearerName')) setBearerName('');
    if (!keepTyped || !fields.has('bankSlipOurNumber')) setBankSlipOurNumber('');
    if (!keepTyped || !fields.has('barcode')) setBarcode('');
    bankPrefillFor.current =
      method.acquirerId || !method.bankAccountId || institutionId ? id : '';
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
      onSuccess?.();
    },
    onError: (err: Error) => toast.error(`Erro: ${err.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: () => financialService.delete('receivable', accountToUpdate?.id ?? ''),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial', 'receivable'] });
      toast.success('Conta a receber excluída com sucesso!');
      onDeleted?.();
    },
    onError: (error: Error) => setActionError(error.message),
  });

  const reverseMutation = useMutation({
    mutationFn: () => financialService.reverse('receivable', accountToUpdate?.id ?? ''),
    onSuccess: (saved) => {
      queryClient.setQueryData(['financial', 'receivable', saved.id], saved);
      queryClient.invalidateQueries({ queryKey: ['financial', 'receivable'] });
      setOpenReverse(false);
      setActionError(null);
      toast.success('Recebimento estornado com sucesso!');
    },
    onError: (error: Error) => setActionError(error.message),
  });

  const optionalId = (value: string) => (value ? value : undefined);
  const shownValue = (field: InstrumentField, value: string) =>
    visibleFields.includes(field) ? value || undefined : undefined;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    const installmentAmount = parseCurrencyToCents(amountStr);
    if (!personId) {
      toast.error('Informe o cliente.');
      return;
    }
    if (!description.trim()) {
      toast.error('Informe a descrição.');
      return;
    }
    if (!dueOn) {
      toast.error('Informe o vencimento.');
      return;
    }
    if (installmentAmount <= 0) {
      toast.error('Informe o valor.');
      return;
    }
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
      transactionAuthorization: shownValue(
        'transactionAuthorization',
        transactionAuthorization,
      ),
    });
  };

  const showSettlement =
    accountToUpdate &&
    (accountToUpdate.status === 'recebido' || accountToUpdate.settledOn);
  const busy =
    mutation.isPending || deleteMutation.isPending || reverseMutation.isPending;

  const documentLabel =
    meanCode === '02'
      ? 'Nº do cheque'
      : meanCode === '14'
        ? 'Nº da duplicata'
        : 'Nº do documento';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {showSettlement && accountToUpdate ? (
        <div className="space-y-1 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
          <p className="font-medium text-emerald-800">Liquidação</p>
          <p className="text-emerald-700">
            Data: <strong>{formatRawDate(accountToUpdate.settledOn) || '—'}</strong>
          </p>
          <p className="text-emerald-700">
            Valor recebido:{' '}
            <strong>{formatCurrency(accountToUpdate.settledAmount)}</strong>
          </p>
          <p className="text-emerald-700">
            Situação: <strong>{statusLabels[accountToUpdate.status]}</strong>
          </p>
        </div>
      ) : null}

      <PersonSearchSelect
        label="Cliente"
        value={personId}
        onChange={setPersonId}
        type="cliente"
        placeholder="Buscar cliente por nome ou documento..."
        required={!readOnly}
        disabled={readOnly}
      />

      <div className="grid grid-cols-2 gap-4">
        <FloatingInput
          id="documentNumber"
          label={documentLabel}
          value={documentNumber}
          maxLength={44}
          disabled={readOnly}
          onChange={(event) => setDocumentNumber(event.target.value)}
        />
        <FloatingInput
          id="invoiceNumber"
          label="Nº da fatura"
          value={invoiceNumber}
          maxLength={44}
          disabled={readOnly}
          onChange={(event) => setInvoiceNumber(event.target.value)}
        />
      </div>

      <FloatingInput
        id="description"
        label="Descrição da venda ou serviço"
        value={description}
        maxLength={255}
        required={!readOnly}
        disabled={readOnly}
        onChange={(event) => setDescription(event.target.value)}
      />

      <div className="grid grid-cols-2 gap-4">
        <FloatingInput
          id="issueOn"
          label="Emissão"
          type="date"
          value={issueOn}
          required={!readOnly}
          disabled={readOnly}
          onChange={(event) => setIssueOn(event.target.value)}
        />
        <FloatingInput
          id="dueOn"
          label="Vencimento"
          type="date"
          value={dueOn}
          required={!readOnly}
          disabled={readOnly}
          onChange={(event) => setDueOn(event.target.value)}
        />
      </div>

      <FloatingInput
        id="amount"
        label="Valor"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={amountStr}
        required={!readOnly}
        disabled={readOnly}
        onChange={(event) => setAmountStr(maskCurrencyInput(event.target.value))}
      />

      <CatalogSearchSelect
        label="Plano de contas"
        value={planAccountId}
        onChange={setPlanAccountId}
        options={planAccounts}
        placeholder="Buscar plano de contas..."
        emptyMessage="Nenhum plano de contas cadastrado."
        allowClear={!readOnly}
        disabled={readOnly}
      />

      <div className="space-y-2">
        <CatalogSearchSelect
          label="Forma de pagamento"
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
          <p className="text-sm text-zinc-500">
            Outros exige uma forma. O nome dela identifica o pagamento.
          </p>
        ) : meansOfPaymentId && !paymentMethodId ? (
          <p className="text-sm text-zinc-500">A lista mostra as formas deste meio.</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <CatalogSearchSelect
          label="Meio de pagamento"
          value={meansOfPaymentId}
          onChange={applyMeans}
          options={meansOfPayment}
          placeholder="Buscar meio de pagamento..."
          emptyMessage="Nenhum meio de pagamento cadastrado."
          allowClear={!readOnly && !paymentMethodId}
          disabled={readOnly || Boolean(paymentMethodId)}
        />
        {paymentMethodId ? (
          <p className="text-sm text-zinc-500">O meio vem da forma escolhida.</p>
        ) : null}
      </div>

      {show('financialInstitution') ? (
        <PersonSearchSelect
          label="Instituição financeira"
          value={financialInstitutionId}
          onChange={setFinancialInstitutionId}
          type="instituicao"
          placeholder="Buscar instituição..."
          allowClear={!readOnly}
          disabled={readOnly}
        />
      ) : null}

      {show('cardBrand') || show('transactionAuthorization') ? (
        <div className="grid grid-cols-2 gap-4">
          {show('cardBrand') ? (
            <CatalogSearchSelect
              label="Bandeira do cartão"
              value={cardBrandId}
              onChange={setCardBrandId}
              options={cardBrands}
              placeholder="Buscar bandeira..."
              emptyMessage="Nenhuma bandeira cadastrada."
              allowClear={!readOnly}
              disabled={readOnly}
              required={!readOnly && brandRequired}
            />
          ) : null}
          {show('transactionAuthorization') ? (
            <FloatingInput
              id="transactionAuthorization"
              label="Autorização da transação"
              value={transactionAuthorization}
              maxLength={128}
              disabled={readOnly}
              onChange={(event) => setTransactionAuthorization(event.target.value)}
            />
          ) : null}
        </div>
      ) : null}

      {show('bearerName') || show('bankSlipOurNumber') ? (
        <div className="grid grid-cols-2 gap-4">
          {show('bearerName') ? (
            <FloatingInput
              id="bearerName"
              label="Portador do boleto"
              value={bearerName}
              maxLength={60}
              disabled={readOnly}
              onChange={(event) => setBearerName(event.target.value)}
            />
          ) : null}
          {show('bankSlipOurNumber') ? (
            <FloatingInput
              id="bankSlipOurNumber"
              label="Nosso número"
              value={bankSlipOurNumber}
              maxLength={20}
              disabled={readOnly}
              onChange={(event) => setBankSlipOurNumber(event.target.value)}
            />
          ) : null}
        </div>
      ) : null}

      {show('barcode') ? (
        <FloatingInput
          id="barcode"
          label="Código de barras"
          value={barcode}
          maxLength={50}
          disabled={readOnly}
          onChange={(event) => setBarcode(event.target.value)}
        />
      ) : null}

      {mutation.isError ? (
        <p className="rounded-md bg-destructive/10 p-3 text-sm font-medium text-destructive">
          {mutation.error.message}
        </p>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2 pt-2">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        ) : null}
        {accountToUpdate && onDeleted && accountToUpdate.status === 'pendente' ? (
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={() => {
              setActionError(null);
              setOpenDelete(true);
            }}
          >
            Excluir
          </Button>
        ) : null}
        {onReplicate && accountToUpdate ? (
          <Button type="button" variant="outline" disabled={busy} onClick={onReplicate}>
            Replicar
          </Button>
        ) : null}
        {accountToUpdate?.status === 'recebido' ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              setActionError(null);
              setOpenReverse(true);
            }}
          >
            Estornar
          </Button>
        ) : null}
        {onReceive ? (
          <Button type="button" disabled={busy} onClick={onReceive}>
            Receber
          </Button>
        ) : null}
        {readOnly ? null : (
          <Button type="submit" disabled={busy}>
            {mutation.isPending
              ? 'Salvando...'
              : accountToUpdate
                ? 'Atualizar'
                : 'Lançar'}
          </Button>
        )}
      </div>

      <AlertDialog open={openDelete} onOpenChange={setOpenDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conta a receber</AlertDialogTitle>
            <AlertDialogDescription>
              {actionError ??
                `Deseja excluir ${description || 'esta conta'}? Essa ação não pode ser desfeita.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteMutation.isPending || !!actionError}
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

      <AlertDialog open={openReverse} onOpenChange={setOpenReverse}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Estornar recebimento</AlertDialogTitle>
            <AlertDialogDescription>
              {actionError ??
                `Deseja estornar o recebimento de ${description || 'esta conta'}? O título voltará para pendente.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 hover:bg-amber-700"
              disabled={reverseMutation.isPending || !!actionError}
              onClick={(event) => {
                event.preventDefault();
                reverseMutation.mutate();
              }}
            >
              {reverseMutation.isPending ? 'Estornando...' : 'Estornar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
