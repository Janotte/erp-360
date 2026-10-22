import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  type CfopEntryRule,
  inboundSetupService,
  type OperationNature,
} from '@/services/inboundSetup';

import { FormCfopRule } from './FormCfopRule';
import { FormNature } from './FormNature';
import { cfopScopeLabels, fiscalPurposeLabels } from './labels';

function yesNo(value: boolean) {
  return value ? 'Sim' : 'Não';
}

export function InboundSetupPage() {
  const queryClient = useQueryClient();
  const [natureSearch, setNatureSearch] = useState('');
  const [ruleSearch, setRuleSearch] = useState('');
  const [natureDialog, setNatureDialog] = useState(false);
  const [ruleDialog, setRuleDialog] = useState(false);
  const [selectedNature, setSelectedNature] = useState<OperationNature | null>(null);
  const [selectedRule, setSelectedRule] = useState<CfopEntryRule | null>(null);
  const [deleteNature, setDeleteNature] = useState<OperationNature | null>(null);
  const [deleteRule, setDeleteRule] = useState<CfopEntryRule | null>(null);

  const natures = useQuery({
    queryKey: ['operation-natures'],
    queryFn: inboundSetupService.listNatures,
  });
  const rules = useQuery({
    queryKey: ['cfop-rules'],
    queryFn: inboundSetupService.listCfopRules,
  });

  const removeNature = useMutation({
    mutationFn: inboundSetupService.deleteNature,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['operation-natures'] });
      queryClient.invalidateQueries({ queryKey: ['inbound', 'natures'] });
      setDeleteNature(null);
      toast.success('Natureza excluída.');
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const removeRule = useMutation({
    mutationFn: inboundSetupService.deleteCfopRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cfop-rules'] });
      setDeleteRule(null);
      toast.success('Regra excluída.');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const natureRows = useMemo(() => {
    const term = natureSearch.trim().toLowerCase();
    return (natures.data ?? []).filter((nature) => {
      if (!term) return true;
      return (
        nature.code.toLowerCase().includes(term) ||
        nature.name.toLowerCase().includes(term) ||
        fiscalPurposeLabels[nature.fiscalPurpose].toLowerCase().includes(term)
      );
    });
  }, [natures.data, natureSearch]);

  const ruleRows = useMemo(() => {
    const term = ruleSearch.trim().toLowerCase();
    return (rules.data ?? []).filter((rule) => {
      if (!term) return true;
      return (
        rule.sourceCfop.includes(term) ||
        rule.entryCfop.includes(term) ||
        fiscalPurposeLabels[rule.fiscalPurpose].toLowerCase().includes(term) ||
        cfopScopeLabels[rule.scope].toLowerCase().includes(term)
      );
    });
  }, [rules.data, ruleSearch]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-zinc-900">Naturezas e CFOP</h2>
        <p className="text-sm text-zinc-500">
          Ajuste da empresa para a entrada. O cadastro inicial continua disponível e uma alteração
          daqui não é regravada.
        </p>
      </div>

      <Tabs defaultValue="natures">
        <TabsList>
          <TabsTrigger value="natures">Naturezas</TabsTrigger>
          <TabsTrigger value="cfop">Regras de CFOP</TabsTrigger>
        </TabsList>

        <TabsContent value="natures" className="space-y-4">
          <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <Input
              value={natureSearch}
              onChange={(event) => setNatureSearch(event.target.value)}
              placeholder="Buscar por código, nome ou finalidade"
              className="sm:max-w-xs"
            />
            <Button
              onClick={() => {
                setSelectedNature(null);
                setNatureDialog(true);
              }}
            >
              <Plus className="h-4 w-4" /> Nova natureza
            </Button>
          </div>
          <div className="rounded-md border border-zinc-200 bg-white shadow-2xs">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Finalidade</TableHead>
                  <TableHead>Estoque</TableHead>
                  <TableHead>Custo</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {natureRows.map((nature) => (
                  <TableRow key={nature.id}>
                    <TableCell className="font-medium">{nature.code}</TableCell>
                    <TableCell>{nature.name}</TableCell>
                    <TableCell>{fiscalPurposeLabels[nature.fiscalPurpose]}</TableCell>
                    <TableCell>{yesNo(nature.movesStock)}</TableCell>
                    <TableCell>{yesNo(nature.updatesAverageCost)}</TableCell>
                    <TableCell>{nature.isActive ? 'Ativa' : 'Inativa'}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label="Ações">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedNature(nature);
                              setNatureDialog(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-600"
                            onClick={() => setDeleteNature(nature)}
                          >
                            <Trash2 className="h-4 w-4" /> Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
                {natures.isSuccess && natureRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-4 text-center text-zinc-500">
                      Nenhuma natureza encontrada.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="cfop" className="space-y-4">
          <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <Input
              value={ruleSearch}
              onChange={(event) => setRuleSearch(event.target.value)}
              placeholder="Buscar por CFOP, âmbito ou finalidade"
              className="sm:max-w-xs"
            />
            <Button
              onClick={() => {
                setSelectedRule(null);
                setRuleDialog(true);
              }}
            >
              <Plus className="h-4 w-4" /> Nova regra
            </Button>
          </div>
          <div className="rounded-md border border-zinc-200 bg-white shadow-2xs">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>CFOP da nota</TableHead>
                  <TableHead>Âmbito</TableHead>
                  <TableHead>Finalidade</TableHead>
                  <TableHead>CFOP de entrada</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {ruleRows.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium">{rule.sourceCfop}</TableCell>
                    <TableCell>{cfopScopeLabels[rule.scope]}</TableCell>
                    <TableCell>{fiscalPurposeLabels[rule.fiscalPurpose]}</TableCell>
                    <TableCell>{rule.entryCfop}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label="Ações">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedRule(rule);
                              setRuleDialog(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-600"
                            onClick={() => setDeleteRule(rule)}
                          >
                            <Trash2 className="h-4 w-4" /> Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
                {rules.isSuccess && ruleRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-4 text-center text-zinc-500">
                      Nenhuma regra encontrada.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog
        open={natureDialog}
        onOpenChange={(open) => {
          setNatureDialog(open);
          if (!open) setSelectedNature(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedNature ? 'Editar natureza' : 'Nova natureza'}</DialogTitle>
          </DialogHeader>
          <FormNature
            key={selectedNature?.id ?? 'new'}
            natureToUpdate={selectedNature}
            onSuccess={() => setNatureDialog(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={ruleDialog}
        onOpenChange={(open) => {
          setRuleDialog(open);
          if (!open) setSelectedRule(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedRule ? 'Editar regra' : 'Nova regra'}</DialogTitle>
          </DialogHeader>
          <FormCfopRule
            key={selectedRule?.id ?? 'new'}
            ruleToUpdate={selectedRule}
            onSuccess={() => setRuleDialog(false)}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteNature)} onOpenChange={(open) => !open && setDeleteNature(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir natureza</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja excluir {deleteNature?.name ?? 'esta natureza'}? Uma natureza usada em nota não
              pode sair.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={removeNature.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (deleteNature) removeNature.mutate(deleteNature.id);
              }}
            >
              {removeNature.isPending ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(deleteRule)} onOpenChange={(open) => !open && setDeleteRule(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir regra</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja excluir a conversão de {deleteRule?.sourceCfop} para {deleteRule?.entryCfop}?
              Notas já lançadas permanecem com o CFOP gravado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={removeRule.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (deleteRule) removeRule.mutate(deleteRule.id);
              }}
            >
              {removeRule.isPending ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
