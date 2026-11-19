import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useNavigate, useParams } from 'react-router';

import { Button } from '@/components/ui/button';
import { inboundSetupService } from '@/services/inboundSetup';

import { FormNature } from './FormNature';

function listReturn(state: unknown) {
  const from = (state as { from?: unknown } | null)?.from;
  if (
    from === '/inbound/setup' ||
    (typeof from === 'string' && from.startsWith('/inbound/setup?'))
  ) {
    return from;
  }
  return '/inbound/setup';
}

export function NaturePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const backTo = listReturn(location.state);
  const leave = () => navigate(backTo);

  const nature = useQuery({
    queryKey: ['operation-nature', id],
    queryFn: () => inboundSetupService.getNature(id ?? ''),
    enabled: Boolean(id),
  });

  if (id && nature.isLoading) return <p>Carregando natureza...</p>;

  if (id && (nature.isError || !nature.data)) {
    return (
      <div className="space-y-4">
        <p className="text-red-600">Não foi possível carregar a natureza.</p>
        <Button variant="outline" asChild>
          <Link to={backTo}>Voltar à lista</Link>
        </Button>
      </div>
    );
  }

  const loaded = nature.data;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#172337]">
            {id ? 'Editar natureza' : 'Nova natureza'}
          </h2>
          <p className="mt-1 text-sm text-[#64748b]">
            {loaded ? `${loaded.code} · ${loaded.name}` : 'Código, finalidade e conta.'}
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link to={backTo}>Voltar à lista</Link>
        </Button>
      </div>
      <div className="rounded-lg border bg-white p-6">
        <FormNature
          key={id ?? 'new'}
          natureToUpdate={loaded ?? null}
          onCancel={leave}
          onSuccess={leave}
          onDeleted={leave}
        />
      </div>
    </div>
  );
}
