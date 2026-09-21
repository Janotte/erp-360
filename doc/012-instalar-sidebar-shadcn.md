Configurar uma estrutura de Sidebar + Navbar responsiva antes de criar as telas de negócio é a estratégia correta. Isso cria a casca (layout) do ERP de forma reutilizável. O Shadcn/UI possui um ecossistema completo para isso chamado @/components/ui/sidebar, que gerencia colapsos, estados de menu e responsividade em dispositivos móveis por padrão.
Vamos instalar o componente de Sidebar e criar o layout adaptável dentro do seu projeto de frontend (apps/ui).
------------------------------

## 🛠️ Passo 1: Instalar o Componente de Sidebar do Shadcn

Navegue até a pasta do seu app de frontend no terminal e adicione o componente de Sidebar e a Tooltip (usada para os ícones quando a barra encolher):

cd apps/ui
pnpm dlx shadcn@latest add sidebar tooltip

---

## 📐 Passo 2: Criar o Componente da Sidebar (apps/ui/src/components/AppSidebar.tsx)

Vamos montar os menus de navegação integrando os módulos futuros (Pessoas, Contas a Pagar, Contas a Receber). Crie o arquivo apps/ui/src/components/AppSidebar.tsx:

import { Users, CreditCard, ArrowUpRight, LayoutDashboard, Settings } from 'lucide-react';import {
Sidebar,
SidebarContent,
SidebarGroup,
SidebarGroupContent,
SidebarGroupLabel,
SidebarMenu,
SidebarMenuButton,
SidebarMenuItem,
SidebarHeader,
} from '@/components/ui/sidebar';
// Itens de navegação do ERPconst itensMenu = [
{ title: 'Dashboard', icon: LayoutDashboard, url: '#dashboard' },
{ title: 'Pessoas', icon: Users, url: '#pessoas' },
{ title: 'Contas a Pagar', icon: CreditCard, url: '#pagar' },
{ title: 'Contas a Receber', icon: ArrowUpRight, url: '#receber' },
{ title: 'Configurações', icon: Settings, url: '#configuracoes' },
];
export function AppSidebar() {
return (
<Sidebar collapsible="icon">
<SidebarHeader className="border-b border-zinc-200 py-4 px-4 flex flex-row items-center gap-2">
<div className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-900 text-white font-bold text-sm">
E
</div>
<span className="font-bold text-zinc-900 group-data-[collapsible=icon]:hidden">
ERP Core
</span>
</SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navegação</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {itensMenu.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={item.title}>
                    <a href={item.url} className="flex items-center gap-3">
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>

);
}

---

## 🌐 Passo 3: Criar a Navbar Superior Responsiva (apps/ui/src/components/Navbar.tsx)

A Navbar conterá o gatilho para abrir/fechar a barra lateral (essencial no mobile) e o botão de deslogar. Crie o arquivo apps/ui/src/components/Navbar.tsx:

import { SidebarTrigger } from '@/components/ui/sidebar';import { Button } from '@/components/ui/button';import { LogOut } from 'lucide-react';
interface NavbarProps {
onLogout: () => void;
}
export function Navbar({ onLogout }: NavbarProps) {
return (
<header className="flex h-16 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-4 shadow-2xs sticky top-0 z-10 w-full">
<div className="flex items-center gap-2">
{/* O SidebarTrigger adiciona o botão sanduíche que abre/fecha a barra lateral */}
<SidebarTrigger className="-ml-1" />
<div className="h-4 w-px bg-zinc-200 my-1 mx-2 hidden sm:block" />
<span className="text-sm font-medium text-zinc-500 hidden sm:block">
Ambiente Corporativo Isolado
</span>
</div>

      <Button variant="ghost" size="sm" onClick={onLogout} className="gap-2 text-zinc-600 hover:text-red-600">
        <LogOut className="h-4 w-4" />
        <span className="hidden sm:inline">Sair</span>
      </Button>
    </header>

);
}

---

## 🔄 Passo 4: Envelopar o Layout Geral (apps/ui/src/App.tsx)

O Shadcn exige que o layout seja envelopado por um componente SidebarProvider. Ele gerencia os cookies de estado de abertura de tela para evitar pulos de tela (CLS).
Substitua o arquivo apps/ui/src/App.tsx para injetar a nova casca responsiva:

import { useState } from 'react';import { Login } from './components/Login';import { Registro } from './components/Registro';import { AppSidebar } from './components/AppSidebar';import { Navbar } from './components/Navbar';import { authStorage } from './utils/auth';import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
type TelaAtiva = 'login' | 'registro' | 'dashboard';
function App() {
const [tela, setTela] = useState<TelaAtiva>(
authStorage.isAuthenticated() ? 'dashboard' : 'login'
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
                <p className="text-2xl font-bold mt-2 text-zinc-900">R\$ 1.250,00</p>
              </div>
              <div className="p-6 bg-white rounded-xl border border-zinc-200 shadow-2xs">
                <h4 className="text-sm font-medium text-zinc-500">A receber hoje</h4>
                <p className="text-2xl font-bold mt-2 text-zinc-900">R\$ 4.800,00</p>
              </div>
              <div className="p-6 bg-white rounded-xl border border-zinc-200 shadow-2xs">
                <h4 className="text-sm font-medium text-zinc-500">Saldo Tenant</h4>
                <p className="text-2xl font-bold mt-2 text-emerald-600">+ R\$ 3.550,00</p>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-2xs">
              <h3 className="text-lg font-bold">Módulo de Trabalho Ativo</h3>
              <p className="text-sm text-zinc-500 mt-1">
                Clique nos botões da barra lateral ou reduza o tamanho da tela para testar o menu hambúrguer no celular.
              </p>
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>

);
}
export default App;

---

## 🎯 Resultado Obtido

Ao rodar seu ambiente com pnpm dev, a casca estrutural do ERP está completa:

- No Desktop, a Sidebar inicia aberta, possui efeito de hover suave nos itens de navegação e pode ser colapsada em formato de ícones usando o botão da Navbar.
- No Mobile, a Sidebar se esconde automaticamente transformando-se em uma gaveta lateral que desliza suavemente sobre o conteúdo ao clicar no gatilho superior, adaptando perfeitamente as tabelas.
