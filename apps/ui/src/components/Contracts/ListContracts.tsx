import { formatCurrency } from '@erp-360/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  billingConfirmText,
  billingDoneText,
  type ContractBillingKind,
  type ContractBillingResult,
  type ContractListItem,
  contractsService,
  type ContractStatus,
} from '@/services/contracts';

const statusLabels: Record<ContractStatus, string> = {
  draft: 'Rascunho',
  active: 'Vigente',
  suspended: 'Suspenso',
  closed: 'Encerrado',
  cancelled: 'Cancelado',
};

const billingKindLabels: Record<ContractBillingKind, string> = {
  none: 'Sem cobrança',
  monthly: 'Mensal',
  quarterly: 'Trimestral',
  semiannual: 'Semestral',
  annual: 'Anual',
};

const statuses = Object.keys(statusLabels) as ContractStatus[];

function formatDate(value: string | null) {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function termLabel(row: ContractListItem) {
  const start = formatDate(row.startedOn);
  if (!row.endedOn) return `${start} · indeterminado`;
  return `${start} – ${formatDate(row.endedOn)}`;
}

function billingLabel(row: ContractListItem) {
  if (row.billingKind === 'none') return 'Sem cobrança';
  return `${formatCurrency(row.periodAmount)} · ${billingKindLabels[row.billingKind]}`;
}

export function ListContracts() {
  const navigate = useNavigate();
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ContractStatus | 'all'>('all');
  const [billingPreview, setBillingPreview] = useState<ContractBillingResult | null>(
    null,
  );

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchText.trim()), 400);
    return () => clearTimeout(timer);
  }, [searchText]);

  const list = useQuery({
    queryKey: ['contracts', { q: search, status }],
    queryFn: () =>
      contractsService.list({
        q: search || undefined,
        status: status === 'all' ? undefined : status,
      }),
  });

  const previewBillings = useMutation({
    mutationFn: () => contractsService.previewBillings(),
    onSuccess: (result) => {
      if (result.titles === 0) {
        setBillingPreview(null);
        toast.message('Nenhuma parcela pronta para cobrança.');
        return;
      }
      setBillingPreview(result);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Falha ao consultar a cobrança.');
    },
  });

  const generateBillings = useMutation({
    mutationFn: () => contractsService.generateBillings(),
    onSuccess: (result) => {
      setBillingPreview(null);
      if (result.failures.length > 0) toast.error(billingDoneText(result));
      else if (result.titles === 0)
        toast.message('Nenhuma parcela pronta para cobrança.');
      else toast.success(billingDoneText(result));
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Falha ao gerar a cobrança.');
    },
  });

  const billingPending = previewBillings.isPending || generateBillings.isPending;
  const rows = list.data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900">Contratos</h2>
          <p className="text-sm text-zinc-500">
            Cliente, vigência e cobrança do período.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={billingPending}
            onClick={() => previewBillings.mutate()}
          >
            Gerar cobranças
          </Button>
          <Button asChild>
            <Link to="/contracts/new">
              <Plus className="h-4 w-4" />
              Novo contrato
            </Link>
          </Button>
        </div>
      </div>

      {billingPreview ? (
        <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-zinc-700">{billingConfirmText(billingPreview)}</p>
          <div className="flex gap-2">
            <Button
              type="button"
              disabled={billingPending}
              onClick={() => generateBillings.mutate()}
            >
              Confirmar
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={billingPending}
              onClick={() => setBillingPreview(null)}
            >
              Voltar
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute top-2.5 left-2.5 h-4 w-4 text-zinc-400" />
          <Input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Número, título ou cliente"
            className="pl-9"
          />
        </div>
        <Select
          value={status}
          onValueChange={(value) => setStatus(value as ContractStatus | 'all')}
        >
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue placeholder="Situação" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as situações</SelectItem>
            {statuses.map((value) => (
              <SelectItem key={value} value={value}>
                {statusLabels[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border border-zinc-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Número</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Título</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead>Vigência</TableHead>
              <TableHead>Cobrança</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-zinc-500">
                  Carregando os contratos...
                </TableCell>
              </TableRow>
            ) : list.isError ? (
              <TableRow>
                <TableCell colSpan={6} className="text-red-600">
                  Não foi possível carregar os contratos.
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-zinc-500">
                  Ainda não há contrato.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/contracts/${row.id}`)}
                >
                  <TableCell>
                    <Link
                      to={`/contracts/${row.id}`}
                      className="font-medium text-zinc-900"
                    >
                      {row.numberLabel}
                    </Link>
                  </TableCell>
                  <TableCell>{row.customerName}</TableCell>
                  <TableCell>{row.title}</TableCell>
                  <TableCell>
                    {statusLabels[row.status]}
                    {row.termExpired ? (
                      <span className="mt-1 block text-xs text-amber-700">
                        Vigência vencida
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>{termLabel(row)}</TableCell>
                  <TableCell>{billingLabel(row)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
