import {
  ArrowUpRight,
  ChevronRight,
  CreditCard,
  LayoutDashboard,
  Settings,
  Users,
} from 'lucide-react';

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

const rotasFinanceiro = ['/payables', '/receivables', '/settings'];

const itensMenu = [
  { title: 'Dashboard', icon: LayoutDashboard, url: '/dashboard' },
  { title: 'Pessoas', icon: Users, url: '/persons' },
  {
    title: 'Financeiro',
    icon: CreditCard,
    url: '/payables',
    filhos: [
      { title: 'Contas a Pagar', icon: CreditCard, url: '/payables' },
      { title: 'Contas a Receber', icon: ArrowUpRight, url: '/receivables' },
    ],
  },
  { title: 'Configurações', icon: Settings, url: '/settings' },
];

interface AppSidebarProps {
  pathAtivo: string;
  onNavigate: (path: string) => void;
}

export function AppSidebar({ pathAtivo, onNavigate }: AppSidebarProps) {
  const { isMobile, setOpenMobile } = useSidebar();
  const financeiroAberto = rotasFinanceiro.includes(pathAtivo);

  const navegar = (url: string) => {
    onNavigate(url);
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
                const temFilhos = Boolean(item.filhos?.length);
                const ativo = temFilhos ? financeiroAberto : pathAtivo === item.url;

                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild tooltip={item.title} isActive={ativo}>
                      <a
                        href={item.url}
                        className="flex items-center gap-3"
                        onClick={(event) => {
                          event.preventDefault();
                          navegar(item.url);
                        }}
                      >
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                        {temFilhos && (
                          <ChevronRight
                            className={`ml-auto h-4 w-4 transition-transform ${
                              financeiroAberto ? 'rotate-90' : ''
                            }`}
                          />
                        )}
                      </a>
                    </SidebarMenuButton>

                    {temFilhos && financeiroAberto && (
                      <SidebarMenuSub>
                        {item.filhos!.map((filho) => (
                          <SidebarMenuSubItem key={filho.url}>
                            <SidebarMenuSubButton
                              asChild
                              isActive={pathAtivo === filho.url}
                            >
                              <a
                                href={filho.url}
                                onClick={(event) => {
                                  event.preventDefault();
                                  navegar(filho.url);
                                }}
                              >
                                <filho.icon className="h-4 w-4" />
                                <span>{filho.title}</span>
                              </a>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    )}
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
