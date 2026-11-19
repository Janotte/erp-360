import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useNavigate, useParams } from 'react-router';

import { Button } from '@/components/ui/button';
import { companyCardService } from '@/services/companyCards';

import { CompanyCardForm } from './CompanyCardForm';

function listReturn(state: unknown) {
  const from = (state as { from?: unknown } | null)?.from;
  if (
    from === '/company-cards' ||
    (typeof from === 'string' && from.startsWith('/company-cards?'))
  ) {
    return from;
  }
  return '/company-cards';
}

export function CompanyCardPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const backTo = listReturn(location.state);
  const leave = () => navigate(backTo);

  const cards = useQuery({
    queryKey: ['company-cards'],
    queryFn: companyCardService.list,
    enabled: Boolean(id),
  });

  const card = cards.data?.find((item) => item.id === id);

  const openSaved = (saved: { id: string }) => {
    const [path, query = ''] = backTo.split('?');
    const params = new URLSearchParams(query);
    params.set('cartao', saved.id);
    const search = params.toString();
    navigate(search ? `${path}?${search}` : path);
  };

  if (id && cards.isLoading) return <p>Carregando cartão...</p>;

  if (id && (cards.isError || !card)) {
    return (
      <div className="space-y-4">
        <p className="text-red-600">Não foi possível carregar o cartão.</p>
        <Button variant="outline" asChild>
          <Link to={backTo}>Voltar à lista</Link>
        </Button>
      </div>
    );
  }

  const subtitle = card
    ? `${card.issuerName} · Fecha dia ${card.closingDay} · Vence dia ${card.dueDay}`
    : 'Emissor, fechamento e vencimento.';

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#172337]">
            {id ? 'Editar cartão' : 'Novo cartão'}
          </h2>
          <p className="mt-1 text-sm text-[#64748b]">{subtitle}</p>
        </div>
        <Button variant="outline" asChild>
          <Link to={backTo}>Voltar à lista</Link>
        </Button>
      </div>
      <div className="rounded-lg border bg-white p-6">
        <CompanyCardForm
          key={id ?? 'new'}
          cardToUpdate={card ?? null}
          onCancel={leave}
          onSuccess={openSaved}
        />
      </div>
    </div>
  );
}
