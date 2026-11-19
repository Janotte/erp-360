import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';

import { Button } from '@/components/ui/button';
import {
  ListMessage,
  ListPageHeader,
  ListPanel,
  ListSearch,
} from '@/components/ui/ListShell';
import { StatusListHeader, StatusListRow } from '@/components/ui/StatusList';
import { type StatusTone } from '@/components/ui/statusTone';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDebouncedSearch } from '@/hooks/useDebouncedSearch';
import {
  type CfopEntryRule,
  type CfopScope,
  inboundSetupService,
  type OperationNature,
} from '@/services/inboundSetup';

import { cfopScopeLabels, fiscalPurposeLabels } from './labels';

const natureColumns = 'grid grid-cols-[110px_minmax(180px,1.6fr)_160px_110px_110px]';
const ruleColumns = 'grid grid-cols-[140px_160px_minmax(160px,1fr)_150px]';

const activeTone: StatusTone = {
  background: '#EFF6FF',
  hover: '#DBEAFE',
  border: '#2563EB',
  text: '#1D4ED8',
};

const inactiveTone: StatusTone = {
  background: '#F8FAFC',
  hover: '#F1F5F9',
  border: '#64748B',
  text: '#475569',
};

const scopeTones: Record<CfopScope, StatusTone> = {
  internal: activeTone,
  interstate: {
    background: '#FFF7ED',
    hover: '#FFEDD5',
    border: '#EA580C',
    text: '#C2410C',
  },
  import: {
    background: '#F5F3FF',
    hover: '#EDE9FE',
    border: '#7C3AED',
    text: '#6D28D9',
  },
};

function yesNo(value: boolean) {
  return value ? 'Sim' : 'Não';
}

export function InboundSetupPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const tab = params.get('aba') === 'cfop' ? 'cfop' : 'natures';
  const natureSearch = params.get('busca') ?? '';
  const ruleSearch = params.get('regra') ?? '';
  const from = `/inbound/setup${location.search}`;

  const { text: natureText, setText: setNatureText } = useDebouncedSearch(
    (next) => {
      setParams(
        (current) => {
          const updated = new URLSearchParams(current);
          if ((updated.get('busca') ?? '') === next) return current;
          if (next) updated.set('busca', next);
          else updated.delete('busca');
          return updated;
        },
        { replace: true },
      );
    },
    400,
    natureSearch,
  );
  const { text: ruleText, setText: setRuleText } = useDebouncedSearch(
    (next) => {
      setParams(
        (current) => {
          const updated = new URLSearchParams(current);
          if ((updated.get('regra') ?? '') === next) return current;
          if (next) updated.set('regra', next);
          else updated.delete('regra');
          return updated;
        },
        { replace: true },
      );
    },
    400,
    ruleSearch,
  );

  const natures = useQuery({
    queryKey: ['operation-natures'],
    queryFn: inboundSetupService.listNatures,
    placeholderData: keepPreviousData,
  });
  const rules = useQuery({
    queryKey: ['cfop-rules'],
    queryFn: inboundSetupService.listCfopRules,
    placeholderData: keepPreviousData,
  });

  const setTab = (value: string) => {
    const next = new URLSearchParams(params);
    if (value === 'cfop') next.set('aba', 'cfop');
    else next.delete('aba');
    setParams(next, { replace: true });
  };

  const natureTerm = natureSearch.trim().toLowerCase();
  const natureRows = (natures.data ?? []).filter((nature) => {
    if (!natureTerm) return true;
    return (
      nature.code.toLowerCase().includes(natureTerm) ||
      nature.name.toLowerCase().includes(natureTerm) ||
      fiscalPurposeLabels[nature.fiscalPurpose].toLowerCase().includes(natureTerm)
    );
  });
  const ruleTerm = ruleSearch.trim().toLowerCase();
  const ruleRows = (rules.data ?? []).filter((rule) => {
    if (!ruleTerm) return true;
    return (
      rule.sourceCfop.includes(ruleTerm) ||
      rule.entryCfop.includes(ruleTerm) ||
      fiscalPurposeLabels[rule.fiscalPurpose].toLowerCase().includes(ruleTerm) ||
      cfopScopeLabels[rule.scope].toLowerCase().includes(ruleTerm)
    );
  });

  return (
    <div className="space-y-4">
      <ListPageHeader
        title="Naturezas e CFOP"
        description="Ajuste da empresa para a entrada. O cadastro inicial continua disponível e uma alteração daqui não é regravada."
      >
        <Button asChild>
          <Link
            to={tab === 'cfop' ? '/inbound/setup/cfop/new' : '/inbound/setup/natures/new'}
            state={{ from }}
          >
            <Plus className="h-4 w-4" />
            {tab === 'cfop' ? 'Nova regra' : 'Nova natureza'}
          </Link>
        </Button>
      </ListPageHeader>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="natures">Naturezas</TabsTrigger>
          <TabsTrigger value="cfop">Regras de CFOP</TabsTrigger>
        </TabsList>

        <TabsContent value="natures">
          <NatureList
            rows={natureRows}
            search={natureText}
            onSearch={setNatureText}
            filtering={Boolean(natureTerm)}
            loading={natures.isLoading}
            error={natures.isError}
            onOpen={(nature) =>
              navigate(`/inbound/setup/natures/${nature.id}`, { state: { from } })
            }
          />
        </TabsContent>
        <TabsContent value="cfop">
          <RuleList
            rows={ruleRows}
            search={ruleText}
            onSearch={setRuleText}
            filtering={Boolean(ruleTerm)}
            loading={rules.isLoading}
            error={rules.isError}
            onOpen={(rule) =>
              navigate(`/inbound/setup/cfop/${rule.id}`, { state: { from } })
            }
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function NatureList({
  rows,
  search,
  onSearch,
  filtering,
  loading,
  error,
  onOpen,
}: {
  rows: OperationNature[];
  search: string;
  onSearch: (value: string) => void;
  filtering: boolean;
  loading: boolean;
  error: boolean;
  onOpen: (nature: OperationNature) => void;
}) {
  return (
    <ListPanel
      title="Naturezas"
      description="Clique na linha para abrir. A cor indica se a natureza está ativa."
      toolbar={
        <ListSearch
          value={search}
          onChange={onSearch}
          placeholder="Buscar por código, nome ou finalidade..."
          label="Pesquisar naturezas"
        />
      }
    >
      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          <StatusListHeader columns={natureColumns}>
            <span>Código</span>
            <span>Nome</span>
            <span>Finalidade</span>
            <span>Estoque</span>
            <span>Custo</span>
          </StatusListHeader>
          {loading ? (
            <ListMessage>Carregando as naturezas...</ListMessage>
          ) : error ? (
            <ListMessage tone="error">
              Não foi possível carregar as naturezas.
            </ListMessage>
          ) : rows.length === 0 ? (
            <ListMessage>
              {filtering ? 'Nenhuma natureza encontrada.' : 'Ainda não há natureza.'}
            </ListMessage>
          ) : (
            rows.map((nature) => (
              <StatusListRow
                key={nature.id}
                columns={natureColumns}
                tone={nature.isActive ? activeTone : inactiveTone}
                label={`${nature.code}, ${nature.name}, ${nature.isActive ? 'ativa' : 'inativa'}`}
                onOpen={() => onOpen(nature)}
              >
                <span className="min-w-0 truncate font-bold text-[var(--status-text)]">
                  {nature.code}
                </span>
                <span className="min-w-0 truncate text-[var(--status-text)]">
                  {nature.name}
                </span>
                <span className="min-w-0 truncate text-[var(--status-text)]">
                  {fiscalPurposeLabels[nature.fiscalPurpose]}
                </span>
                <span className="text-[var(--status-text)]">
                  {yesNo(nature.movesStock)}
                </span>
                <span className="text-[var(--status-text)]">
                  {yesNo(nature.updatesAverageCost)}
                </span>
              </StatusListRow>
            ))
          )}
        </div>
      </div>
    </ListPanel>
  );
}

function RuleList({
  rows,
  search,
  onSearch,
  filtering,
  loading,
  error,
  onOpen,
}: {
  rows: CfopEntryRule[];
  search: string;
  onSearch: (value: string) => void;
  filtering: boolean;
  loading: boolean;
  error: boolean;
  onOpen: (rule: CfopEntryRule) => void;
}) {
  return (
    <ListPanel
      title="Regras de CFOP"
      description="Clique na linha para abrir. A cor indica o âmbito."
      toolbar={
        <ListSearch
          value={search}
          onChange={onSearch}
          placeholder="Buscar por CFOP, âmbito ou finalidade..."
          label="Pesquisar regras de CFOP"
        />
      }
    >
      <StatusListHeader columns={ruleColumns}>
        <span>CFOP da nota</span>
        <span>Âmbito</span>
        <span>Finalidade</span>
        <span>CFOP de entrada</span>
      </StatusListHeader>
      {loading ? (
        <ListMessage>Carregando as regras de CFOP...</ListMessage>
      ) : error ? (
        <ListMessage tone="error">
          Não foi possível carregar as regras de CFOP.
        </ListMessage>
      ) : rows.length === 0 ? (
        <ListMessage>
          {filtering ? 'Nenhuma regra encontrada.' : 'Ainda não há regra.'}
        </ListMessage>
      ) : (
        rows.map((rule) => (
          <StatusListRow
            key={rule.id}
            columns={ruleColumns}
            tone={scopeTones[rule.scope]}
            label={`${rule.sourceCfop}, ${cfopScopeLabels[rule.scope]}, ${rule.entryCfop}`}
            onOpen={() => onOpen(rule)}
          >
            <span className="min-w-0 truncate font-bold text-[var(--status-text)]">
              {rule.sourceCfop}
            </span>
            <span className="min-w-0 truncate text-[var(--status-text)]">
              {cfopScopeLabels[rule.scope]}
            </span>
            <span className="min-w-0 truncate text-[var(--status-text)]">
              {fiscalPurposeLabels[rule.fiscalPurpose]}
            </span>
            <span className="min-w-0 truncate text-[var(--status-text)]">
              {rule.entryCfop}
            </span>
          </StatusListRow>
        ))
      )}
    </ListPanel>
  );
}
