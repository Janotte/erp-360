O TanStack Query (antigo React Query) é a escolha perfeita para esse ecossistema. Ele gerencia o cache, sincronização e atualizações de estado assíncronas no React de forma extremamente eficiente, conversando perfeitamente com as tipagens do Zod que criamos.
Aqui está o passo a passo para integrar o TanStack Query no seu frontend (apps/ui).
------------------------------
## 🛠️ Passo 1: Instalar o TanStack Query na UI
Rode o comando na raiz do projeto para instalar a biblioteca principal do TanStack Query no pacote do frontend:

pnpm add @tanstack/react-query --filter @erp-360/ui

------------------------------
## 🌐 Passo 2: Configurar o QueryClientProvider (apps/ui)
Precisamos envelopar a nossa aplicação com o provedor do TanStack Query para que o cache funcione globalmente.
Atualize o seu arquivo apps/ui/src/main.tsx:

import React from 'react'import ReactDOM from 'react-dom/client'import { QueryClient, QueryClientProvider } from '@tanstack/react-query'import App from './App.tsx'
// Cria uma instância do cliente de queryconst queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // O cache fica "fresco" por 5 minutos
      retry: 1, // Tenta reexecutar a requisição apenas 1 vez se falhar
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
)

------------------------------
## ⚛️ Passo 3: Criar Queries e Mutations com Tipagem Automática (apps/ui)
Agora, vamos reescrever o componente principal para usar o useQuery (para buscar dados) e o useMutation (para enviar dados, como a criação do usuário), herdando os tipos do @erp-360/shared.
Substitua o conteúdo de apps/ui/src/App.tsx:

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';import { User, API_URL } from '@erp-360/shared';
// Função para buscar o usuário (GET)const fetchUsuario = async (): Promise<User> => {
  const response = await fetch(`${API_URL}/user`);
  if (!response.ok) throw new Error('Erro ao buscar usuário');
  return response.json();
};
// Função para criar o usuário (POST)const criarUsuarioAPI = async (novoUsuario: User): Promise<User> => {
  const response = await fetch(`${API_URL}/user`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(novoUsuario),
  });
  if (!response.ok) throw new Error('Erro ao criar usuário');
  return response.json();
};
function App() {
  const queryClient = useQueryClient();

  // 1. Hook para buscar dados (GET) com cache inteligente
  const { data: usuario, isLoading, error } = useQuery<User>({
    queryKey: ['usuarioAtual'],
    queryFn: fetchUsuario,
  });

  // 2. Hook para enviar dados (POST) e invalidar o cache antigo
  const mutation = useMutation({
    mutationFn: criarUsuarioAPI,
    onSuccess: () => {
      // Força o TanStack Query a buscar os dados novamente para atualizar a tela
      queryClient.invalidateQueries({ queryKey: ['usuarioAtual'] });
    },
  });

  const lidarComClique = () => {
    const dadosFake: User = {
      id: "ea9b60ee-6c30-4e67-bb78-3db8ccda3da3", // UUID válido exigido pelo Zod
      name: "Carlos Alberto",
      email: "carlos@tanstack.com",
    };
    mutation.mutate(dadosFake);
  };

  if (isLoading) return <div>Carregando usuário...</div>;
  if (error) return <div>Ocorreu um erro: {error.message}</div>;

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>Frontend + TanStack Query + Fastify Monorepo</h1>
      
      <button 
        onClick={lidarComClique} 
        disabled={mutation.isPending}
      >
        {mutation.isPending ? 'Enviando...' : 'Atualizar Usuário (POST)'}
      </button>

      {mutation.isError && (
        <p style={{ color: 'red' }}>Falha ao criar: {mutation.error.message}</p>
      )}

      {usuario && (
        <div style={{ marginTop: '20px', border: '1px solid #00dfa2', padding: '15px', borderRadius: '8px' }}>
          <h3>Dados do Usuário (Estado Sincronizado):</h3>
          <p><strong>ID:</strong> {usuario.id}</p>
          <p><strong>Nome:</strong> {usuario.name}</p>
          <p><strong>Email:</strong> {usuario.email}</p>
        </div>
      )}
    </div>
  );
}
export default App;

------------------------------
## 🎯 O que você ganhou com essa arquitetura?
Ao rodar pnpm dev na raiz, agora você tem um fluxo completo:

   1. Se você alterar a regra do UserSchema no pacote shared (ex: mudar o tamanho mínimo do nome), o TypeScript vai apontar erro imediatamente no seu frontend se o objeto fake estiver inválido.
   2. O TanStack Query elimina a necessidade de usar useEffect manuais para buscar dados e gerencia estados de carregamento (isLoading) e pendência (isPending) nativamente.
   3. Se você abrir o app em outra aba ou perder o foco e voltar, o TanStack Query revalida os dados em segundo plano de forma silenciosa.
