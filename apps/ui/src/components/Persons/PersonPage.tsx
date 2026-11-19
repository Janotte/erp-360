import { formatTaxId, parsePersonKind, personKindLabels } from '@erp-360/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';

import { Button } from '@/components/ui/button';
import { personsService } from '@/services/persons';

import { FormPerson } from './FormPerson';

function listReturn(state: unknown) {
  const from = (state as { from?: unknown } | null)?.from;
  if (from === '/persons' || (typeof from === 'string' && from.startsWith('/persons?'))) {
    return from;
  }
  return '/persons';
}

export function PersonPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const backTo = listReturn(location.state);
  const focusDetails =
    (location.state as { focusDetails?: unknown } | null)?.focusDetails === true;
  const leave = () => navigate(backTo);

  const person = useQuery({
    queryKey: ['person', id],
    queryFn: () => personsService.get(id ?? ''),
    enabled: Boolean(id),
  });

  useEffect(() => {
    if (!focusDetails || !person.data) return;
    document.getElementById('person-details')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
    navigate(`/persons/${id}`, { replace: true, state: { from: backTo } });
  }, [backTo, focusDetails, id, navigate, person.data]);

  if (id && person.isLoading) return <p>Carregando pessoa...</p>;

  if (id && (person.isError || !person.data)) {
    return (
      <div className="space-y-4">
        <p className="text-red-600">Não foi possível carregar a pessoa.</p>
        <Button variant="outline" asChild>
          <Link to={backTo}>Voltar à lista</Link>
        </Button>
      </div>
    );
  }

  const loaded = person.data;
  const subtitle = loaded
    ? [
        loaded.name,
        personKindLabels[parsePersonKind(loaded.type)],
        loaded.taxId ? formatTaxId(parsePersonKind(loaded.type), loaded.taxId) : '',
      ]
        .filter(Boolean)
        .join(' · ')
    : 'Tipo, documento, perfil, endereço e contato.';

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#172337]">
            {id ? 'Editar pessoa' : 'Nova pessoa'}
          </h2>
          <p className="mt-1 text-sm text-[#64748b]">{subtitle}</p>
        </div>
        <Button variant="outline" asChild>
          <Link to={backTo}>Voltar à lista</Link>
        </Button>
      </div>
      <div className="rounded-lg border bg-white p-6">
        <FormPerson
          key={id ?? 'new'}
          personToUpdate={loaded ?? null}
          onCancel={leave}
          onDeleted={leave}
          onPersisted={(saved) => {
            if (id) return;
            navigate(`/persons/${saved.id}`, {
              replace: true,
              state: { from: backTo, focusDetails: true },
            });
          }}
        />
      </div>
    </div>
  );
}
