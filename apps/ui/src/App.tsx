import { useEffect, useState } from 'react';

import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

import { AppSidebar } from './components/AppSidebar';
import { Login } from './components/Auth/Login';
import { Register } from './components/Auth/Register';
import { Dashboard } from './components/Dashboard';
import { Navbar } from './components/Navbar';
import { ListPersons } from './components/Persons/ListPersons';
import { authStorage } from './utils/auth';

function pathAtual() {
  return window.location.pathname.replace(/\/$/, '') || '/';
}

function rotaInicial() {
  const autenticado = authStorage.isAuthenticated();
  const hash = window.location.hash;
  const path = pathAtual();

  if (!autenticado) {
    if (path === '/register' || hash === '#register') return '/register';
    return '/login';
  }

  if (hash === '#persons') return '/persons';
  if (hash === '#pagar') return '/pagar';
  if (hash === '#receber') return '/receber';
  if (hash === '#configuracoes') return '/configuracoes';
  if (hash === '#dashboard') return '/dashboard';
  if (path === '/persons') return '/persons';
  if (path === '/pagar') return '/pagar';
  if (path === '/receber') return '/receber';
  if (path === '/configuracoes') return '/configuracoes';
  return '/dashboard';
}

function App() {
  const [path, setPath] = useState(rotaInicial);

  const irPara = (destino: string) => {
    if (pathAtual() !== destino || window.location.hash) {
      window.history.pushState({}, '', destino);
    }
    setPath(destino);
  };

  useEffect(() => {
    if (pathAtual() !== path || window.location.hash) {
      window.history.replaceState({}, '', path);
    }
  }, [path]);

  useEffect(() => {
    const sincronizar = () => setPath(rotaInicial());
    window.addEventListener('popstate', sincronizar);
    return () => window.removeEventListener('popstate', sincronizar);
  }, []);

  const handleLogout = () => {
    authStorage.removeToken();
    irPara('/login');
  };

  if (!authStorage.isAuthenticated()) {
    if (path === '/register') {
      return <Register onRegisterSuccess={() => irPara('/login')} />;
    }

    return (
      <Login
        onLoginSuccess={() => irPara('/dashboard')}
        onAlternarParaRegistro={() => irPara('/register')}
      />
    );
  }

  return (
    <SidebarProvider className="bg-zinc-50 text-zinc-900 font-sans">
      <AppSidebar pathAtivo={path} onNavigate={irPara} />

      <SidebarInset className="flex min-w-0 flex-col overflow-x-hidden">
        <Navbar onLogout={handleLogout} />
        {path === '/persons' ? (
          <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 p-4 md:p-6">
            <ListPersons />
          </main>
        ) : (
          <Dashboard />
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}

export default App;
