import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams } from 'react-router';

import { Button } from '@/components/ui/button';
import { categoriesService } from '@/services/categories';

import { FormCategory } from './FormCategory';

function listReturn(state: unknown) {
  const from = (state as { from?: unknown } | null)?.from;
  if (
    from === '/categories' ||
    (typeof from === 'string' && from.startsWith('/categories?'))
  ) {
    return from;
  }
  return '/categories';
}

export function CategoryPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const backTo = listReturn(location.state);
  const leave = () => navigate(backTo);

  const category = useQuery({
    queryKey: ['category', id],
    queryFn: () => categoriesService.get(id ?? ''),
    enabled: Boolean(id),
  });

  if (id && category.isLoading) return <p>Carregando categoria...</p>;

  if (id && (category.isError || !category.data)) {
    return (
      <div className="space-y-4">
        <p className="text-red-600">Não foi possível carregar a categoria.</p>
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
          {id ? 'Editar categoria' : 'Nova categoria'}
        </h2>
        {category.data ? (
          <p className="text-sm text-zinc-500">
            {category.data.name}
            {category.data.parentName ? ` · ${category.data.parentName}` : ''}
          </p>
        ) : (
          <p className="text-sm text-zinc-500">Nome, categoria pai e descrição.</p>
        )}
      </div>
      <div className="rounded-lg border border-zinc-200 bg-white p-4 md:p-6">
        <FormCategory
          key={id ?? 'new'}
          categoryToUpdate={category.data ?? null}
          onCancel={leave}
          onSuccess={leave}
          onDeleted={leave}
        />
      </div>
    </div>
  );
}
