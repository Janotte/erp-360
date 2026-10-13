import {
  ArrowUpRight,
  BookOpen,
  ChevronRight,
  CreditCard,
  Landmark,
  LayoutDashboard,
  type LucideIcon,
  Settings,
  Users,
  Wallet,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from '@/components/ui/sidebar';

type FilhoMenu = {
  title: string;
  icon: LucideIcon;
  url: string;
};

type ItemMenu = {
  title: string;
  icon: LucideIcon;
  url?: string;
  filhos?: FilhoMenu[];
};

const itensMenu: ItemMenu[] = [
  { title: 'Dashboard', icon: LayoutDashboard, url: '/dashboard' },
  { title: 'Pessoas', icon: Users, url: '/persons' },
  {
    title: 'Financeiro',
    icon: CreditCard,
    filhos: [
      { title: 'Pagar', icon: CreditCard, url: '/payables' },
      { title: 'Receber', icon: ArrowUpRight, url: '/receivables' },
      { title: 'Livro caixa', icon: Wallet, url: '/cash-book' },
      { title: 'Contas bancárias', icon: Landmark, url: '/bank-accounts' },
      { title: 'Fluxo de caixa', icon: BookOpen, url: '/cash-flow' },
      { title: 'Plano de Contas', icon: BookOpen, url: '/plan-accounts' },
    ],
  },
  { title: 'Configurações', icon: Settings, url: '/settings' },
];

export function AppSidebar() {
  const { pathname } = useLocation();
  const pathAtivo = pathname.replace(/\/$/, '') || '/';
  const { isMobile, setOpenMobile } = useSidebar();
  const rotaFinanceira =
    pathAtivo === '/payables' ||
    pathAtivo === '/receivables' ||
    pathAtivo === '/plan-accounts' ||
    pathAtivo === '/cash-book' ||
    pathAtivo === '/bank-accounts' ||
    pathAtivo === '/cash-flow';
  const [financeiroAberto, setFinanceiroAberto] = useState(rotaFinanceira);

  useEffect(() => {
    if (rotaFinanceira) setFinanceiroAberto(true);
  }, [rotaFinanceira]);

  const fecharNoCelular = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="flex h-16 shrink-0 flex-row items-center gap-2 border-b border-zinc-200 px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-900 text-sm font-bold text-white">
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
              {itensMenu.map((item) => {
                if (item.filhos?.length) {
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        tooltip={item.title}
                        isActive={rotaFinanceira}
                        onClick={() => setFinanceiroAberto((aberto) => !aberto)}
                      >
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                        <ChevronRight
                          className={`ml-auto h-4 w-4 transition-transform ${
                            financeiroAberto ? 'rotate-90' : ''
                          }`}
                        />
                      </SidebarMenuButton>

                      {financeiroAberto && (
                        <SidebarMenuSub>
                          {item.filhos.map((filho) => (
                            <SidebarMenuSubItem key={filho.url}>
                              <SidebarMenuSubButton
                                asChild
                                isActive={pathAtivo === filho.url}
                              >
                                <Link to={filho.url} onClick={fecharNoCelular}>
                                  <filho.icon className="h-4 w-4" />
                                  <span>{filho.title}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      )}
                    </SidebarMenuItem>
                  );
                }

                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      tooltip={item.title}
                      isActive={pathAtivo === item.url}
                    >
                      <Link
                        to={item.url ?? '/dashboard'}
                        className="flex items-center gap-3"
                        onClick={fecharNoCelular}
                      >
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
