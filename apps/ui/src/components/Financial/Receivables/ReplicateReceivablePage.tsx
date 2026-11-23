import { formatCurrency } from '@erp-360/shared';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useNavigate, useParams } from 'react-router';

import { Button } from '@/components/ui/button';
import { financialService } from '@/services/financials';

import { ReplicateReceivableDialog } from './ReplicateReceivableDialog';

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

export function ReplicateReceivablePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const backTo = listReturn(location.state);
  const accountTo = `/receivables/${id ?? ''}`;
  const leaveAccount = () => navigate(accountTo, { state: { from: backTo } });
  const openCreated = (createdId: string) =>
    navigate(`/receivables/${createdId}`, { state: { from: backTo } });

  const account = useQuery({
    queryKey: ['financial', 'receivable', id],
    queryFn: () => financialService.get('receivable', id ?? ''),
    enabled: Boolean(id),
  });

  if (account.isLoading) return <p>Carregando conta a receber...</p>;

  if (account.isError || !account.data) {
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
  const subtitle = [
    loaded.description,
    loaded.personName,
    formatCurrency(loaded.installmentAmount),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#172337]">Replicar conta a receber</h2>
          <p className="mt-1 text-sm text-[#64748b]">{subtitle}</p>
        </div>
        <Button variant="outline" asChild>
          <Link to={backTo}>Voltar à lista</Link>
        </Button>
      </div>
      <div className="rounded-lg border bg-white p-6">
        <ReplicateReceivableDialog
          source={loaded}
          onCancel={leaveAccount}
          onSuccess={openCreated}
        />
      </div>
    </div>
  );
}
