import { type ReactNode } from 'react';
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

const rotasPorHash: Record<string, string> = {
  '#dashboard': '/dashboard',
  '#persons': '/persons',
  '#receivables': '/receivables',
  '#payables': '/payables',
  '#plan-accounts': '/plan-accounts',
  '#cash-book': '/cash-book',
  '#bank-accounts': '/bank-accounts',
  '#cash-flow': '/cash-flow',
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

function AreaLogada() {
  const navigate = useNavigate();
  if (!authStorage.isAuthenticated()) return <Navigate to="/login" replace />;

  const sair = () => {
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
              path="/settings"
              element={
                <Pagina>
                  <FinancialSettingsForm />
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
