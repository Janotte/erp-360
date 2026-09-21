import { useMutation } from '@tanstack/react-query';
import React, { useState } from 'react';

import { enviarRegistroAPI } from '../services/auth';

interface RegisterProps {
  onRegisterSuccess: () => void;
  onGoToLogin: () => void;
}

export function Register({ onRegisterSuccess, onGoToLogin }: RegisterProps) {
  const [nomeEmpresa, setNomeEmpresa] = useState('');
  const [nomeUsuario, setNomeUsuario] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');

  const { mutate, isPending, error } = useMutation({
    mutationFn: enviarRegistroAPI,
    onSuccess: () => {
      onRegisterSuccess();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nomeEmpresa || !nomeUsuario || !email || !senha) return;
    mutate({ nomeEmpresa, nomeUsuario, email, senha });
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={styles.title}>Criar Conta</h2>
        <p style={styles.subtitle}>Registre sua empresa e o usuário administrador</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>Nome da empresa</label>
            <input
              type="text"
              value={nomeEmpresa}
              onChange={(e) => setNomeEmpresa(e.target.value)}
              style={styles.input}
              placeholder="Minha Empresa Ltda"
              required
            />
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Seu nome</label>
            <input
              type="text"
              value={nomeUsuario}
              onChange={(e) => setNomeUsuario(e.target.value)}
              style={styles.input}
              placeholder="João Silva"
              required
            />
          </div>

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
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              style={styles.input}
              placeholder="••••••••"
              minLength={6}
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
            {isPending ? 'Criando conta...' : 'Registrar'}
          </button>
        </form>

        <p style={styles.footer}>
          Já tem conta?{' '}
          <button type="button" onClick={onGoToLogin} style={styles.link}>
            Entrar
          </button>
        </p>
      </div>
    </div>
  );
}

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
  footer: {
    margin: '20px 0 0 0',
    textAlign: 'center' as const,
    fontSize: '14px',
    color: '#6b7280',
  },
  link: {
    background: 'none',
    border: 'none',
    color: '#00dfa2',
    fontWeight: '600',
    cursor: 'pointer',
    padding: 0,
    fontSize: '14px',
  },
};
