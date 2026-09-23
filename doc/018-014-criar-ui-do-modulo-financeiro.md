Vamos construir as telas de gerenciamento financeiro (Contas a Pagar e Contas a Receber) no frontend React (apps/ui). Criaremos uma estrutura unificada onde o usuário poderá alternar entre as abas de "Pagar" e "Receber", utilizando os componentes de tabela, modais do shadcn/ui, os utilitários de formatação do @erp-360/shared e o TanStack Query.
Antes de começar, certifique-se de ter o componente de abas do shadcn instalado no frontend. Se não tiver, execute no terminal:

```bash
cd apps/ui
pnpm dlx shadcn@latest add tabs select
```

---

## 🌐 Passo 1: Criar o Serviço de API Financeiro (apps/ui/src/services/financials.ts)

Crie o arquivo para mapear as requisições HTTP dos endpoints /financial/payable e /financial/receivable:

```ts
import { API_URL } from '@erp-360/shared';

import { authStorage } from '../utils/auth';

export interface FinancialAccount {
  id: string;
  personId: string;
  document?: string;
  description: string;
  issueDate: string;
  amount: number;
  dueDate: string;
  paymentDate?: string;
  amountPaid?: number;
  status: 'pendente' | 'pago' | 'cancelado';
}

type FinancialTipo = 'payable' | 'receivable';

const authHeaders = () => ({
  Authorization: `Bearer ${authStorage.getToken()}`,
});

const jsonHeaders = () => ({
  'Content-Type': 'application/json',
  ...authHeaders(),
});

const collection = (tipo: FinancialTipo) =>
  tipo === 'payable' ? 'payables' : 'receivables';

function normalizeAccount(item: Record<string, unknown>): FinancialAccount {
  return {
    id: String(item.id),
    personId: String(item.personId),
    document: item.document ? String(item.document) : undefined,
    description: String(item.description ?? ''),
    issueDate: String(item.issueDate ?? ''),
    amount: Number(item.amount ?? 0),
    dueDate: String(item.dueDate ?? ''),
    paymentDate:
      (item.paymentDate as string | undefined) ||
      (item.receiveDate as string | undefined),
    amountPaid:
      (item.amountPaid as number | undefined) ??
      (item.amountReceived as number | undefined),
    status: (item.status as FinancialAccount['status']) ?? 'pendente',
  };
}

async function parseJson(res: Response) {
  return res.json().catch(() => ({}));
}

export const financialService = {
  list: async (tipo: FinancialTipo): Promise<FinancialAccount[]> => {
    const res = await fetch(`${API_URL}/${collection(tipo)}`, {
      headers: authHeaders(),
    });
    const body = await parseJson(res);
    if (!res.ok) {
      throw new Error(body.message || body.error || 'Falha ao listar lançamentos.');
    }
    if (!Array.isArray(body)) return [];
    return body.map((item) => normalizeAccount(item as Record<string, unknown>));
  },
  create: async (
    tipo: FinancialTipo,
    dados: Omit<FinancialAccount, 'id' | 'status'>,
  ): Promise<FinancialAccount> => {
    const res = await fetch(`${API_URL}/${collection(tipo)}`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify(dados),
    });
    const body = await parseJson(res);
    if (!res.ok) {
      throw new Error(body.message || body.error || 'Falha ao lançar conta.');
    }
    return normalizeAccount(body as Record<string, unknown>);
  },
  pay: async (
    tipo: FinancialTipo,
    id: string,
    dados: { paymentDate: string; amountPaid: number },
  ): Promise<FinancialAccount> => {
    const endpoint = tipo === 'payable' ? 'pay' : 'receive';
    const payload =
      tipo === 'payable'
        ? dados
        : { receiveDate: dados.paymentDate, amountReceived: dados.amountPaid };

    const res = await fetch(`${API_URL}/${collection(tipo)}/${id}/${endpoint}`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify(payload),
    });
    const body = await parseJson(res);
    if (!res.ok) {
      throw new Error(body.message || body.error || 'Falha ao liquidar título.');
    }
    return normalizeAccount(body as Record<string, unknown>);
  },
};
```

---

## 📝 Passo 2: Componente de Lançamento Contas a Pagar (PayableForm.tsx)

Este modal servirá para lançar Contas a Pagar, carregando a lista de persons dinamicamente para vincular ao título.
Crie o arquivo em apps/ui/src/components/Financial/Payables/PayableForm.tsx:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { financialService } from '@/services/financials';
import { personsService } from '@/services/persons';

interface PayableFormProps {
  tipo: 'payable' | 'receivable';
  onSuccess: () => void;
}

export function PayableForm({ tipo, onSuccess }: PayableFormProps) {
  const queryClient = useQueryClient();
  const [personId, setPersonId] = useState('');
  const [document, setDocument] = useState('');
  const [description, setDescription] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [dueDate, setDueDate] = useState('');

  const { data: persons } = useQuery({
    queryKey: ['personsList', tipo],
    queryFn: () => personsService.list(tipo === 'payable' ? 'fornecedor' : 'cliente'),
  });

  const mutation = useMutation({
    mutationFn: (data: any) => financialService.create(tipo, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial', tipo] });
      toast.success(
        tipo === 'payable'
          ? 'Conta a pagar lançada com sucesso!'
          : 'Conta a receber lançada com sucesso!',
      );
      onSuccess();
    },
    onError: (err: any) => toast.error(`Erro: ${err.message}`),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!personId || !description || !amountStr || !dueDate) return;

    const amountCentavos = Math.round(parseFloat(amountStr.replace(',', '.')) * 100);

    mutation.mutate({
      personId,
      document: document || undefined,
      description,
      amount: amountCentavos,
      dueDate,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-2">
      <div className="space-y-1">
        <Label>Fornecedor / Favorecido</Label>
        <Select value={personId} onValueChange={setPersonId} required>
          <SelectTrigger>
            <SelectValue
              placeholder={
                tipo === 'payable'
                  ? 'Selecione um fornecedor...'
                  : 'Selecione um cliente...'
              }
            />
          </SelectTrigger>
          <SelectContent>
            {persons?.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="document">Nº Documento / NF</Label>
          <Input
            id="document"
            value={document}
            onChange={(e) => setDocument(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="dueDate">Vencimento</Label>
          <Input
            id="dueDate"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="description">Descrição</Label>
        <Input
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="amount">Valor Original (R\$)</Label>
        <Input
          id="amount"
          type="number"
          step="0.01"
          value={amountStr}
          onChange={(e) => setAmountStr(e.target.value)}
          required
        />
      </div>

      <Button type="submit" className="w-full mt-2" disabled={mutation.isPending}>
        {mutation.isPending ? 'Salvando...' : 'Confirmar Lançamento'}
      </Button>
    </form>
  );
}
```

---

## 📝 Passo 3: Componente de Lista Contas a Pagar (PayableList.tsx)

Este componente servirá para listar Contas a Pagar.
Crie o arquivo em apps/ui/src/components/Financial/Payables/PayableList.tsx:

```ts
import { formatCurrency, formatRawDate } from '@erp-360/shared';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { type FinancialAccount, financialService } from '@/services/financials';

import { PayModal } from '../PayModal';

export function PayableList() {
  const [openPay, setOpenPay] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<FinancialAccount | null>(null);

  const { data: accounts, isLoading } = useQuery({
    queryKey: ['financial', 'payable'],
    queryFn: () => financialService.list('payable'),
  });

  const handlePay = (account: FinancialAccount) => {
    setSelectedAccount(account);
    setOpenPay(true);
  };

  if (isLoading)
    return <p className="text-sm text-zinc-500">Carregando contas a pagar...</p>;

  return (
    <div className="rounded-md border border-zinc-200 bg-white shadow-2xs">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Descrição</TableHead>
            <TableHead>Documento</TableHead>
            <TableHead>Vencimento</TableHead>
            <TableHead>Valor</TableHead>
            <TableHead>Pago</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-[100px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {accounts?.map((acc) => (
            <TableRow key={acc.id}>
              <TableCell className="font-medium">{acc.description}</TableCell>
              <TableCell>{acc.document || '-'}</TableCell>
              <TableCell>{formatRawDate(acc.dueDate)}</TableCell>
              <TableCell className="text-red-600">{formatCurrency(acc.amount)}</TableCell>
              <TableCell>
                {acc.amountPaid ? formatCurrency(acc.amountPaid) : '-'}
              </TableCell>
              <TableCell>
                <span
                  className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                    acc.status === 'pago'
                      ? 'bg-emerald-50 text-emerald-600'
                      : 'bg-amber-50 text-amber-600'
                  }`}
                >
                  {acc.status}
                </span>
              </TableCell>
              <TableCell>
                {acc.status === 'pendente' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePay(acc)}
                    className="h-7 text-xs border-emerald-200 text-emerald-600 hover:bg-emerald-50 gap-1"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Pagar
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={openPay} onOpenChange={setOpenPay}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Liquidar Conta a Pagar</DialogTitle>
          </DialogHeader>
          {selectedAccount && (
            <PayModal
              tipo="payable"
              account={selectedAccount}
              onSuccess={() => setOpenPay(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

---

## 📝 Passo 4: Componente de Lançamento Contas a Receber (ReceivableForm.tsx)

Este modal servirá para lançar Contas a Receber, carregando a lista de persons dinamicamente para vincular ao título.
Crie o arquivo em apps/ui/src/components/Financial/Receivables/ReceivableForm.tsx:

```ts

```

---

## 📝 Passo 5: Componente de Lista Contas a Receber (ReceivableList.tsx)

Este componente servirá para listar Contas a Pagar.
Crie o arquivo em apps/ui/src/components/Financial/Payables/PayableList.tsx:

```ts

```

---

## 📊 Passo 6: Componente de Baixa e Liquidação (PayModal.tsx)

Criamos um pequeno componente de formulário para ser exibido dentro do modal de liquidação quando o usuário for quitar/receber um título.
Crie o arquivo em apps/ui/src/components/Financial/ModalBaixa.tsx:

```ts

```

---

## 🗂️ Passo 7: Painel de Abas Financeiras Geral (FinancialPanel.tsx)

Agora, criamos a tela máster que reúne as duas abas utilizando as tabelas do shadcn/ui e injetando as funções de formatação global.
Crie o arquivo em apps/ui/src/components/Financial/FinancialPanel.tsx:

```ts

```

---

## 🎨 Passo 8: Vincular no App Principal (apps/ui/src/App.tsx)

Para exibir o painel financeiro na tela, mude a renderização principal do seu App.tsx para acoplar os dois módulos que criamos:

```ts

```
