import { planAccountNatureLabels } from '@erp-360/shared';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useNavigate, useParams } from 'react-router';

import { Button } from '@/components/ui/button';
import { planAccountsService } from '@/services/planAccounts';

import { FormPlanAccount } from './FormPlanAccount';

function listReturn(state: unknown) {
  const from = (state as { from?: unknown } | null)?.from;
  if (
    from === '/plan-accounts' ||
    (typeof from === 'string' && from.startsWith('/plan-accounts?')) ||
    from === '/income-statement' ||
    (typeof from === 'string' && from.startsWith('/income-statement?'))
  ) {
    return from;
  }
  return '/plan-accounts';
}

export function PlanAccountPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const backTo = listReturn(location.state);
  const leave = () => navigate(backTo);

  const account = useQuery({
    queryKey: ['plan-account', id],
    queryFn: () => planAccountsService.get(id ?? ''),
    enabled: Boolean(id),
  });

  if (id && account.isLoading) return <p>Carregando plano de contas...</p>;

  if (id && (account.isError || !account.data)) {
    return (
      <div className="space-y-4">
        <p className="text-red-600">Não foi possível carregar o plano de contas.</p>
        <Button variant="outline" asChild>
          <Link to={backTo}>Voltar à lista</Link>
        </Button>
      </div>
    );
  }

  const loaded = account.data;
  const subtitle = loaded
    ? `${loaded.accountCode} · ${planAccountNatureLabels[loaded.nature]}`
    : 'Código, natureza e nome.';

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#172337]">
            {id ? 'Editar plano de contas' : 'Novo plano de contas'}
          </h2>
          <p className="mt-1 text-sm text-[#64748b]">{subtitle}</p>
        </div>
        <Button variant="outline" asChild>
          <Link to={backTo}>Voltar à lista</Link>
        </Button>
      </div>
      <div className="rounded-lg border bg-white p-6">
        <FormPlanAccount
          key={id ?? 'new'}
          accountToUpdate={loaded ?? null}
          onCancel={leave}
          onSuccess={leave}
          onDeleted={leave}
        />
      </div>
    </div>
  );
}
