import { civilDate, formatCurrency, formatRawDate } from '@erp-360/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';

import { titleRowTextClass } from '@/components/Financial/titleRowTone';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { type CompanyCard, companyCardService } from '@/services/companyCards';
import { personsService } from '@/services/persons';
import { treasuryService } from '@/services/treasury';

function chargeLabel(status: string, dueOn: string, today = civilDate()) {
  if (status === 'pago') return 'Pago';
  if (status === 'cancelado') return 'Cancelado';
  if (dueOn < today) return 'Atrasado';
  return 'Pendente';
}

const emptyForm = {
  name: '',
  issuerId: '',
  issuerName: '',
  closingDay: '1',
  dueDay: '10',
  bankAccountId: '',
  isActive: true,
};

export function CompanyCardsPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [issuerSearch, setIssuerSearch] = useState('');

  const cards = useQuery({
    queryKey: ['company-cards'],
    queryFn: companyCardService.list,
  });
  const statement = useQuery({
    queryKey: ['company-cards', selectedId, 'statement'],
    queryFn: () => companyCardService.statement(selectedId!),
    enabled: Boolean(selectedId),
  });
  const accounts = useQuery({
    queryKey: ['treasury', 'bank-accounts'],
    queryFn: treasuryService.bankAccounts,
  });
  const issuers = useQuery({
    queryKey: ['persons', 'instituicao', issuerSearch],
    queryFn: () =>
      personsService.list({
        page: 1,
        limit: 8,
        sortField: 'name',
        sortOrder: 'asc',
        type: 'instituicao',
        search: issuerSearch,
      }),
    enabled: open,
  });

  const save = useMutation({
    mutationFn: () => {
      const closingDay = Number(form.closingDay);
      const dueDay = Number(form.dueDay);
      if (!form.name.trim()) throw new Error('Informe o nome do cartão.');
      if (!form.issuerId) throw new Error('Informe o emissor.');
      if (!Number.isInteger(closingDay) || closingDay < 1 || closingDay > 28) {
        throw new Error('O fechamento vai do dia 1 ao 28.');
      }
      if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) {
        throw new Error('O vencimento vai do dia 1 ao 28.');
      }
      const payload = {
        name: form.name.trim(),
        issuerId: form.issuerId,
        closingDay,
        dueDay,
        bankAccountId: form.bankAccountId || null,
        isActive: form.isActive,
      };
      return editingId
        ? companyCardService.update(editingId, payload)
        : companyCardService.create(payload);
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ['company-cards'] });
      setOpen(false);
      setSelectedId(saved.id);
      toast.success('Cartão salvo.');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setIssuerSearch('');
    setOpen(true);
  };

  const openEdit = (card: CompanyCard) => {
    setEditingId(card.id);
    setForm({
      name: card.name,
      issuerId: card.issuerId,
      issuerName: card.issuerName,
      closingDay: String(card.closingDay),
      dueDay: String(card.dueDay),
      bankAccountId: card.bankAccountId ?? '',
      isActive: card.isActive,
    });
    setIssuerSearch('');
    setOpen(true);
  };

  const selectedStatement =
    statement.data?.card.id === selectedId ? statement.data : undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-zinc-900">Cartões da empresa</h3>
        <Button type="button" onClick={openNew}>
          Novo cartão
        </Button>
      </div>
      <p className="text-sm text-zinc-500">
        Cada compra lançada no cartão entra no extrato. O saldo em aberto é o que ainda
        não foi pago ao emissor.
      </p>
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <div className="rounded-md border bg-white">
          {cards.isLoading ? (
            <p className="p-4 text-sm text-zinc-500">Carregando cartões...</p>
          ) : (cards.data ?? []).length ? (
            (cards.data ?? []).map((card) => (
              <button
                key={card.id}
                type="button"
                className={`flex w-full flex-col items-start border-b px-4 py-3 text-left last:border-b-0 ${
                  selectedId === card.id ? 'bg-zinc-100' : 'hover:bg-zinc-50'
                } ${card.isActive ? '' : 'text-zinc-400'}`}
                onClick={() => setSelectedId(card.id)}
              >
                <span className="font-medium">{card.name}</span>
                <span className="text-sm text-zinc-500">{card.issuerName}</span>
                <span className="text-sm tabular-nums text-zinc-500">
                  Em aberto {formatCurrency(card.openBalance ?? 0)}
                </span>
              </button>
            ))
          ) : (
            <p className="p-4 text-sm text-zinc-500">Nenhum cartão cadastrado.</p>
          )}
        </div>

        <div className="rounded-md border bg-white">
          {selectedStatement ? (
            <>
              <div className="flex items-center justify-between border-b px-4 py-3">
                <div>
                  <p className="font-medium">{selectedStatement.card.name}</p>
                  <p className="text-sm text-zinc-500">
                    {selectedStatement.card.issuerName} · Fecha dia{' '}
                    {selectedStatement.card.closingDay} · Vence dia{' '}
                    {selectedStatement.card.dueDay}
                  </p>
                  <p className="text-sm text-zinc-500">
                    Em aberto {formatCurrency(selectedStatement.openBalance)}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openEdit(selectedStatement.card)}
                >
                  Editar
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Histórico</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedStatement.entries.length ? (
                    selectedStatement.entries.map((entry) => (
                      <TableRow
                        key={entry.id}
                        className={titleRowTextClass(entry.status, entry.dueOn)}
                      >
                        <TableCell>{formatRawDate(entry.occurredOn)}</TableCell>
                        <TableCell>
                          {entry.documentId ? (
                            <Link
                              to={`/inbound/${entry.documentId}`}
                              className="hover:underline"
                            >
                              {entry.description}
                            </Link>
                          ) : (
                            entry.description
                          )}
                        </TableCell>
                        <TableCell>{formatRawDate(entry.dueOn)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(entry.amount)}
                        </TableCell>
                        <TableCell>{chargeLabel(entry.status, entry.dueOn)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(entry.balance)}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="py-4 text-center text-zinc-500">
                        Nenhuma compra neste cartão.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </>
          ) : (
            <p className="p-6 text-sm text-zinc-500">
              {statement.isLoading
                ? 'Carregando extrato...'
                : statement.isError
                  ? 'Não foi possível carregar o extrato.'
                  : 'Selecione um cartão para ver o extrato.'}
            </p>
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar cartão' : 'Novo cartão'}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate();
            }}
          >
            <div className="space-y-1">
              <Label>Nome</Label>
              <Input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Emissor</Label>
              <p className="text-sm text-zinc-700">
                {form.issuerName || 'Não selecionado'}
              </p>
              <Input
                value={issuerSearch}
                placeholder="Buscar instituição financeira"
                onChange={(event) => setIssuerSearch(event.target.value)}
              />
              <ul>
                {(issuers.data?.data ?? []).map((person) => (
                  <li key={person.id}>
                    <button
                      type="button"
                      className="text-left text-sm text-zinc-700 hover:underline"
                      onClick={() => {
                        setForm({
                          ...form,
                          issuerId: person.id,
                          issuerName: person.name,
                        });
                        setIssuerSearch('');
                      }}
                    >
                      {person.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Dia de fechamento</Label>
                <Input
                  value={form.closingDay}
                  inputMode="numeric"
                  onChange={(event) =>
                    setForm({
                      ...form,
                      closingDay: event.target.value.replace(/\D/g, ''),
                    })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Dia de vencimento</Label>
                <Input
                  value={form.dueDay}
                  inputMode="numeric"
                  onChange={(event) =>
                    setForm({ ...form, dueDay: event.target.value.replace(/\D/g, '') })
                  }
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Conta que paga a fatura</Label>
              <select
                className="flex h-9 w-full rounded-md border px-3 text-sm"
                value={form.bankAccountId}
                onChange={(event) =>
                  setForm({ ...form, bankAccountId: event.target.value })
                }
              >
                <option value="">Nenhuma</option>
                {(accounts.data ?? []).map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
              />
              Ativo
            </label>
            <Button type="submit" disabled={save.isPending}>
              Salvar
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
