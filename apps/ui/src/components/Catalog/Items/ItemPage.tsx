import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams } from 'react-router';

import { Button } from '@/components/ui/button';
import { itemsService } from '@/services/items';

import { FormItem } from './FormItem';

function listReturn(state: unknown) {
  const from = (state as { from?: unknown } | null)?.from;
  if (from === '/items' || (typeof from === 'string' && from.startsWith('/items?'))) return from;
  return '/items';
}

export function ItemPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const backTo = listReturn(location.state);
  const leave = () => navigate(backTo);

  const item = useQuery({
    queryKey: ['item', id],
    queryFn: () => itemsService.get(id ?? ''),
    enabled: Boolean(id),
  });

  if (id && item.isLoading) return <p>Carregando item...</p>;

  if (id && (item.isError || !item.data)) {
    return (
      <div className="space-y-4">
        <p className="text-red-600">Não foi possível carregar o item.</p>
        <Button type="button" variant="outline" onClick={leave}>
          Cancelar
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-zinc-900">{id ? 'Editar item' : 'Novo item'}</h2>
        {item.data ? (
          <p className="text-sm text-zinc-500">
            {item.data.code} · {item.data.name}
          </p>
        ) : (
          <p className="text-sm text-zinc-500">Preencha os dados e salve para gerar o código.</p>
        )}
      </div>
      <div className="rounded-lg border border-zinc-200 bg-white p-4 md:p-6">
        <FormItem
          key={id ?? 'new'}
          itemToUpdate={item.data ?? null}
          onCancel={leave}
          onSuccess={leave}
          onDeleted={leave}
        />
      </div>
    </div>
  );
}
