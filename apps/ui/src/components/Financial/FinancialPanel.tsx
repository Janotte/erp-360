import { Plus } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Importando as divisões de arquivos limpos
import { PayableForm } from './Payables/PayableForm';
import { PayableList } from './Payables/PayableList';
import { ReceivableForm } from './Receivables/ReceivableForm';
import { ReceivableList } from './Receivables/ReceivableList';

export function FinancialPanel() {
  const [activeTab, setActiveTab] = useState<'payable' | 'receivable'>('payable');
  const [openInsert, setOpenInsert] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-bold text-zinc-900">Financeiro</h3>
          <p className="text-sm text-zinc-500">
            Fluxo de caixa controlado de forma independente.
          </p>
        </div>

        <Dialog open={openInsert} onOpenChange={setOpenInsert}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" /> Novo Lançamento
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                Lançar Conta a {activeTab === 'payable' ? 'Pagar' : 'Receber'}
              </DialogTitle>
            </DialogHeader>
            {/* Renderiza o formulário correto baseado na aba ativa */}
            {activeTab === 'payable' ? (
              <PayableForm tipo="payable" onSuccess={() => setOpenInsert(false)} />
            ) : (
              <ReceivableForm onSuccess={() => setOpenInsert(false)} />
            )}
          </DialogContent>
        </Dialog>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as any)}
        className="w-full"
      >
        <TabsList className="grid grid-cols-2 max-w-[400px]">
          <TabsTrigger value="payable">🛑 Contas a Pagar</TabsTrigger>
          <TabsTrigger value="receivable">💰 Contas a Receber</TabsTrigger>
        </TabsList>

        <TabsContent value="payable" className="mt-4">
          <PayableList />
        </TabsContent>

        <TabsContent value="receivable" className="mt-4">
          <ReceivableList />
        </TabsContent>
      </Tabs>
    </div>
  );
}
