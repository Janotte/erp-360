import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useNavigate, useParams } from 'react-router';

import { Button } from '@/components/ui/button';
import {
  type BankAccount,
  type BankAccountKind,
  treasuryService,
} from '@/services/treasury';

import { BankAccountForm } from './BankAccountForm';

function listReturn(state: unknown) {
  const from = (state as { from?: unknown } | null)?.from;
  if (
    from === '/bank-accounts' ||
    (typeof from === 'string' && from.startsWith('/bank-accounts?'))
  ) {
    return from;
  }
  return '/bank-accounts';
}

function initialKind(state: unknown): BankAccountKind {
  const kind = (state as { kind?: unknown } | null)?.kind;
  return kind === 'investment' ? 'investment' : 'operating';
}

function accountKind(account: Pick<BankAccount, 'kind'>): BankAccountKind {
  return account.kind === 'investment' ? 'investment' : 'operating';
}

export function BankAccountPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const backTo = listReturn(location.state);
  const leave = () => navigate(backTo);

  const accounts = useQuery({
    queryKey: ['treasury', 'bank-accounts'],
    queryFn: treasuryService.bankAccounts,
    enabled: Boolean(id),
  });

  const account = accounts.data?.find((item) => item.id === id);

  const openSaved = (saved: BankAccount) => {
    const [path, query = ''] = backTo.split('?');
    const params = new URLSearchParams(query);
    params.set('conta', saved.id);
    if (accountKind(saved) === 'investment') params.set('aba', 'investment');
    else params.delete('aba');
    const search = params.toString();
    navigate(search ? `${path}?${search}` : path);
  };

  if (id && accounts.isLoading) return <p>Carregando conta bancária...</p>;

  if (id && (accounts.isError || !account)) {
    return (
      <div className="space-y-4">
        <p className="text-red-600">Não foi possível carregar a conta bancária.</p>
        <Button variant="outline" asChild>
          <Link to={backTo}>Voltar à lista</Link>
        </Button>
      </div>
    );
  }

  const subtitle = account
    ? [account.branchNumber, account.accountCode].filter(Boolean).join(' · ') ||
      account.name
    : 'Nome, tipo e saldo inicial.';

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#172337]">
            {id ? 'Editar conta bancária' : 'Nova conta bancária'}
          </h2>
          <p className="mt-1 text-sm text-[#64748b]">{subtitle}</p>
        </div>
        <Button variant="outline" asChild>
          <Link to={backTo}>Voltar à lista</Link>
        </Button>
      </div>
      <div className="rounded-lg border bg-white p-6">
        <BankAccountForm
          key={id ?? 'new'}
          accountToUpdate={account ?? null}
          initialKind={initialKind(location.state)}
          onCancel={leave}
          onSuccess={openSaved}
        />
      </div>
    </div>
  );
}
