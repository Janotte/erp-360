import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useNavigate, useParams } from 'react-router';

import { Button } from '@/components/ui/button';
import { paymentMethodsService } from '@/services/paymentMethods';

import { FormPaymentMethod } from './FormPaymentMethod';

function listReturn(state: unknown) {
  const from = (state as { from?: unknown } | null)?.from;
  if (
    from === '/payment-methods' ||
    (typeof from === 'string' && from.startsWith('/payment-methods?'))
  ) {
    return from;
  }
  return '/payment-methods';
}

export function PaymentMethodPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const backTo = listReturn(location.state);
  const leave = () => navigate(backTo);

  const method = useQuery({
    queryKey: ['payment-method', id],
    queryFn: () => paymentMethodsService.get(id ?? ''),
    enabled: Boolean(id),
  });

  if (id && method.isLoading) return <p>Carregando forma de pagamento...</p>;

  if (id && (method.isError || !method.data)) {
    return (
      <div className="space-y-4">
        <p className="text-red-600">Não foi possível carregar a forma de pagamento.</p>
        <Button variant="outline" asChild>
          <Link to={backTo}>Voltar à lista</Link>
        </Button>
      </div>
    );
  }

  const loaded = method.data;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#172337]">
            {id ? 'Editar forma de pagamento' : 'Nova forma de pagamento'}
          </h2>
          <p className="mt-1 text-sm text-[#64748b]">
            {loaded ? `${loaded.code} · ${loaded.name}` : 'Código, meio e condições.'}
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link to={backTo}>Voltar à lista</Link>
        </Button>
      </div>
      <div className="rounded-lg border bg-white p-6">
        <FormPaymentMethod
          key={id ?? 'new'}
          methodToUpdate={loaded ?? null}
          onCancel={leave}
          onSuccess={leave}
        />
      </div>
    </div>
  );
}
