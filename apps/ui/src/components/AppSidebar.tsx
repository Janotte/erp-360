import { ArrowUpRight, CreditCard, LayoutDashboard, Settings, Users } from 'lucide-react';

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
} from '@/components/ui/sidebar';

const itensMenu = [
  { title: 'Dashboard', icon: LayoutDashboard, url: '/dashboard' },
  { title: 'Pessoas', icon: Users, url: '/persons' },
  { title: 'Contas a Pagar', icon: CreditCard, url: '/pagar' },
  { title: 'Contas a Receber', icon: ArrowUpRight, url: '/receber' },
  { title: 'Configurações', icon: Settings, url: '/configuracoes' },
];

interface AppSidebarProps {
  pathAtivo: string;
  onNavigate: (path: string) => void;
}

export function AppSidebar({ pathAtivo, onNavigate }: AppSidebarProps) {
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
                  <SidebarMenuButton
                    asChild
                    tooltip={item.title}
                    isActive={pathAtivo === item.url}
                  >
                    <a
                      href={item.url}
                      className="flex items-center gap-3"
                      onClick={(event) => {
                        event.preventDefault();
                        onNavigate(item.url);
                      }}
                    >
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
