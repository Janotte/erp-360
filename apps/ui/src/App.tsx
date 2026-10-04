import { useEffect, useState } from 'react';

import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

import { AppSidebar } from './components/AppSidebar';
import { Login } from './components/Auth/Login';
import { Register } from './components/Auth/Register';
import { Dashboard } from './components/Dashboard';
import { ListBankAccounts } from './components/Financial/BankAccounts/ListBankAccounts';
import { ListCashBook } from './components/Financial/CashBook/ListCashBook';
import { CashFlowView } from './components/Financial/CashFlow/CashFlowView';
import { PayableList } from './components/Financial/Payables/PayableList';
import { ListPlanAccounts } from './components/Financial/PlanAccounts/ListPlanAccounts';
import { ReceivableList } from './components/Financial/Receivables/ReceivableList';
import { FinancialSettingsForm } from './components/Financial/Settings/FinancialSettingsForm';
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

  if (hash === '#dashboard') return '/dashboard';
  if (hash === '#persons') return '/persons';
  if (hash === '#receivables') return '/receivables';
  if (hash === '#payables') return '/payables';
  if (hash === '#plan-accounts') return '/plan-accounts';
  if (hash === '#cash-book') return '/cash-book';
  if (hash === '#bank-accounts') return '/bank-accounts';
  if (hash === '#cash-flow') return '/cash-flow';
  if (hash === '#settings') return '/settings';
  if (path === '/persons') return '/persons';
  if (path === '/receivables') return '/receivables';
  if (path === '/payables') return '/payables';
  if (path === '/plan-accounts') return '/plan-accounts';
  if (path === '/cash-book') return '/cash-book';
  if (path === '/bank-accounts') return '/bank-accounts';
  if (path === '/cash-flow') return '/cash-flow';
  if (path === '/settings') return '/settings';
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
        ) : path === '/payables' ? (
          <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 p-4 md:p-6">
            <PayableList />
          </main>
        ) : path === '/receivables' ? (
          <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 p-4 md:p-6">
            <ReceivableList />
          </main>
        ) : path === '/plan-accounts' ? (
          <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 p-4 md:p-6">
            <ListPlanAccounts />
          </main>
        ) : path === '/cash-book' ? (
          <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 p-4 md:p-6">
            <ListCashBook />
          </main>
        ) : path === '/bank-accounts' ? (
          <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 p-4 md:p-6">
            <ListBankAccounts />
          </main>
        ) : path === '/cash-flow' ? (
          <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 p-4 md:p-6">
            <CashFlowView />
          </main>
        ) : path === '/settings' ? (
          <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 p-4 md:p-6">
            <FinancialSettingsForm />
          </main>
        ) : (
          <Dashboard />
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}

export default App;
