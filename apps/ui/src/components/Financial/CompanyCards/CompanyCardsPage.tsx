import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

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
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [issuerSearch, setIssuerSearch] = useState('');

  const cards = useQuery({
    queryKey: ['company-cards'],
    queryFn: companyCardService.list,
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
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['company-cards'] });
      setOpen(false);
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-zinc-900">Cartões da empresa</h3>
        <Button type="button" onClick={openNew}>
          Novo cartão
        </Button>
      </div>
      <p className="text-sm text-zinc-500">
        A compra paga no cartão gera título para o emissor, no vencimento da fatura. O
        fornecedor não fica em aberto.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Emissor</TableHead>
            <TableHead>Fechamento</TableHead>
            <TableHead>Vencimento</TableHead>
            <TableHead>Conta</TableHead>
            <TableHead>Situação</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(cards.data ?? []).map((card) => (
            <TableRow
              key={card.id}
              className="cursor-pointer"
              onClick={() => openEdit(card)}
            >
              <TableCell>{card.name}</TableCell>
              <TableCell>{card.issuerName}</TableCell>
              <TableCell>Dia {card.closingDay}</TableCell>
              <TableCell>Dia {card.dueDay}</TableCell>
              <TableCell>{card.bankAccountName || '—'}</TableCell>
              <TableCell>{card.isActive ? 'Ativo' : 'Inativo'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

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
