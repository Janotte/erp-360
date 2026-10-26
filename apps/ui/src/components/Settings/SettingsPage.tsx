import { FinancialSettingsForm } from '@/components/Financial/Settings/FinancialSettingsForm';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { CertificateSettings } from './CertificateSettings';
import { EmitterForm } from './EmitterForm';
import { NfeSettingsForm } from './NfeSettingsForm';

export function SettingsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-zinc-900">Configurações</h2>
        <p className="text-sm text-zinc-500">
          Dados da empresa, certificado digital, NF-e e parâmetros financeiros.
        </p>
      </div>
      <Tabs defaultValue="emitter">
        <TabsList>
          <TabsTrigger value="emitter">Emitente</TabsTrigger>
          <TabsTrigger value="certificate">Certificado</TabsTrigger>
          <TabsTrigger value="nfe">NF-e</TabsTrigger>
          <TabsTrigger value="financial">Financeiro</TabsTrigger>
        </TabsList>
        <TabsContent value="emitter">
          <EmitterForm />
        </TabsContent>
        <TabsContent value="certificate">
          <CertificateSettings />
        </TabsContent>
        <TabsContent value="nfe">
          <NfeSettingsForm />
        </TabsContent>
        <TabsContent value="financial">
          <FinancialSettingsForm />
        </TabsContent>
      </Tabs>
    </div>
  );
}
