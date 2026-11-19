import { useQuery } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { emitterService } from '@/services/emitter';

interface NavbarProps {
  onLogout: () => void;
}

export function Navbar({ onLogout }: NavbarProps) {
  const emitter = useQuery({
    queryKey: ['settings', 'emitter'],
    queryFn: emitterService.get,
  });
  const companyName = emitter.data?.name.trim() ?? '';

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-4 shadow-2xs sticky top-0 z-10 w-full">
      <div className="flex min-w-0 items-center gap-2">
        {/* O SidebarTrigger adiciona o botão sanduíche que abre/fecha a barra lateral */}
        <SidebarTrigger className="-ml-1" />
        {companyName ? (
          <>
            <div className="mx-2 my-1 hidden h-4 w-px bg-zinc-200 sm:block" />
            <span
              className="hidden min-w-0 truncate text-sm font-medium text-zinc-500 sm:block"
              title={companyName}
            >
              {companyName}
            </span>
          </>
        ) : null}
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
