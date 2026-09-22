import { useEffect, useState } from 'react';

import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

import { AppSidebar } from './components/AppSidebar';
import { Login } from './components/Auth/Login';
import { Registro } from './components/Auth/Register';
import { Dashboard } from './components/Dashboard';
import { Navbar } from './components/Navbar';
import { ListPersons } from './components/Persons/ListPersons';
import { authStorage } from './utils/auth';

type TelaAtiva = 'login' | 'registro' | 'app';

function hashAtual() {
  return window.location.hash || '#dashboard';
}

function App() {
  const [tela, setTela] = useState<TelaAtiva>(
    authStorage.isAuthenticated() ? 'app' : 'login',
  );
  const [hash, setHash] = useState(hashAtual);

  useEffect(() => {
    const sincronizarHash = () => setHash(hashAtual());
    window.addEventListener('hashchange', sincronizarHash);
    return () => window.removeEventListener('hashchange', sincronizarHash);
  }, []);

  useEffect(() => {
    if (tela === 'app' && !window.location.hash) {
      window.location.hash = '#dashboard';
    }
  }, [tela]);

  const handleLogout = () => {
    authStorage.removeToken();
    window.location.hash = '';
    setTela('login');
  };

  const goToApp = () => {
    window.location.hash = '#dashboard';
    setHash('#dashboard');
    setTela('app');
  };

  if (tela === 'registro') {
    return <Registro onRegistroSuccess={() => setTela('login')} />;
  }

  if (tela === 'login') {
    return (
      <Login
        onLoginSuccess={goToApp}
        onAlternarParaRegistro={() => setTela('registro')}
      />
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-zinc-50 text-zinc-900 font-sans">
        <AppSidebar hashAtivo={hash} />

        <SidebarInset className="flex flex-col flex-1 w-full overflow-x-hidden">
          <Navbar onLogout={handleLogout} />
          {hash === '#persons' ? (
            <main className="flex-1 p-4 md:p-6 max-w-7xl w-full mx-auto space-y-6">
              <ListPersons />
            </main>
          ) : (
            <Dashboard />
          )}
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

export default App;
