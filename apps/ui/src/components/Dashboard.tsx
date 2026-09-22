export function Dashboard() {
  return (
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
          Clique nos botões da barra lateral ou reduza o tamanho da tela para testar o
          menu hambúrguer no celular.
        </p>
      </div>
    </main>
  );
}
