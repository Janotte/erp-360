Vamos construir uma interface completa de CRUD (Cadastro, Listagem, Atualização e Exclusão) para o módulo de Pessoas. Para a exclusão segura, adicionaremos a verificação de vínculos (como simulação inicial, que se tornará real assim que criarmos as tabelas de Pagar/Receber).
Primeiro, instale os componentes do shadcn/ui necessários para gerenciar modais, tabelas e caixas de seleção. Navegue até a pasta do frontend e execute:

cd apps/ui
pnpm dlx shadcn@latest add dialog table checkbox dropdown-menu alert-dialog

---

## 🌐 Passo 1: Atualizar as Funções de API (apps/ui/src/services/persons.ts)

Crie o arquivo de serviços para gerenciar as requisições HTTP do módulo de Persons, injetando o token de autenticação:

```ts
import { API_URL } from '@erp-360/shared';
import { authStorage } from '../utils/auth';
export interface Person {
  id: string;
  name: string;
  document?: string;
  email?: string;
  phone?: string;
  isClient: boolean;
  isSupplier: boolean;
  isEmployee: boolean;
}
const getHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${authStorage.getToken()}`,
});

async function parsePersonResponse(res: Response, fallback: string): Promise<Person> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.message || body.error || fallback);
  }
  return body as Person;
}
export const personsService = {
  list: async (tipo?: string): Promise<Person[]> => {
    const url = tipo ? `${API_URL}/persons?tipo=${tipo}` : `${API_URL}/persons`;
    const res = await fetch(url, { headers: getHeaders() });
    return res.json();
  },
  create: async (dados: Omit<Person, 'id'>): Promise<Person> => {
    const res = await fetch(`${API_URL}/persons`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(dados),
    });
    return parsePersonResponse(res, 'Falha ao cadastrar.');
  },
  update: async (id: string, dados: Partial<Person>): Promise<Person> => {
    const res = await fetch(`${API_URL}/persons/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(dados),
    });
    return parsePersonResponse(res, 'Falha ao atualizar.');
  },
  delete: async (id: string): Promise<{ success: boolean; message?: string }> => {
    const res = await fetch(`${API_URL}/persons/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    if (!res.ok) {
      const erro = await res.json();
      throw new Error(erro.message || 'Erro ao excluir.');
    }
    return res.json();
  },
};
```

(Nota: Adicione a rota de PUT e DELETE no seu arquivo apps/api/src/index.ts seguindo o mesmo padrão do POST criado no passo anterior. No DELETE, sua API deve fazer um db.select().from(contasAPagar).where(eq(contasAPagar.pessoaId, id)) para barrar a exclusão caso existam vínculos).
------------------------------

## 📝 Passo 2: Componente de Formulário (apps/ui/src/components/Persons/FormPerson.tsx)

Este componente lidará tanto com a criação quanto com a atualização (modo edição).

```tsx
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useState } from 'react';
import { personsService, type Person } from '../../services/persons';
interface FormPersonProps {
  pessoaParaEditar?: Person | null;
  onSuccess: () => void;
}
export function FormPerson({ pessoaParaEditar, onSuccess }: FormPersonProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [document, setDocument] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [isClient, setIsClient] = useState(false);
  const [isSupplier, setIsSupplier] = useState(false);
  const [isEmployee, setIsEmployee] = useState(false);

  useEffect(() => {
    if (pessoaParaEditar) {
      setName(pessoaParaEditar.name);
      setDocument(pessoaParaEditar.document || '');
      setEmail(pessoaParaEditar.email || '');
      setPhone(pessoaParaEditar.phone || '');
      setIsClient(pessoaParaEditar.isClient);
      setIsSupplier(pessoaParaEditar.isSupplier);
      setIsEmployee(pessoaParaEditar.isEmployee);
    }
  }, [pessoaParaEditar]);

  const mutation = useMutation({
    mutationFn: (dados: Omit<Person, 'id'>) => {
      return pessoaParaEditar
        ? personsService.update(pessoaParaEditar.id, dados)
        : personsService.create(dados);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['listaPersons'] });
      onSuccess();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      name,
      document: document || undefined,
      email: email || undefined,
      phone: phone || undefined,
      isClient,
      isSupplier,
      isEmployee,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-4">
      <div className="space-y-1">
        <Label htmlFor="nome">Nome / Razão Social</Label>
        <Input
          id="nome"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="document">Document</Label>
          <Input
            id="document"
            value={document}
            onChange={(e) => setDocument(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2 pt-2">
        <Label>Perfil da Person</Label>
        <div className="flex gap-6 mt-1">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="cliente"
              checked={isClient}
              onCheckedChange={(v) => setIsClient(!!v)}
            />
            <label htmlFor="cliente" className="text-sm font-medium">
              Cliente
            </label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="fornecedor"
              checked={isSupplier}
              onCheckedChange={(v) => setIsSupplier(!!v)}
            />
            <label htmlFor="fornecedor" className="text-sm font-medium">
              Fornecedor
            </label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="colaborador"
              checked={isEmployee}
              onCheckedChange={(v) => setIsEmployee(!!v)}
            />
            <label htmlFor="colaborador" className="text-sm font-medium">
              Colaborador
            </label>
          </div>
        </div>
      </div>

      {mutation.isError && (
        <p className="text-sm font-medium text-destructive bg-destructive/10 p-3 rounded-md">
          {mutation.error.message}
        </p>
      )}

      <Button type="submit" className="w-full mt-4" disabled={mutation.isPending}>
        {mutation.isPending ? 'Salvando...' : 'Salvar'}
      </Button>
    </form>
  );
}
```

---

## 📊 Passo 3: Tela de Listagem e Ações (apps/ui/src/components/Persons/ListaPersons.tsx)

Esta tela renderiza a tabela completa do shadcn/ui e gerencia os botões de ação e exclusão segura.

```tsx
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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { personsService, type Person } from '../../services/persons';
import { FormPerson } from './FormPerson';
export function ListaPersons() {
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
              <Plus className="h-4 w-4" /> Nova Person
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {pessoaSelecionada ? 'Editar Person' : 'Cadastrar Nova Person'}
              </DialogTitle>
            </DialogHeader>
            <FormPerson
              pessoaParaEditar={pessoaSelecionada}
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
```

---

## 🔄 Passo 4: Atualizar a visualização em apps/ui/src/App.tsx

Para visualizar o módulo ativo, basta chamar a nossa <ListPersons /> dentro da tag <main> do seu App.tsx quando a rota/hash for #persons.

// Altere o miolo do seu main em apps/ui/src/App.tsx para acoplar a listagem:

```tsx
import { useEffect, useState } from 'react';

import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

import { AppSidebar } from './components/AppSidebar';
import { Login } from './components/Auth/Login';
import { Registro } from './components/Auth/Register';
import { Dashboard } from './components/Dashboard';
import { Navbar } from './components/Navbar';
import { ListPersons } from './components/Persons/ListPersons';
import { authStorage } from './utils/auth';

type TelaAtiva = 'login' | 'registro' | 'app';

function hashAtual() {
  return window.location.hash || '#dashboard';
}

function App() {
  const [tela, setTela] = useState<TelaAtiva>(
    authStorage.isAuthenticated() ? 'app' : 'login',
  );
  const [hash, setHash] = useState(hashAtual);

  useEffect(() => {
    const sincronizarHash = () => setHash(hashAtual());
    window.addEventListener('hashchange', sincronizarHash);
    return () => window.removeEventListener('hashchange', sincronizarHash);
  }, []);

  useEffect(() => {
    if (tela === 'app' && !window.location.hash) {
      window.location.hash = '#dashboard';
    }
  }, [tela]);

  const handleLogout = () => {
    authStorage.removeToken();
    window.location.hash = '';
    setTela('login');
  };

  const goToApp = () => {
    window.location.hash = '#dashboard';
    setHash('#dashboard');
    setTela('app');
  };

  if (tela === 'registro') {
    return <Registro onRegistroSuccess={() => setTela('login')} />;
  }

  if (tela === 'login') {
    return (
      <Login
        onLoginSuccess={goToApp}
        onAlternarParaRegistro={() => setTela('registro')}
      />
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-zinc-50 text-zinc-900 font-sans">
        <AppSidebar hashAtivo={hash} />

        <SidebarInset className="flex flex-col flex-1 w-full overflow-x-hidden">
          <Navbar onLogout={handleLogout} />
          {hash === '#persons' ? (
            <main className="flex-1 p-4 md:p-6 max-w-7xl w-full mx-auto space-y-6">
              <ListaPersons />
            </main>
          ) : (
            <Dashboard />
          )}
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

export default App;
```
