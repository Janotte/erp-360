import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { User } from '@erp-360/shared';
import { API_URL } from '@erp-360/shared';

// Função para buscar o usuário (GET)
const fetchUsuario = async (): Promise<User> => {
  const response = await fetch(`${API_URL}/user`);
  if (!response.ok) throw new Error('Erro ao buscar usuário');
  return response.json();
};

// Função para criar o usuário (POST)
const criarUsuarioAPI = async (novoUsuario: User): Promise<User> => {
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
  const {
    data: usuario,
    isLoading,
    error,
  } = useQuery<User>({
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
      id: 'ea9b60ee-6c30-4e67-bb78-3db8ccda3da3', // UUID válido exigido pelo Zod
      name: 'Carlos Alberto',
      email: 'carlos@tanstack.com',
    };
    mutation.mutate(dadosFake);
  };

  if (isLoading) return <div>Carregando usuário...</div>;
  if (error) return <div>Ocorreu um erro: {error.message}</div>;

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>Frontend + TanStack Query + Fastify Monorepo</h1>

      <button onClick={lidarComClique} disabled={mutation.isPending}>
        {mutation.isPending ? 'Enviando...' : 'Atualizar Usuário (POST)'}
      </button>

      {mutation.isError && (
        <p style={{ color: 'red' }}>Falha ao criar: {mutation.error.message}</p>
      )}

      {usuario && (
        <div
          style={{
            marginTop: '20px',
            border: '1px solid #00dfa2',
            padding: '15px',
            borderRadius: '8px',
          }}
        >
          <h3>Dados do Usuário (Estado Sincronizado):</h3>
          <p>
            <strong>ID:</strong> {usuario.id}
          </p>
          <p>
            <strong>Nome:</strong> {usuario.name}
          </p>
          <p>
            <strong>Email:</strong> {usuario.email}
          </p>
        </div>
      )}
    </div>
  );
}

export default App;
