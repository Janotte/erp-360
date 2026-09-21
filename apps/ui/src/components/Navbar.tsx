import { LogOut } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';

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

      <Button
        variant="ghost"
        size="sm"
        onClick={onLogout}
        className="gap-2 text-zinc-600 hover:text-red-600"
      >
        <LogOut className="h-4 w-4" />
        <span className="hidden sm:inline">Sair</span>
      </Button>
    </header>
  );
}
