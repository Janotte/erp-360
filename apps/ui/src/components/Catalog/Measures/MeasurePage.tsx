import { measureTypeLabels } from '@erp-360/shared';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams } from 'react-router';

import { Button } from '@/components/ui/button';
import { measuresService } from '@/services/measures';

import { FormMeasure } from './FormMeasure';

function listReturn(state: unknown) {
  const from = (state as { from?: unknown } | null)?.from;
  if (
    from === '/measures' ||
    (typeof from === 'string' && from.startsWith('/measures?'))
  ) {
    return from;
  }
  return '/measures';
}

export function MeasurePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const backTo = listReturn(location.state);
  const leave = () => navigate(backTo);

  const measure = useQuery({
    queryKey: ['measure', id],
    queryFn: () => measuresService.get(id ?? ''),
    enabled: Boolean(id),
  });

  if (id && measure.isLoading) return <p>Carregando medida...</p>;

  if (id && (measure.isError || !measure.data)) {
    return (
      <div className="space-y-4">
        <p className="text-red-600">Não foi possível carregar a medida.</p>
        <Button type="button" variant="outline" onClick={leave}>
          Cancelar
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-zinc-900">
          {id ? 'Editar medida' : 'Nova medida'}
        </h2>
        {measure.data ? (
          <p className="text-sm text-zinc-500">
            {measure.data.abbreviation} · {measure.data.name} ·{' '}
            {measureTypeLabels[measure.data.measureType]}
          </p>
        ) : (
          <p className="text-sm text-zinc-500">Sigla, tipo e onde a medida aparece.</p>
        )}
      </div>
      <div className="rounded-lg border border-zinc-200 bg-white p-4 md:p-6">
        <FormMeasure
          key={id ?? 'new'}
          measureToUpdate={measure.data ?? null}
          onCancel={leave}
          onSuccess={leave}
          onDeleted={leave}
        />
      </div>
    </div>
  );
}
