Vamos remodelar completamente o fluxo visual. Primeiro, precisamos adicionar as peças que faltavam do shadcn/ui para criar os formulários (Input, Card e Label).
Navegue até a pasta do seu frontend no terminal e instale os componentes necessários:

cd apps/ui
pnpm dlx shadcn@latest add card input label

Em seguida, vamos atualizar os serviços e criar os componentes de Login e Registro integrados ao TanStack Query e estilizados com o Tailwind v4.
------------------------------

## 🌐 Passo 1: Atualizar os Serviços de Autenticação (apps/ui/src/services/auth.ts)

Vamos adicionar a chamada de API para a rota de registro (/registrar) que criamos no Fastify:

import { API_URL } from '@monorepo/shared';
export interface LoginResponse {
token: string;
user: {
id: string;
name: string;
email: string;
tenantId: string;
};
}
export interface RegistrarInput {
nomeEmpresa: string;
nomeUsuario: string;
email: string;
senha: string;
}
export const enviarLoginAPI = async (dados: { email: string; password_hash: string }): Promise<LoginResponse> => {
const response = await fetch(`${API_URL}/login`, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify(dados),
});

if (!response.ok) {
const erro = await response.json().catch(() => ({}));
throw new Error(erro.message || 'Falha ao autenticar.');
}

return response.json();
};
export const enviarRegistrarAPI = async (dados: RegistrarInput): Promise<{ sucesso: boolean }> => {
const response = await fetch(`${API_URL}/registrar`, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify(dados),
});

if (!response.ok) {
const erro = await response.json().catch(() => ({}));
throw new Error(erro.message || 'Falha ao registrar empresa.');
}

return response.json();
};

---

## 🔑 Passo 2: Nova Tela de Login (apps/ui/src/components/Login.tsx)

Agora, substituímos o componente antigo usando os componentes do shadcn/ui.

import React, { useState } from 'react';import { useMutation } from '@tanstack/react-query';import { enviarLoginAPI } from '../services/auth';import { authStorage } from '../utils/auth';import { Button } from '@/components/ui/button';import { Input } from '@/components/ui/input';import { Label } from '@/components/ui/label';import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
interface LoginProps {
onLoginSuccess: () => void;
onAlternarParaRegistro: () => void;
}
export function Login({ onLoginSuccess, onAlternarParaRegistro }: LoginProps) {
const [email, setEmail] = useState('');
const [password, setPassword] = useState('');

const { mutate, isPending, error } = useMutation({
mutationFn: enviarLoginAPI,
onSuccess: (data) => {
authStorage.setToken(data.token);
onLoginSuccess();
},
});

const handleSubmit = (e: React.FormEvent) => {
e.preventDefault();
if (!email || !password) return;
mutate({ email, password_hash: password });
};

return (
<div className="flex h-screen w-full items-center justify-center bg-zinc-50 px-4">
<Card className="w-full max-w-md shadow-lg">
<CardHeader className="space-y-1 text-center">
<CardTitle className="text-2xl font-bold tracking-tight">Acessar o Sistema</CardTitle>
<CardDescription>Insira suas credenciais corporativas</CardDescription>
</CardHeader>
<form onSubmit={handleSubmit}>
<CardContent className="space-y-4">
<div className="space-y-2">
<Label htmlFor="email">E-mail</Label>
<Input
id="email"
type="email"
placeholder="exemplo@empresa.com"
value={email}
onChange={(e) => setEmail(e.target.value)}
required
/>
</div>
<div className="space-y-2">
<Label htmlFor="password">Senha</Label>
<Input
id="password"
type="password"
placeholder="••••••••"
value={password}
onChange={(e) => setPassword(e.target.value)}
required
/>
</div>
{error && (
<p className="text-sm font-medium text-destructive bg-destructive/10 p-3 rounded-md">
{error.message}
</p>
)}
</CardContent>
<CardFooter className="flex flex-col space-y-4">
<Button type="submit" className="w-full" disabled={isPending}>
{isPending ? 'Autenticando...' : 'Entrar'}
</Button>
<div className="text-sm text-center text-zinc-500">
Não tem uma conta?{' '}
<button
                type="button"
                onClick={onAlternarParaRegistro}
                className="font-medium text-primary hover:underline cursor-pointer"
              >
Cadastrar nova empresa
</button>
</div>
</CardFooter>
</form>
</Card>
</div>
);
}

---

## 📝 Passo 3: Tela de Registro/Tenant (apps/ui/src/components/Registro.tsx)

Criamos a interface correspondente para registrar um novo Tenant (Empresa) e o primeiro Usuário Administrador de forma unificada.

import React, { useState } from 'react';import { useMutation } from '@tanstack/react-query';import { enviarRegistrarAPI } from '../services/auth';import { Button } from '@/components/ui/button';import { Input } from '@/components/ui/input';import { Label } from '@/components/ui/label';import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
interface RegistroProps {
onRegistroSuccess: () => void;
}
export function Registro({ onRegistroSuccess }: RegistroProps) {
const [nomeEmpresa, setNomeEmpresa] = useState('');
const [nomeUsuario, setNomeUsuario] = useState('');
const [email, setEmail] = useState('');
const [senha, setSenha] = useState('');

const { mutate, isPending, error, isSuccess } = useMutation({
mutationFn: enviarRegistrarAPI,
onSuccess: () => {
setTimeout(() => {
onRegistroSuccess();
}, 2000);
},
});

const handleSubmit = (e: React.FormEvent) => {
e.preventDefault();
mutate({ nomeEmpresa, nomeUsuario, email, senha });
};

return (
<div className="flex h-screen w-full items-center justify-center bg-zinc-50 px-4">
<Card className="w-full max-w-md shadow-lg">
<CardHeader className="space-y-1 text-center">
<CardTitle className="text-2xl font-bold tracking-tight">Criar Conta Corporativa</CardTitle>
<CardDescription>Abra o ambiente Multi-Tenant para a sua empresa</CardDescription>
</CardHeader>
<form onSubmit={handleSubmit}>
<CardContent className="space-y-4">
<div className="space-y-2">
<Label htmlFor="nomeEmpresa">Nome da Empresa</Label>
<Input
id="nomeEmpresa"
placeholder="Minha Empresa LTDA"
value={nomeEmpresa}
onChange={(e) => setNomeEmpresa(e.target.value)}
required
/>
</div>
<div className="space-y-2">
<Label htmlFor="nomeUsuario">Seu Nome completo</Label>
<Input
id="nomeUsuario"
placeholder="João Silva"
value={nomeUsuario}
onChange={(e) => setNomeUsuario(e.target.value)}
required
/>
</div>
<div className="space-y-2">
<Label htmlFor="email">E-mail Corporativo</Label>
<Input
id="email"
type="email"
placeholder="adm@empresa.com"
value={email}
onChange={(e) => setEmail(e.target.value)}
required
/>
</div>
<div className="space-y-2">
<Label htmlFor="senha">Senha de Acesso</Label>
<Input
id="senha"
type="password"
placeholder="Mínimo 6 caracteres"
value={senha}
onChange={(e) => setSenha(e.target.value)}
required
/>
</div>
{error && (
<p className="text-sm font-medium text-destructive bg-destructive/10 p-3 rounded-md">
{error.message}
</p>
)}
{isSuccess && (
<p className="text-sm font-medium text-emerald-600 bg-emerald-50 p-3 rounded-md">
Empresa registrada com sucesso! Redirecionando...
</p>
)}
</CardContent>
<CardFooter className="flex flex-col space-y-4">
<Button type="submit" className="w-full" disabled={isPending || isSuccess}>
{isPending ? 'Criando Ambiente...' : 'Registrar Empresa'}
</Button>
<div className="text-sm text-center text-zinc-500">
Já possui cadastro?{' '}
<button
                type="button"
                onClick={onRegistroSuccess}
                className="font-medium text-primary hover:underline cursor-pointer"
              >
Voltar para o Login
</button>
</div>
</CardFooter>
</form>
</Card>
</div>
);
}

---

## 🔄 Passo 4: Orquestrar no apps/ui/src/App.tsx

Agora unificamos o fluxo de telas (Login, Registro e o Dashboard) baseado em estados reativos.
Substitua o arquivo apps/ui/src/App.tsx:

import { useState } from 'react';import { Login } from './components/Login';import { Registro } from './components/Registro';import { authStorage } from './utils/auth';import { Button } from '@/components/ui/button';
type TelaAtiva = 'login' | 'registro' | 'dashboard';
function App() {
const [tela, setTela] = useState<TelaAtiva>(
authStorage.isAuthenticated() ? 'dashboard' : 'login'
);

const lidarComLogout = () => {
authStorage.removeToken();
setTela('login');
};

if (tela === 'registro') {
return <Registro onRegistroSuccess={() => setTela('login')} />;
}

if (tela === 'login') {
return (
<Login
onLoginSuccess={() => setTela('dashboard')}
onAlternarParaRegistro={() => setTela('registro')}
/>
);
}

return (
<div className="min-h-screen bg-zinc-50 font-sans">
<header className="flex justify-between items-center bg-white px-6 py-4 border-b border-zinc-200 shadow-xs">
<div className="flex items-center gap-2">
<div className="h-6 w-6 rounded-md bg-zinc-900" />
<h2 className="text-lg font-bold text-zinc-900">ERP Multi-Tenant</h2>
</div>
<Button variant="destructive" size="sm" onClick={lidarComLogout}>
Sair do Sistema
</Button>
</header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="bg-white p-6 rounded-lg border border-zinc-200 shadow-xs">
          <h3 className="text-xl font-bold text-zinc-900">Bem-vindo ao Dashboard!</h3>
          <p className="text-sm text-zinc-500 mt-1">
            Seu ambiente isolado por tenant está ativo e pronto.
          </p>
        </div>
      </main>
    </div>

);
}
export default App;

Com o Tailwind v4 compilando direto pelo Vite e os componentes do Shadcn aplicados, agora você tem uma interface profissional com estados assíncronos e validações completas na tela de autenticação.
