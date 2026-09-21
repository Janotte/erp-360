import { useMutation } from '@tanstack/react-query';
import React, { useState } from 'react';

import { enviarLoginAPI } from '../services/auth';
import { authStorage } from '../utils/auth';

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
    mutate({ email, password });
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

          {error && <div style={styles.errorBox}>{error.message}</div>}

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

// Estilos CSS-in-JS básicos e limpos para visualização rápida
const styles = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    backgroundColor: '#f3f4f6',
  },
  card: {
    padding: '40px',
    borderRadius: '8px',
    backgroundColor: '#fff',
    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
    width: '100%',
    maxWidth: '400px',
  },
  title: {
    margin: '0 0 8px 0',
    fontSize: '24px',
    textAlign: 'center' as const,
    color: '#111827',
  },
  subtitle: {
    margin: '0 0 24px 0',
    fontSize: '14px',
    textAlign: 'center' as const,
    color: '#6b7280',
  },
  form: { display: 'flex', flexDirection: 'column' as const, gap: '16px' },
  inputGroup: { display: 'flex', flexDirection: 'column' as const, gap: '6px' },
  label: { fontSize: '14px', fontWeight: '500', color: '#374151' },
  input: {
    padding: '10px',
    borderRadius: '4px',
    border: '1px solid #d1d5db',
    fontSize: '16px',
  },
  errorBox: {
    padding: '10px',
    borderRadius: '4px',
    backgroundColor: '#fee2e2',
    color: '#b91c1c',
    fontSize: '14px',
  },
  button: {
    padding: '12px',
    border: 'none',
    borderRadius: '4px',
    color: '#fff',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
};
