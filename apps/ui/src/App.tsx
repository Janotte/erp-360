import { useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useEffect } from 'react';
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router';

import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

import { AppSidebar } from './components/AppSidebar';
import { Login } from './components/Auth/Login';
import { Register } from './components/Auth/Register';
import { ListCategories } from './components/Catalog/Categories/ListCategories';
import { ListItems } from './components/Catalog/Items/ListItems';
import { ListMeasures } from './components/Catalog/Measures/ListMeasures';
import { Dashboard } from './components/Dashboard';
import { ListBankAccounts } from './components/Financial/BankAccounts/ListBankAccounts';
import { ListCashBook } from './components/Financial/CashBook/ListCashBook';
import { CashFlowView } from './components/Financial/CashFlow/CashFlowView';
import { IncomeStatementView } from './components/Financial/IncomeStatement/IncomeStatementView';
import { PayableList } from './components/Financial/Payables/PayableList';
import { ListPlanAccounts } from './components/Financial/PlanAccounts/ListPlanAccounts';
import { ReceivableList } from './components/Financial/Receivables/ReceivableList';
import { InboundPage } from './components/Inbound/InboundPage';
import { InboundSetupPage } from './components/Inbound/Setup/InboundSetupPage';
import { Navbar } from './components/Navbar';
import { ListPersons } from './components/Persons/ListPersons';
import { SettingsPage } from './components/Settings/SettingsPage';
import { setUnauthorizedHandler } from './services/apiClient';
import { authStorage } from './utils/auth';

const rotasPorHash: Record<string, string> = {
  '#dashboard': '/dashboard',
  '#persons': '/persons',
  '#categories': '/categories',
  '#items': '/items',
  '#measures': '/measures',
  '#receivables': '/receivables',
  '#payables': '/payables',
  '#plan-accounts': '/plan-accounts',
  '#cash-book': '/cash-book',
  '#bank-accounts': '/bank-accounts',
  '#cash-flow': '/cash-flow',
  '#income-statement': '/income-statement',
  '#inbound': '/inbound',
  '#inbound-setup': '/inbound/setup',
  '#settings': '/settings',
};

function destinoDoHash(hash: string, autenticado: boolean) {
  if (!hash) return null;
  if (!autenticado) return hash === '#register' ? '/register' : '/login';
  return rotasPorHash[hash] ?? '/dashboard';
}

function Raiz() {
  const { pathname, search, hash } = useLocation();
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return <Navigate to={`${pathname.replace(/\/+$/, '')}${search}${hash}`} replace />;
  }

  const destino = destinoDoHash(hash, authStorage.isAuthenticated());
  if (destino) return <Navigate to={destino} replace />;
  return <Outlet />;
}

function RotaPublica({ children }: { children: ReactNode }) {
  if (authStorage.isAuthenticated()) return <Navigate to="/dashboard" replace />;
  return children;
}

function Pagina({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 p-4 md:p-6">
      {children}
    </main>
  );
}

function SessaoExpirada() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    setUnauthorizedHandler(() => {
      void queryClient.cancelQueries();
      queryClient.clear();
      navigate('/login', { replace: true });
    });
    return () => setUnauthorizedHandler(null);
  }, [navigate, queryClient]);

  return null;
}

function AreaLogada() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  if (!authStorage.isAuthenticated()) return <Navigate to="/login" replace />;

  const sair = () => {
    void queryClient.cancelQueries();
    queryClient.clear();
    authStorage.removeToken();
    navigate('/login');
  };

  return (
    <SidebarProvider className="bg-zinc-50 text-zinc-900 font-sans">
      <AppSidebar />
      <SidebarInset className="flex min-w-0 flex-col overflow-x-hidden">
        <Navbar onLogout={sair} />
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  );
}

function App() {
  return (
    <BrowserRouter>
      <SessaoExpirada />
      <Routes>
        <Route element={<Raiz />}>
          <Route
            path="/login"
            element={
              <RotaPublica>
                <Login />
              </RotaPublica>
            }
          />
          <Route
            path="/register"
            element={
              <RotaPublica>
                <Register />
              </RotaPublica>
            }
          />
          <Route element={<AreaLogada />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route
              path="/persons"
              element={
                <Pagina>
                  <ListPersons />
                </Pagina>
              }
            />
            <Route
              path="/categories"
              element={
                <Pagina>
                  <ListCategories />
                </Pagina>
              }
            />
            <Route
              path="/items"
              element={
                <Pagina>
                  <ListItems />
                </Pagina>
              }
            />
            <Route
              path="/measures"
              element={
                <Pagina>
                  <ListMeasures />
                </Pagina>
              }
            />
            <Route
              path="/payables"
              element={
                <Pagina>
                  <PayableList />
                </Pagina>
              }
            />
            <Route
              path="/receivables"
              element={
                <Pagina>
                  <ReceivableList />
                </Pagina>
              }
            />
            <Route
              path="/plan-accounts"
              element={
                <Pagina>
                  <ListPlanAccounts />
                </Pagina>
              }
            />
            <Route
              path="/cash-book"
              element={
                <Pagina>
                  <ListCashBook />
                </Pagina>
              }
            />
            <Route
              path="/bank-accounts"
              element={
                <Pagina>
                  <ListBankAccounts />
                </Pagina>
              }
            />
            <Route
              path="/cash-flow"
              element={
                <Pagina>
                  <CashFlowView />
                </Pagina>
              }
            />
            <Route
              path="/income-statement"
              element={
                <Pagina>
                  <IncomeStatementView />
                </Pagina>
              }
            />
            <Route
              path="/inbound"
              element={
                <Pagina>
                  <InboundPage />
                </Pagina>
              }
            />
            <Route
              path="/inbound/setup"
              element={
                <Pagina>
                  <InboundSetupPage />
                </Pagina>
              }
            />
            <Route
              path="/settings"
              element={
                <Pagina>
                  <SettingsPage />
                </Pagina>
              }
            />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
