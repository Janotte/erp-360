import { formatCurrency } from '@erp-360/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { financialService } from '@/services/financials';

import { PayModal } from '../Payables/PayModal';
import { ReceivableForm } from './ReceivableForm';

function listReturn(state: unknown) {
  const from = (state as { from?: unknown } | null)?.from;
  if (
    from === '/receivables' ||
    (typeof from === 'string' && from.startsWith('/receivables?'))
  ) {
    return from;
  }
  return '/receivables';
}

export function ReceivablePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const backTo = listReturn(location.state);
  const leave = () => navigate(backTo);
  const [receiving, setReceiving] = useState(false);

  const account = useQuery({
    queryKey: ['financial', 'receivable', id],
    queryFn: () => financialService.get('receivable', id ?? ''),
    enabled: Boolean(id),
  });

  if (id && account.isLoading) return <p>Carregando conta a receber...</p>;

  if (id && (account.isError || !account.data)) {
    return (
      <div className="space-y-4">
        <p className="text-red-600">Não foi possível carregar a conta a receber.</p>
        <Button variant="outline" asChild>
          <Link to={backTo}>Voltar à lista</Link>
        </Button>
      </div>
    );
  }

  const loaded = account.data;
  const subtitle = loaded
    ? [loaded.description, loaded.personName, formatCurrency(loaded.installmentAmount)]
        .filter(Boolean)
        .join(' · ')
    : 'Cliente, vencimento e valor.';

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#172337]">
            {id ? 'Conta a receber' : 'Nova conta a receber'}
          </h2>
          <p className="mt-1 text-sm text-[#64748b]">{subtitle}</p>
        </div>
        <Button variant="outline" asChild>
          <Link to={backTo}>Voltar à lista</Link>
        </Button>
      </div>
      <div className="rounded-lg border bg-white p-6">
        <ReceivableForm
          key={id ?? 'new'}
          accountToUpdate={loaded ?? null}
          onCancel={leave}
          onSuccess={leave}
          onDeleted={leave}
          onReceive={loaded?.status === 'pendente' ? () => setReceiving(true) : undefined}
          onReplicate={
            loaded
              ? () =>
                  navigate(`/receivables/${loaded.id}/replicate`, {
                    state: { from: backTo },
                  })
              : undefined
          }
        />
      </div>

      <Dialog open={receiving} onOpenChange={setReceiving}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Receber conta</DialogTitle>
          </DialogHeader>
          {loaded ? (
            <PayModal
              tipo="receivable"
              account={loaded}
              onSuccess={() => setReceiving(false)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
