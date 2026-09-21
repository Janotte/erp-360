import { useState } from 'react';

import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

import { AppSidebar } from './components/AppSidebar';
import { Login } from './components/Login';
import { Navbar } from './components/Navbar';
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
    // 1. SidebarProvider gerencia o estado global de colapso
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-zinc-50 text-zinc-900 font-sans">
        {/* 2. Barra lateral esquerda instalada */}
        <AppSidebar />

        {/* 3. SidebarInset joga o conteúdo para o lado respeitando a barra lateral */}
        <SidebarInset className="flex flex-col flex-1 w-full overflow-x-hidden">
          <Navbar onLogout={lidarComLogout} />

          {/* Conteúdo Dinâmico do Dashboard */}
          <main className="flex-1 p-4 md:p-6 max-w-7xl w-full mx-auto space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="p-6 bg-white rounded-xl border border-zinc-200 shadow-2xs">
                <h4 className="text-sm font-medium text-zinc-500">A pagar hoje</h4>
                <p className="text-2xl font-bold mt-2 text-zinc-900">R$ 1.250,00</p>
              </div>
              <div className="p-6 bg-white rounded-xl border border-zinc-200 shadow-2xs">
                <h4 className="text-sm font-medium text-zinc-500">A receber hoje</h4>
                <p className="text-2xl font-bold mt-2 text-zinc-900">R$ 4.800,00</p>
              </div>
              <div className="p-6 bg-white rounded-xl border border-zinc-200 shadow-2xs">
                <h4 className="text-sm font-medium text-zinc-500">Saldo Tenant</h4>
                <p className="text-2xl font-bold mt-2 text-emerald-600">+ R$ 3.550,00</p>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-2xs">
              <h3 className="text-lg font-bold">Módulo de Trabalho Ativo</h3>
              <p className="text-sm text-zinc-500 mt-1">
                Clique nos botões da barra lateral ou reduza o tamanho da tela para testar
                o menu hambúrguer no celular.
              </p>
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

export default App;
