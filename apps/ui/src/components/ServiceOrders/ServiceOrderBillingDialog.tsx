import {
  formatCurrency,
  installmentDueDates,
  maskCurrencyInput,
  parseCurrencyToCents,
  splitInstallmentAmounts,
} from '@erp-360/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { type PaymentMethod, paymentMethodsService } from '@/services/paymentMethods';
import {
  type ServiceOrderBilling,
  type ServiceOrderPayment,
  serviceOrdersService,
} from '@/services/serviceOrders';

const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm';

const billingStatusLabel = {
  pendente: 'Pendente',
  recebido: 'Recebido',
  cancelado: 'Cancelado',
} as const;

type DraftRow = {
  key: string;
  paymentMethodId: string;
  methodName: string;
  installmentCount: number;
  dueOn: string;
  amount: string;
};

function formatIsoDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function rowsFromPayments(payments: ServiceOrderPayment[]): DraftRow[] {
  return payments.map((payment) => ({
    key: crypto.randomUUID(),
    paymentMethodId: payment.paymentMethodId,
    methodName: payment.methodName,
    installmentCount: payment.installmentCount,
    dueOn: payment.dueOn,
    amount: maskCurrencyInput(String(payment.amount)),
  }));
}

function BillingTable({ rows }: { rows: ServiceOrderBilling[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-zinc-500">
            <th className="py-2 font-medium">Documento</th>
            <th className="py-2 font-medium">Vencimento</th>
            <th className="py-2 font-medium">Valor</th>
            <th className="py-2 font-medium">Situação</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((billing) => (
            <tr key={billing.receivableId} className="border-b">
              <td className="py-2 pr-2">{billing.documentNumber ?? '—'}</td>
              <td className="py-2 pr-2">{formatIsoDate(billing.dueOn)}</td>
              <td className="py-2 pr-2">{formatCurrency(billing.amount)}</td>
              <td className="py-2">{billingStatusLabel[billing.status]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ServiceOrderBillingDialog({
  orderId,
  onClose,
}: {
  orderId: string | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [methodId, setMethodId] = useState('');
  const [installments, setInstallments] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [lockedMessage, setLockedMessage] = useState<string | null>(null);
  const [lockedBillings, setLockedBillings] = useState<ServiceOrderBilling[] | null>(null);

  const order = useQuery({
    queryKey: ['service-order', orderId],
    queryFn: () => serviceOrdersService.get(orderId ?? ''),
    enabled: Boolean(orderId),
  });
  const methods = useQuery({
    queryKey: ['payment-methods', 'service-order'],
    queryFn: () =>
      paymentMethodsService.list({
        page: 1,
        limit: 100,
        sortField: 'name',
        sortOrder: 'asc',
        isActive: true,
        channel: 'serviceOrder',
      }),
    enabled: Boolean(orderId),
  });

  useEffect(() => {
    if (!order.data) return;
    setRows(rowsFromPayments(order.data.payments ?? []));
    setLockedMessage(null);
    setLockedBillings(null);
  }, [order.data]);

  const paymentMethods = (methods.data?.data ?? []).filter(
    (method) => method.receiptKind !== 'store_credit',
  );
  const selected = paymentMethods.find((method) => method.id === methodId);
  const terms = [...(selected?.terms ?? [])].sort(
    (left, right) => left.installmentCount - right.installmentCount,
  );
  const totalAmount = order.data?.totalAmount ?? 0;
  const allocated = rows.reduce((sum, row) => sum + parseCurrencyToCents(row.amount), 0);
  const remaining = totalAmount - allocated;
  const existing = lockedBillings ?? (order.data?.billings.length ? order.data.billings : null);
  const existingMessage =
    lockedMessage ??
    (order.data && order.data.billings.length > 0
      ? 'O financeiro desta ordem já foi gerado.'
      : null);

  function addGroup() {
    if (!order.data) return;
    const method = paymentMethods.find((item) => item.id === methodId);
    const term = method?.terms.find(
      (item) => String(item.installmentCount) === installments,
    );
    const cents = parseCurrencyToCents(amount);
    if (!method || !term) {
      toast.error('Informe a forma e a condição.');
      return;
    }
    if (cents <= 0) {
      toast.error('Informe o valor desta condição.');
      return;
    }
    if (cents > remaining) {
      toast.error('O valor passa do saldo restante.');
      return;
    }
    const dates = installmentDueDates(
      order.data.today,
      term.firstDueDays,
      term.intervalDays,
      term.installmentCount,
    );
    const amounts = splitInstallmentAmounts(cents, term.installmentCount);
    setRows((current) => [
      ...current,
      ...dates.map((dueOn, index) => ({
        key: crypto.randomUUID(),
        paymentMethodId: method.id,
        methodName: method.name,
        installmentCount: term.installmentCount,
        dueOn,
        amount: maskCurrencyInput(String(amounts[index] ?? 0)),
      })),
    ]);
    setMethodId('');
    setInstallments('');
    setAmount('');
  }

  async function confirm() {
    if (!orderId) return;
    setBusy(true);
    try {
      const result = await serviceOrdersService.generateBillings(
        orderId,
        rows.map((row) => ({
          paymentMethodId: row.paymentMethodId,
          installmentCount: row.installmentCount,
          dueOn: row.dueOn,
          amount: parseCurrencyToCents(row.amount),
        })),
      );
      if (result.status === 409) {
        setLockedMessage(result.body.message);
        setLockedBillings(result.body.billings);
        return;
      }
      toast.success('Financeiro gerado.');
      await queryClient.invalidateQueries({ queryKey: ['service-orders'] });
      await queryClient.invalidateQueries({ queryKey: ['service-order', orderId] });
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível gerar o financeiro.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={Boolean(orderId)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Gerar financeiro</DialogTitle>
        </DialogHeader>
        {order.isLoading ? <p className="text-sm text-zinc-500">Carregando a ordem...</p> : null}
        {order.isError ? (
          <p className="text-sm text-red-600">Não foi possível carregar a ordem.</p>
        ) : null}
        {existing && existingMessage ? (
          <div className="space-y-3">
            <p className="text-sm text-zinc-700">{existingMessage}</p>
            <BillingTable rows={existing} />
          </div>
        ) : null}
        {order.data && order.data.totalAmount === 0 && !existing ? (
          <p className="text-sm text-zinc-700">Ordem com total zero não gera financeiro.</p>
        ) : null}
        {order.data && order.data.totalAmount > 0 && !existing ? (
          <div className="space-y-4">
            <p className="text-sm text-zinc-700">
              Total <strong>{formatCurrency(totalAmount)}</strong>
              {' · '}
              Saldo{' '}
              <strong className={remaining < 0 ? 'text-red-600' : undefined}>
                {formatCurrency(remaining)}
              </strong>
            </p>
            <div className="grid items-end gap-4 md:grid-cols-12">
              <div className="space-y-1.5 md:col-span-4">
                <Label htmlFor="billing-method">Forma de pagamento</Label>
                <select
                  id="billing-method"
                  className={selectClass}
                  value={methodId}
                  onChange={(event) => {
                    const nextId = event.target.value;
                    const method = paymentMethods.find((item) => item.id === nextId);
                    const stillValid = method?.terms.some(
                      (term) => String(term.installmentCount) === installments,
                    );
                    setMethodId(nextId);
                    if (!stillValid) setInstallments('');
                  }}
                >
                  <option value="">Selecione</option>
                  {paymentMethods.map((method) => (
                    <option key={method.id} value={method.id}>
                      {method.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5 md:col-span-3">
                <Label htmlFor="billing-installments">Condição</Label>
                <select
                  id="billing-installments"
                  className={selectClass}
                  value={installments}
                  disabled={!methodId}
                  onChange={(event) => setInstallments(event.target.value)}
                >
                  <option value="">Selecione</option>
                  {terms.map((term) => (
                    <option key={term.installmentCount} value={term.installmentCount}>
                      {conditionLabel(term)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5 md:col-span-3">
                <Label htmlFor="billing-amount">Valor</Label>
                <Input
                  id="billing-amount"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="0,00"
                  value={amount}
                  onChange={(event) => setAmount(maskCurrencyInput(event.target.value))}
                />
              </div>
              <div className="md:col-span-2">
                <Button
                  type="button"
                  className="w-full"
                  disabled={remaining <= 0}
                  onClick={addGroup}
                >
                  Adicionar
                </Button>
              </div>
            </div>
            {rows.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-zinc-500">
                      <th className="py-2 font-medium">Forma</th>
                      <th className="w-44 py-2 font-medium">Vencimento</th>
                      <th className="w-36 py-2 font-medium">Valor</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.key} className="border-b">
                        <td className="py-2 pr-2">{row.methodName}</td>
                        <td className="py-2 pr-2">
                          <Input
                            type="date"
                            aria-label={`Vencimento de ${row.methodName}`}
                            value={row.dueOn}
                            onChange={(event) =>
                              setRows((current) =>
                                current.map((item) =>
                                  item.key === row.key
                                    ? { ...item, dueOn: event.target.value }
                                    : item,
                                ),
                              )
                            }
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <Input
                            aria-label={`Valor de ${row.methodName}`}
                            inputMode="numeric"
                            autoComplete="off"
                            value={row.amount}
                            onChange={(event) =>
                              setRows((current) =>
                                current.map((item) =>
                                  item.key === row.key
                                    ? {
                                        ...item,
                                        amount: maskCurrencyInput(event.target.value),
                                      }
                                    : item,
                                ),
                              )
                            }
                          />
                        </td>
                        <td className="py-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Remover parcela de ${row.methodName}`}
                            onClick={() =>
                              setRows((current) => current.filter((item) => item.key !== row.key))
                            }
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-zinc-500">Nenhuma parcela.</p>
            )}
            <div className="flex justify-end">
              <Button
                type="button"
                disabled={busy || allocated !== totalAmount}
                onClick={() => void confirm()}
              >
                Confirmar
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function conditionLabel(term: PaymentMethod['terms'][number]) {
  if (term.installmentCount === 1 && term.firstDueDays === 0) return 'À vista';
  return `${term.installmentCount}x`;
}
