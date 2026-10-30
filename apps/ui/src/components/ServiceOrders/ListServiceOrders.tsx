import { useQuery } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';

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
  serviceOrdersService,
  type ServiceOrderStatus,
} from '@/services/serviceOrders';

const statusLabels: Record<ServiceOrderStatus, string> = {
  open: 'Aberta',
  analyzing: 'Em análise',
  waiting_approval: 'Aguardando aprovação',
  waiting_parts: 'Aguardando peça',
  in_progress: 'Em execução',
  ready: 'Pronta',
  delivered: 'Entregue',
  cancelled: 'Cancelada',
};

const statuses = Object.keys(statusLabels) as ServiceOrderStatus[];

function formatWhen(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

export function ListServiceOrders() {
  const navigate = useNavigate();
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ServiceOrderStatus | 'all'>('all');

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchText.trim()), 400);
    return () => clearTimeout(timer);
  }, [searchText]);

  const settings = useQuery({
    queryKey: ['settings', 'service-order'],
    queryFn: serviceOrdersService.getSettings,
  });

  const list = useQuery({
    queryKey: ['service-orders', { q: search, status }],
    queryFn: () =>
      serviceOrdersService.list({
        q: search || undefined,
        status: status === 'all' ? undefined : status,
      }),
  });

  const rows = list.data?.data ?? [];
  const summaryLabel =
    rows[0]?.summaryLabel ||
    settings.data?.fields.find((field) => field.slot === settings.data.summarySlot)?.label ||
    'Resumo';

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900">Ordens de serviço</h2>
          <p className="text-sm text-zinc-500">Número, cliente, previsão e situação.</p>
        </div>
        <Button asChild>
          <Link to="/service-orders/new">
            <Plus className="h-4 w-4" />
            Nova ordem
          </Link>
        </Button>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute top-2.5 left-2.5 h-4 w-4 text-zinc-400" />
          <Input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Número, cliente ou campo"
            className="pl-9"
          />
        </div>
        <Select
          value={status}
          onValueChange={(value) => setStatus(value as ServiceOrderStatus | 'all')}
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
              <TableHead>{summaryLabel}</TableHead>
              <TableHead>Abertura</TableHead>
              <TableHead>Previsão</TableHead>
              <TableHead>Situação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-zinc-500">
                  Carregando as ordens...
                </TableCell>
              </TableRow>
            ) : list.isError ? (
              <TableRow>
                <TableCell colSpan={6} className="text-red-600">
                  Não foi possível carregar as ordens.
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-zinc-500">
                  Ainda não há ordem.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/service-orders/${row.id}`)}
                >
                  <TableCell>
                    <Link to={`/service-orders/${row.id}`} className="font-medium text-zinc-900">
                      {row.numberLabel}
                    </Link>
                  </TableCell>
                  <TableCell>{row.customerName}</TableCell>
                  <TableCell>{row.summaryValue?.trim() || '—'}</TableCell>
                  <TableCell>{formatWhen(row.openedAt)}</TableCell>
                  <TableCell>{formatWhen(row.promisedAt)}</TableCell>
                  <TableCell>{statusLabels[row.status]}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
