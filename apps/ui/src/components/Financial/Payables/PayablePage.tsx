import { formatCurrency } from '@erp-360/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { financialService } from '@/services/financials';

import { PayableForm } from './PayableForm';
import { PayModal } from './PayModal';

function listReturn(state: unknown) {
  const from = (state as { from?: unknown } | null)?.from;
  if (
    from === '/payables' ||
    (typeof from === 'string' && from.startsWith('/payables?'))
  ) {
    return from;
  }
  return '/payables';
}

export function PayablePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const backTo = listReturn(location.state);
  const leave = () => navigate(backTo);
  const [paying, setPaying] = useState(false);

  const account = useQuery({
    queryKey: ['financial', 'payable', id],
    queryFn: () => financialService.get('payable', id ?? ''),
    enabled: Boolean(id),
  });

  if (id && account.isLoading) return <p>Carregando conta a pagar...</p>;

  if (id && (account.isError || !account.data)) {
    return (
      <div className="space-y-4">
        <p className="text-red-600">Não foi possível carregar a conta a pagar.</p>
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
    : 'Credor, vencimento e valor.';

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#172337]">
            {id ? 'Conta a pagar' : 'Nova conta a pagar'}
          </h2>
          <p className="mt-1 text-sm text-[#64748b]">{subtitle}</p>
        </div>
        <Button variant="outline" asChild>
          <Link to={backTo}>Voltar à lista</Link>
        </Button>
      </div>
      <div className="rounded-lg border bg-white p-6">
        <PayableForm
          key={id ?? 'new'}
          accountToUpdate={loaded ?? null}
          onCancel={leave}
          onSuccess={leave}
          onDeleted={leave}
          onPay={loaded?.status === 'pendente' ? () => setPaying(true) : undefined}
          onReplicate={
            loaded
              ? () =>
                  navigate(`/payables/${loaded.id}/replicate`, {
                    state: { from: backTo },
                  })
              : undefined
          }
        />
      </div>

      <Dialog open={paying} onOpenChange={setPaying}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Liquidar conta a pagar</DialogTitle>
          </DialogHeader>
          {loaded ? (
            <PayModal
              tipo="payable"
              account={loaded}
              onSuccess={() => setPaying(false)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
