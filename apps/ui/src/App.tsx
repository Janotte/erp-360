import { useState } from 'react';
import { API_URL } from '@erp-360/shared';
import type { User } from '@erp-360/shared/src/index';
function App() {
  // O estado do React usa a tipagem inferida pelo Zod no pacote shared
  const [usuario, setUsuario] = useState<User | null>(null);

  const criarUsuario = async () => {
    const novoUsuario: User = {
      id: "ea9b60ee-6c30-4e67-bb78-3db8ccda3da3", // UUID Válido
      name: "Ana Silva",
      email: "ana@email.com"
    };

    const response = await fetch(`${API_URL}/user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(novoUsuario)
    });

    const dados: User = await response.json();
    setUsuario(dados);
  };

  return (
    <div style={{ padding: '20px' }}>
      <h1>Frontend + Fastify + Zod Monorepo</h1>
      <button onClick={criarUsuario}>Criar Usuário via API</button>
      
      {usuario && (
        <div style={{ marginTop: '20px', border: '1px solid #ccc', padding: '10px' }}>
          <h3>Usuário Retornado pela API (Validado):</h3>
          <p><strong>ID:</strong> {usuario.id}</p>
          <p><strong>Nome:</strong> {usuario.name}</p>
          <p><strong>Email:</strong> {usuario.email}</p>
        </div>
      )}
    </div>
  );
}

export default App;
