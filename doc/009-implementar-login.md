Para implementar a tela de login no seu frontend React (apps/ui), vamos conectá-la ao TanStack Query (usando useMutation) para enviar as credenciais para a API Fastify, receber o token JWT e armazená-lo com segurança.
Abaixo está o passo a passo completo utilizando o padrão moderno do React com TypeScript.
------------------------------

## 🔑 Passo 1: Criar o Gerenciador de Token (LocalStorage)

Primeiro, precisamos de um utilitário simples para salvar, ler e remover o token JWT do navegador.
Crie o arquivo apps/ui/src/utils/auth.ts:

const TOKEN_KEY = '@monorepo:token';
export const authStorage = {
setToken: (token: string) => localStorage.setItem(TOKEN_KEY, token),
getToken: () => localStorage.getItem(TOKEN_KEY),
removeToken: () => localStorage.removeItem(TOKEN_KEY),
isAuthenticated: () => !!localStorage.getItem(TOKEN_KEY),
};

---

## 📝 Passo 2: Definir os Tipos e a Requisição

Vamos criar os tipos de dados para a requisição de login e a resposta da API. Se você preferir, pode criar esses schemas no pacote @monorepo/shared usando Zod para validar no front e no back ao mesmo tempo!
Crie o arquivo apps/ui/src/services/auth.ts:

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
export const enviarLoginAPI = async (dados: { email: string; password_hash: string }): Promise<LoginResponse> => {
const response = await fetch(`${API_URL}/login`, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify(dados),
});

if (!response.ok) {
const erro = await response.json().catch(() => ({}));
throw new Error(erro.message || 'Falha ao autenticar. Verifique suas credenciais.');
}

return response.json();
};

---

## 💻 Passo 3: Criar o Componente de Tela de Login

Agora criamos o formulário em React usando o useMutation do TanStack Query. Ele vai gerenciar automaticamente o estado de carregamento (isPending) e mensagens de erro (error).
Crie o arquivo apps/ui/src/components/Login.tsx:

import React, { useState } from 'react';import { useMutation } from '@tanstack/react-query';import { enviarLoginAPI } from '../services/auth';import { authStorage } from '../utils/auth';
interface LoginProps {
onLoginSuccess: () => void;
}
export function Login({ onLoginSuccess }: LoginProps) {
const [email, setEmail] = useState('');
const [password, setPassword] = useState('');

// Mutation do TanStack Query para gerenciar o estado assíncrono do login
const { mutate, isPending, error } = useMutation({
mutationFn: enviarLoginAPI,
onSuccess: (data) => {
// 1. Salva o JWT com segurança no armazenamento local
authStorage.setToken(data.token);
// 2. Notifica o componente pai que o usuário está logado
onLoginSuccess();
},
});

const handleSubmit = (e: React.FormEvent) => {
e.preventDefault();
if (!email || !password) return;

    // Dispara a requisição. Dica: passe a senha direto, a API fará o hash/verificação
    mutate({ email, password_hash: password });

};

return (
<div style={styles.container}>
<div style={styles.card}>
<h2 style={styles.title}>Acessar o Sistema</h2>
<p style={styles.subtitle}>Insira suas credenciais multi-tenant</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>E-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={styles.input}
              placeholder="exemplo@empresa.com"
              required
            />
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={styles.input}
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <div style={styles.errorBox}>
              {error.message}
            </div>
          )}

          <button
            type="submit"
            disabled={isPending}
            style={{
              ...styles.button,
              backgroundColor: isPending ? '#ccc' : '#00dfa2',
            }}
          >
            {isPending ? 'Autenticando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>

);
}
// Estilos CSS-in-JS básicos e limpos para visualização rápidaconst styles = {
container: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#f3f4f6' },
card: { padding: '40px', borderRadius: '8px', backgroundColor: '#fff', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', width: '100%', maxWidth: '400px' },
title: { margin: '0 0 8px 0', fontSize: '24px', textAlign: 'center' as const, color: '#111827' },
subtitle: { margin: '0 0 24px 0', fontSize: '14px', textAlign: 'center' as const, color: '#6b7280' },
form: { display: 'flex', flexDirection: 'column' as const, gap: '16px' },
inputGroup: { display: 'flex', flexDirection: 'column' as const, gap: '6px' },
label: { fontSize: '14px', fontWeight: '500', color: '#374151' },
input: { padding: '10px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '16px' },
errorBox: { padding: '10px', borderRadius: '4px', backgroundColor: '#fee2e2', color: '#b91c1c', fontSize: '14px' },
button: { padding: '12px', border: 'none', borderRadius: '4px', color: '#fff', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', transition: 'background-color 0.2s' },
};

---

## 🌐 Passo 4: Atualizar a Renderização Principal (apps/ui/src/App.tsx)

Agora gerenciamos se o usuário visualiza a Tela de Login ou o Dashboard principal da sua aplicação (Contas a Pagar/Receber) baseado na presença do token.
Substitua seu arquivo apps/ui/src/App.tsx para alternar os estados:

import { useState } from 'react';import { Login } from './components/Login';import { authStorage } from './utils/auth';
function App() {
// Estado local para controlar se o usuário está autenticado
const [logado, setLogado] = useState(authStorage.isAuthenticated());

const lidarComLogout = () => {
authStorage.removeToken();
setLogado(false);
};

// Se não estiver logado, exibe a tela de login
if (!logado) {
return <Login onLoginSuccess={() => setLogado(true)} />;
}

return (
<div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
<header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eee', paddingBottom: '10px' }}>
<h2>Painel Multi-Tenant do Sistema</h2>
<button onClick={lidarComLogout} style={{ padding: '8px 16px', backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
Sair do Sistema
</button>
</header>

      <main style={{ marginTop: '20px' }}>
        <h3>Bem-vindo!</h3>
        <p>Você está autenticado de forma segura.</p>
        {/* Aqui entrarão suas listas de Pessoas, Pagar, Receber com TanStack Query */}
      </main>
    </div>

);
}
export default App;

---

## 💡 Como as próximas requisições (Módulos) usarão esse Token?

Toda vez que você usar o fetch ou axios dentro de módulos como "Contas a Pagar", você injetará o token no cabeçalho. Veja este exemplo rápido:

const token = authStorage.getToken();
const response = await fetch(`${API_URL}/contas-pagar`, {
headers: {
'Authorization': `Bearer ${token}` // 🌟 A API Fastify vai ler isso e descobrir o seu tenantId automaticamente!
}
});
