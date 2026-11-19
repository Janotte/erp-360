import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useNavigate, useParams } from 'react-router';

import { cfopScopeLabels } from '@/components/Inbound/Setup/labels';
import { Button } from '@/components/ui/button';
import { inboundSetupService } from '@/services/inboundSetup';

import { FormCfopRule } from './FormCfopRule';

function listReturn(state: unknown) {
  const from = (state as { from?: unknown } | null)?.from;
  if (
    from === '/inbound/setup' ||
    (typeof from === 'string' && from.startsWith('/inbound/setup?'))
  ) {
    return from;
  }
  return '/inbound/setup?aba=cfop';
}

export function CfopRulePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const backTo = listReturn(location.state);
  const leave = () => navigate(backTo);

  const rules = useQuery({
    queryKey: ['cfop-rules'],
    queryFn: inboundSetupService.listCfopRules,
    enabled: Boolean(id),
  });
  const rule = rules.data?.find((item) => item.id === id);

  if (id && rules.isLoading) return <p>Carregando regra de CFOP...</p>;

  if (id && (rules.isError || !rule)) {
    return (
      <div className="space-y-4">
        <p className="text-red-600">Não foi possível carregar a regra de CFOP.</p>
        <Button variant="outline" asChild>
          <Link to={backTo}>Voltar à lista</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#172337]">
            {id ? 'Editar regra de CFOP' : 'Nova regra de CFOP'}
          </h2>
          <p className="mt-1 text-sm text-[#64748b]">
            {rule
              ? `${rule.sourceCfop} · ${cfopScopeLabels[rule.scope]} · ${rule.entryCfop}`
              : 'CFOP da nota, finalidade e CFOP de entrada.'}
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link to={backTo}>Voltar à lista</Link>
        </Button>
      </div>
      <div className="rounded-lg border bg-white p-6">
        <FormCfopRule
          key={id ?? 'new'}
          ruleToUpdate={rule ?? null}
          onCancel={leave}
          onSuccess={leave}
          onDeleted={leave}
        />
      </div>
    </div>
  );
}
