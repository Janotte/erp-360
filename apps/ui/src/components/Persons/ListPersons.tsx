import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { type Person, personsService } from '../../services/persons';
import { FormPerson } from './FormPerson';
export function ListPersons() {
  const queryClient = useQueryClient();
  const [openDialog, setOpenDialog] = useState(false);
  const [openAlert, setOpenAlert] = useState(false);
  const [pessoaSelecionada, setPersonSelecionada] = useState<Person | null>(null);
  const [erroExclusao, setErroExclusao] = useState<string | null>(null);

  const { data: persons, isLoading } = useQuery({
    queryKey: ['listaPersons'],
    queryFn: () => personsService.list(),
  });

  const deleteMutation = useMutation({
    mutationFn: personsService.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['listaPersons'] });
      setOpenAlert(false);
      setErroExclusao(null);
      toast.success('Pessoa removida com sucesso!');
    },
    onError: (error: any) => {
      // 🌟 Exibe a mensagem caso a API bloqueie por possuir vínculos ativos
      setErroExclusao(error.message);
    },
  });

  const abrirEdicao = (pessoa: Person) => {
    setPersonSelecionada(pessoa);
    setOpenDialog(true);
  };

  const abrirExclusao = (pessoa: Person) => {
    setPersonSelecionada(pessoa);
    setErroExclusao(null);
    setOpenAlert(true);
  };

  if (isLoading) return <p>Carregando registros...</p>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-bold text-zinc-900">Persons</h3>
          <p className="text-sm text-zinc-500">
            Gerencie clientes, fornecedores e colaboradores.
          </p>
        </div>

        <Dialog
          open={openDialog}
          onOpenChange={(v) => {
            setOpenDialog(v);
            if (!v) setPersonSelecionada(null);
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" /> Nova Pessoa
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {pessoaSelecionada ? 'Editar Pessoa' : 'Cadastrar Nova Pessoa'}
              </DialogTitle>
            </DialogHeader>
            <FormPerson
              personToUpdate={pessoaSelecionada}
              onSuccess={() => setOpenDialog(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border border-zinc-200 bg-white shadow-2xs">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Documento</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Perfis</TableHead>
              <TableHead className="w-[80px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {persons?.map((pessoa) => (
              <TableRow key={pessoa.id}>
                <TableCell className="font-medium">{pessoa.name}</TableCell>
                <TableCell>{pessoa.document || '-'}</TableCell>
                <TableCell>{pessoa.email || '-'}</TableCell>
                <TableCell className="flex gap-1.5 flex-wrap">
                  {pessoa.isClient && (
                    <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-50 text-blue-600">
                      Cliente
                    </span>
                  )}
                  {pessoa.isSupplier && (
                    <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-50 text-amber-600">
                      Fornecedor
                    </span>
                  )}
                  {pessoa.isEmployee && (
                    <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-purple-50 text-purple-600">
                      Colaborador
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => abrirEdicao(pessoa)}
                        className="gap-2 cursor-pointer"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => abrirExclusao(pessoa)}
                        className="gap-2 text-destructive focus:text-destructive cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Alerta de Confirmação de Exclusão */}
      <AlertDialog open={openAlert} onOpenChange={setOpenAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Você tem certeza absoluta?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A pessoa será removida permanentemente do
              sistema caso não possua movimentações associadas.
            </AlertDialogDescription>
            {erroExclusao && (
              <p className="mt-2 text-sm font-medium text-destructive bg-destructive/10 p-3 rounded-md">
                {erroExclusao}
              </p>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (pessoaSelecionada) deleteMutation.mutate(pessoaSelecionada.id);
              }}
              className="bg-destructive hover:bg-destructive/90 text-white"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Excluindo...' : 'Confirmar Exclusão'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
