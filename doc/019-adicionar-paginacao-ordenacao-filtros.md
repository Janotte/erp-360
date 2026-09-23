# Configurar paginação, ordenação e filtros diretamente na API e no Frontend

Para fazer isso da forma mais robusta e escalável, utilizaremos Query Strings na API Fastify (apps/api) com o Drizzle ORM e estenderemos os hooks do TanStack Query no Frontend React (apps/ui) para gerenciar esse estado reativo.
Vamos aplicar essa estrutura completa tomando o módulo de Pessoas (Persons) como base.
------------------------------

## ⚙️ Passo 1: Atualizar a API Fastify (apps/api/src/routes/persons.ts)

Vamos atualizar a rota GET / de listagem para aceitar os parâmetros de paginação (page, limit), ordenação (sortField, sortOrder) e busca de texto (busca).
Abra o arquivo apps/api/src/routes/persons.ts e substitua o endpoint de listagem por este:

```ts
import { persons } from '@erp-360/mod-persons';
import { PersonSchema, type Person } from '@erp-360/shared';
import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import '../types/fastify.js';
import { accountsPayable, accountsReceivable } from '@erp-360/mod-financial';

const listPersonsQuery = z.object({
  tipo: z.enum(['cliente', 'fornecedor', 'colaborador']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  sortField: z.enum(['nome', 'createdAt']).default('nome'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
  busca: z.string().optional(),
});

export const personsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.autenticarETenant);

  // 1. Rota para Cadastrar uma Pessoa (Protegida por Tenant)
  fastify.post(
    '/',
    {
      schema: { body: PersonSchema },
    },
    async (request, reply) => {
      const { tenantId } = request.user;
      const data = request.body as Person;

      const [newPerson] = await db
        .insert(persons)
        .values({
          ...data,
          tenantId,
        })
        .returning();

      return reply.status(201).send(newPerson);
    },
  );

  // 2. Rota para Listar as persons do Tenant (com filtro opcional por tipo)
  fastify.get(
    '/',
    {
      schema: { querystring: listPersonsQuery },
    },
    async (request, reply) => {
      const { tenantId } = request.user;
      const {
        page,
        limit,
        sortField,
        sortOrder,
        tipo,
        busca: search,
      } = request.query as z.infer<typeof listPersonsQuery>;

      const offset = (page - 1) * limit;
      const conditions = [eq(persons.tenantId, tenantId)];

      // 1. Filtros por Perfil
      if (tipo === 'cliente') conditions.push(eq(persons.isClient, true));
      if (tipo === 'fornecedor') conditions.push(eq(persons.isSupplier, true));
      if (tipo === 'colaborador') conditions.push(eq(persons.isEmployee, true));

      // 2. Filtro por Busca Textual (Nome, Documento ou E-mail)
      if (search) {
        conditions.push(
          or(
            ilike(persons.name, `%${search}%`),
            ilike(persons.document, `%${search}%`),
            ilike(persons.email, `%${search}%`),
          )!,
        );
      }

      // 3. Configuração de Ordenação Dinâmica
      const sortColumns = {
        nome: persons.name,
        createdAt: persons.createdAt,
      } as const;
      const sortColumn = sortColumns[sortField];
      const orderBy = sortOrder === 'asc' ? [asc(sortColumn)] : [desc(sortColumn)];

      // 4. Executa a Query trazendo os dados paginados
      const data = await db
        .select()
        .from(persons)
        .where(and(...conditions))
        .orderBy(...orderBy)
        .limit(limit)
        .offset(offset);

      // 5. Conta o total de registros para o Front saber o limite de páginas
      const [totalCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(persons)
        .where(and(...conditions));

      // Retorna a estrutura envelopada com os metadados de paginação
      return reply.send({
        data,
        meta: {
          total: Number(totalCount?.count || 0),
          page,
          limit,
          totalPages: Math.ceil(Number(totalCount?.count || 0) / limit),
        },
      });
    },
  );

  fastify.get(
    '/:id',
    {
      schema: {
        params: z.object({
          id: z.string().uuid({ message: 'ID precisa ser um UUID válido' }),
        }),
      },
    },
    async (request, reply) => {
      const { tenantId } = request.user;
      const { id } = request.params as { id: string };

      const [person] = await db
        .select()
        .from(persons)
        .where(and(eq(persons.id, id), eq(persons.tenantId, tenantId)));

      if (!person) {
        return reply.status(404).send({ error: 'Pessoa não encontrada' });
      }

      return person;
    },
  );

  fastify.put(
    '/:id',
    {
      schema: {
        params: z.object({
          id: z.string().uuid({ message: 'ID precisa ser um UUID válido' }),
        }),
        body: PersonSchema,
      },
    },
    async (request, reply) => {
      const { tenantId } = request.user;
      const { id } = request.params as { id: string };
      const data = request.body as Person;

      const [person] = await db
        .update(persons)
        .set(data)
        .where(and(eq(persons.id, id), eq(persons.tenantId, tenantId)))
        .returning();

      if (!person) {
        return reply.status(404).send({ message: 'Pessoa não encontrada' });
      }

      return person;
    },
  );

  fastify.delete(
    '/:id',
    {
      schema: {
        params: z.object({
          id: z.string().uuid({ message: 'ID precisa ser um UUID válido' }),
        }),
      },
    },
    async (request, reply) => {
      const { tenantId } = request.user;
      const { id } = request.params as { id: string };

      try {
        // 🌟 1. Verifica se a pessoa possui vínculos em contas a pagar
        const [hasPayable] = await db
          .select()
          .from(accountsPayable)
          .where(
            and(eq(accountsPayable.personId, id), eq(accountsPayable.tenantId, tenantId)),
          )
          .limit(1);

        // 🌟 2. Verifica se a pessoa possui vínculos em contas a receber
        const [hasReceivable] = await db
          .select()
          .from(accountsReceivable)
          .where(
            and(
              eq(accountsReceivable.personId, id),
              eq(accountsReceivable.tenantId, tenantId),
            ),
          )
          .limit(1);

        // Se houver qualquer vínculo, bloqueia e retorna erro 400
        if (hasPayable || hasReceivable) {
          return reply.status(400).send({
            message:
              'Não é possível excluir esta pessoa porque ela possui movimentações financeiras vinculadas.',
          });
        }

        // Executa a deleção garantindo que a pessoa pertence ao Tenant do usuário logado
        const [deletedPerson] = await db
          .delete(persons)
          .where(and(eq(persons.id, id), eq(persons.tenantId, tenantId)))
          .returning();

        // Se o ID não existir ou pertencer a outro tenant, o array retornará vazio
        if (!deletedPerson) {
          return reply.status(404).send({ message: 'Pessoa não encontrada' });
        }

        return { success: true };
      } catch (error) {
        fastify.log.error(error);
        return reply
          .status(500)
          .send({ message: 'Erro interno ao tentar excluir o registro.' });
      }
    },
  );
};
```

---

## 🌐 Passo 2: Atualizar os Serviços no Frontend (apps/ui/src/services/pessoas.ts)

Agora, a função listar precisa receber esses filtros como um objeto e convertê-los em parâmetros de URL (Query Strings).
Abra apps/ui/src/services/pessoas.ts e ajuste a função listar:

```ts
export interface FiltersPersons {
  page: number;
  limit: number;
  sortField: 'name' | 'createdAt';
  sortOrder: 'asc' | 'desc';
  type?: string;
  search?: string;
}

export interface PaginationResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
// Atualize o método listar dentro do objeto pessoasService:
  list: async (filters: FiltersPersons): Promise<PaginationResponse<Person>> => {
    const params = new URLSearchParams({
      page: filters.page.toString(),
      limit: filters.limit.toString(),
      sortField: filters.sortField,
      sortOrder: filters.sortOrder,
      ...(filters.type && { type: filters.type }),
      ...(filters.search && { search: filters.search }),
    });

    const res = await fetch(`${API_URL}/persons?${params.toString()}`, {
      headers: authHeaders(),
    });
    return res.json();
  },
```

---

## 💻 Passo 3: Adicionar a Interface Completa no React (ListaPessoas.tsx)

Vamos remodelar o componente ListaPessoas.tsx inserindo um campo de busca, um filtro por perfil (Select), cabeçalhos de tabela clicáveis para ordenação e botões de paginação anterior/próximo.
Substitua o conteúdo de apps/ui/src/components/Pessoas/ListaPessoas.tsx:

```tsx
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
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
import { Input } from '../ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
export function ListPersons() {
  const queryClient = useQueryClient();
  const [openDialog, setOpenDialog] = useState(false);
  const [openAlert, setOpenAlert] = useState(false);
  const [personSelected, setPersonSelected] = useState<Person | null>(null);
  const [erroExclusao, setErroExclusao] = useState<string | null>(null);

  // 1. Estados locais que controlam os filtros e a paginação
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [type, setType] = useState<string>('todos');
  const [page, setPage] = useState(1);
  const [sortField, setSortField] = useState<'name' | 'createdAt'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch((current) => {
        const next = searchText.trim();
        if (current !== next) setPage(1);
        return next;
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [searchText]);

  // 2. O TanStack Query escuta as mudanças de estados e faz o "refetch" automático
  const { data: response, isLoading } = useQuery({
    queryKey: ['listaPessoas', { page, type, search, sortField, sortOrder }],
    placeholderData: keepPreviousData,
    queryFn: () =>
      personsService.list({
        page,
        limit: 10, // Define 10 registros por página
        sortField,
        sortOrder,
        type: type === 'todos' ? undefined : type,
        search: search || undefined,
      }),
  });

  // Função utilitária para gerenciar o clique na ordenação da coluna
  const changeSort = (field: 'name' | 'createdAt') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
    setPage(1); // Reseta para a primeira página ao ordenar
  };

  const renderIconeOrdenacao = (field: 'name' | 'createdAt') => {
    if (sortField !== field) return <ArrowUpDown className="ml-2 h-4 w-4 shrink-0" />;
    return sortOrder === 'asc' ? (
      <ArrowUp className="ml-2 h-4 w-4 shrink-0 text-primary" />
    ) : (
      <ArrowDown className="ml-2 h-4 w-4 shrink-0 text-primary" />
    );
  };

  const meta = response?.meta;
  const persons = response?.data;

  const deleteMutation = useMutation({
    mutationFn: personsService.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['listaPessoas'] });
      setOpenAlert(false);
      setErroExclusao(null);
      toast.success('Pessoa removida com sucesso!');
    },
    onError: (error: Error) => {
      // 🌟 Exibe a mensagem caso a API bloqueie por possuir vínculos ativos
      setErroExclusao(error.message);
    },
  });

  const openEdit = (person: Person) => {
    setPersonSelected(person);
    setOpenDialog(true);
  };

  const openDelete = (person: Person) => {
    setPersonSelected(person);
    setErroExclusao(null);
    setOpenAlert(true);
  };

  if (isLoading && !response) return <p>Carregando registros...</p>;

  return (
    <div className="space-y-4">
      {/* 📊 BARRA DE FILTROS E BUSCA */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-white p-4 rounded-lg border border-zinc-200">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-400" />
          <Input
            placeholder="Buscar por nome, e-mail..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex gap-2 w-full sm:w-auto">
          <Select
            value={type}
            onValueChange={(v) => {
              setType(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Filtrar por Perfil" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">👥 Todos os Perfis</SelectItem>
              <SelectItem value="cliente">🔵 Clientes</SelectItem>
              <SelectItem value="fornecedor">🟡 Fornecedores</SelectItem>
              <SelectItem value="colaborador">🟣 Colaboradores</SelectItem>
            </SelectContent>
          </Select>
          <Button
            onClick={() => {
              setPersonSelected(null);
              setOpenDialog(true);
            }}
          >
            <Plus className="h-4 w-4" /> Nova Pessoa
          </Button>
        </div>
      </div>

      {/* 📋 TABELA COM ORDENAÇÃO NOS CABEÇALHOS */}
      <div className="rounded-md border border-zinc-200 bg-white shadow-2xs">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead
                onClick={() => changeSort('name')}
                className="cursor-pointer select-none hover:bg-zinc-50"
              >
                <div className="flex items-center">
                  Nome {renderIconeOrdenacao('name')}
                </div>
              </TableHead>
              <TableHead>Documento</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead
                onClick={() => changeSort('createdAt')}
                className="cursor-pointer select-none hover:bg-zinc-50"
              >
                <div className="flex items-center">
                  Data Cadastro {renderIconeOrdenacao('createdAt')}
                </div>
              </TableHead>
              <TableHead>Perfis</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-4">
                  Carregando dados...
                </TableCell>
              </TableRow>
            ) : persons?.length ? (
              persons.map((person) => (
                <TableRow key={person.id}>
                  <TableCell className="font-medium">{person.name}</TableCell>
                  <TableCell>{person.document || '-'}</TableCell>
                  <TableCell>{person.email || '-'}</TableCell>
                  <TableCell>
                    {person.createdAt
                      ? new Date(person.createdAt).toLocaleDateString('pt-BR')
                      : '-'}
                  </TableCell>
                  <TableCell className="flex gap-1.5">
                    {person.isClient && (
                      <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-50 text-blue-600">
                        Cliente
                      </span>
                    )}
                    {person.isSupplier && (
                      <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-50 text-amber-600">
                        Fornecedor
                      </span>
                    )}
                    {person.isEmployee && (
                      <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-purple-50 text-purple-600">
                        Colaborador
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Ações de ${person.name}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(person)}>
                          <Pencil className="h-4 w-4" /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-red-600 focus:text-red-600"
                          onClick={() => openDelete(person)}
                        >
                          <Trash2 className="h-4 w-4" /> Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-4 text-zinc-500">
                  Nenhuma pessoa encontrada.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* 🎛️ CONTROLES DE PAGINAÇÃO RESPONSIVA */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between bg-white px-4 py-3 rounded-lg border border-zinc-200">
          <div className="text-sm text-zinc-500">
            Mostrando página <strong className="text-zinc-900">{meta.page}</strong> de{' '}
            <strong className="text-zinc-900">{meta.totalPages}</strong> ({meta.total}{' '}
            registros no total)
          </div>
          <div className="flex space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((old) => Math.max(old - 1, 1))}
              disabled={page === 1}
              className="gap-1"
            >
              <ChevronLeft className="h-4 w-4" /> Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((old) => (page < meta.totalPages ? old + 1 : old))}
              disabled={page === meta.totalPages}
              className="gap-1"
            >
              Próximo <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <Dialog
        open={openDialog}
        onOpenChange={(open) => {
          setOpenDialog(open);
          if (!open) setPersonSelected(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {personSelected ? 'Editar Pessoa' : 'Cadastrar Nova Pessoa'}
            </DialogTitle>
          </DialogHeader>
          <FormPerson
            key={personSelected?.id ?? 'new'}
            personToUpdate={personSelected}
            onSuccess={() => {
              setOpenDialog(false);
              setPersonSelected(null);
            }}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={openAlert} onOpenChange={setOpenAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir pessoa</AlertDialogTitle>
            <AlertDialogDescription>
              {erroExclusao ??
                `Deseja excluir ${personSelected?.name ?? 'esta pessoa'}? Essa ação não pode ser desfeita.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteMutation.isPending || !!erroExclusao}
              onClick={(event) => {
                event.preventDefault();
                if (personSelected) deleteMutation.mutate(personSelected.id);
              }}
            >
              {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```
