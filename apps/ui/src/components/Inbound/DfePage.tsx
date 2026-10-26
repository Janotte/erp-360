import { formatCurrency } from '@erp-360/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { type DfeDocumentKind, dfeService, type DfeSyncResult } from '@/services/dfe';

const environmentLabel = {
  homologation: 'Homologação',
  production: 'Produção',
} as const;

const kindLabel: Record<DfeDocumentKind, string> = {
  summary: 'Resumo',
  nfe: 'XML completo',
  event_summary: 'Resumo de evento',
  event: 'Evento',
  unknown: 'Outro',
};

const eventLabel: Record<string, string> = {
  '210200': 'Confirmação',
  '210210': 'Ciência',
  '210220': 'Desconhecimento',
  '210240': 'Não realizada',
};

const statusLabel: Record<string, string> = {
  '137': 'nenhum documento',
  '138': 'documentos localizados',
  '656': 'consumo indevido',
};

function digitsOf(value: string) {
  return value.replace(/\D/g, '').slice(0, 44);
}

function formatWhen(iso: string | null) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function syncMessage(result: DfeSyncResult) {
  const until = formatWhen(result.blockedUntil);
  if (until) return `A SEFAZ pediu espera. Próxima consulta depois de ${until}.`;
  if (result.received === 0) return 'Nenhum documento novo.';
  return result.received === 1
    ? '1 documento recebido.'
    : `${result.received} documentos recebidos.`;
}

function documentKind(kind: DfeDocumentKind, eventType: string | null) {
  const label = kindLabel[kind];
  if (!eventType) return label;
  return `${label} · ${eventLabel[eventType] ?? eventType}`;
}

export function DfePage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState('');
  const digits = digitsOf(search);
  const list = useQuery({
    queryKey: ['inbound', 'dfe', applied],
    queryFn: () => dfeService.list(applied),
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['inbound', 'dfe'] });
  };

  const sync = useMutation({
    mutationFn: () => dfeService.sync(),
    onSuccess: async (result) => {
      toast.success(syncMessage(result));
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const lookupTerm = digits.length === 44 ? digits : digits.padStart(15, '0');
  const lookup = useMutation({
    mutationFn: () =>
      digits.length === 44
        ? dfeService.lookup({ accessKey: digits })
        : dfeService.lookup({ nsu: lookupTerm }),
    onSuccess: async (result) => {
      toast.success(syncMessage(result));
      setApplied(lookupTerm);
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const cursor = list.data?.cursor;
  const consultedAt = formatWhen(cursor?.queriedAt ?? null);
  const canLookup = digits.length > 0 && (digits.length <= 15 || digits.length === 44);
  const busy = sync.isPending || lookup.isPending;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900">DF-e</h2>
          <p className="text-sm text-zinc-500">
            Documentos baixados da distribuição da NF-e no ambiente configurado.
          </p>
        </div>
        <Button type="button" onClick={() => sync.mutate()} disabled={busy}>
          Buscar na SEFAZ
        </Button>
      </div>

      {list.data ? (
        <p className="text-sm text-zinc-600">
          {environmentLabel[list.data.environment]}
          {cursor
            ? ` · último NSU ${cursor.ultNsu} · máximo ${cursor.maxNsu}`
            : ''}
          {consultedAt ? ` · consultado em ${consultedAt}` : ''}
          {cursor?.lastStatus
            ? ` · ${statusLabel[cursor.lastStatus] ?? `situação ${cursor.lastStatus}`}`
            : ''}
        </p>
      ) : null}

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setApplied(digits);
        }}
      >
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Chave de acesso ou NSU"
          aria-label="Chave de acesso ou NSU"
          className="max-w-md"
        />
        <Button type="submit" variant="outline">
          Pesquisar
        </Button>
        {canLookup ? (
          <Button type="button" variant="outline" onClick={() => lookup.mutate()} disabled={busy}>
            {digits.length === 44 ? 'Consultar esta chave na SEFAZ' : 'Consultar este NSU na SEFAZ'}
          </Button>
        ) : null}
      </form>

      {list.isError ? (
        <p className="text-sm text-red-600">{(list.error as Error).message}</p>
      ) : null}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>NSU</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Emitente</TableHead>
            <TableHead>Chave</TableHead>
            <TableHead>Valor</TableHead>
            <TableHead>Recebido</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.isPending ? (
            <TableRow>
              <TableCell colSpan={6}>Carregando...</TableCell>
            </TableRow>
          ) : (list.data?.documents.length ?? 0) === 0 ? (
            <TableRow>
              <TableCell colSpan={6}>Nenhum documento baixado neste ambiente.</TableCell>
            </TableRow>
          ) : (
            list.data?.documents.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="tabular-nums">{row.nsu}</TableCell>
                <TableCell>{documentKind(row.kind, row.eventType)}</TableCell>
                <TableCell>{row.partyName || '—'}</TableCell>
                <TableCell className="max-w-xs break-all font-mono text-xs">
                  {row.accessKey || '—'}
                </TableCell>
                <TableCell>{row.amount == null ? '—' : formatCurrency(row.amount)}</TableCell>
                <TableCell>{formatWhen(row.receivedAt) ?? '—'}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
