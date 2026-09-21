import { useState } from 'react';

import { Button } from '@/components/ui/button';

import { Login } from './components/Login';
import { Registro } from './components/Registro';
import { authStorage } from './utils/auth';

type TelaAtiva = 'login' | 'registro' | 'dashboard';

function App() {
  const [tela, setTela] = useState<TelaAtiva>(
    authStorage.isAuthenticated() ? 'dashboard' : 'login',
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
