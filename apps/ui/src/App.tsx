import { API_URL } from '@erp-360/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Login } from './components/Login';
import { apiFetch } from './services/apiClient';
import { authStorage } from './utils/auth';

// PASSO 1: A função de busca (fetch) que utiliza o trecho do token
const fetchPersons = async () => {
  const response = await apiFetch(`${API_URL}/persons`);

  if (!response.ok) {
    throw new Error('Erro ao carregar as pessoas.');
  }

  return response.json();
};

function App() {
  const [logado, setLogado] = useState(authStorage.isAuthenticated());

  const lidarComLogout = () => {
    authStorage.removeToken();
    setLogado(false);
  };

  // PASSO 2: O TanStack Query orquestra a função assíncrona acima
  const {
    data: persons,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['persons'],
    queryFn: fetchPersons,
    enabled: logado, // Só executa a requisição se o usuário estiver de fato logado
  });

  if (!logado) {
    return <Login onLoginSuccess={() => setLogado(true)} />;
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid #eee',
          paddingBottom: '10px',
        }}
      >
        <h2>Painel Multi-Tenant do Sistema</h2>
        <button onClick={lidarComLogout} style={styles.logoutBtn}>
          Sair do Sistema
        </button>
      </header>

      <main style={{ marginTop: '20px' }}>
        <h3>Módulo: Pessoas</h3>

        {isLoading && <p>Carregando dados financeiros da sua empresa...</p>}
        {error && <p style={{ color: 'red' }}>Erro: {error.message}</p>}

        {/* Listagem das pessoas vindas do banco filtradas pelo Tenant logado */}
        {persons && (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {persons.map((person: any) => (
              <li key={person.id} style={styles.itemPerson}>
                <strong>{person.name}</strong> - {person.document}
                <span style={styles.badge}>{person.status}</span>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

const styles = {
  logoutBtn: {
    padding: '8px 16px',
    backgroundColor: '#ef4444',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  itemPerson: {
    padding: '12px',
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    marginBottom: '8px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  badge: {
    backgroundColor: '#fef3c7',
    color: '#d97706',
    padding: '4px 8px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: 'bold',
  },
};

export default App;
