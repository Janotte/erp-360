import { useSearchParams } from 'react-router';

import { FinancialSettingsForm } from '@/components/Financial/Settings/FinancialSettingsForm';
import { ServiceOrderSettingsForm } from '@/components/ServiceOrders/ServiceOrderSettingsForm';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { CertificateSettings } from './CertificateSettings';
import { EmitterForm } from './EmitterForm';
import { NfeSettingsForm } from './NfeSettingsForm';
import { NfseSettingsForm } from './NfseSettingsForm';

const tabs = [
  'emitter',
  'certificate',
  'nfe',
  'nfse',
  'financial',
  'service-order',
] as const;
type SettingsTab = (typeof tabs)[number];

function readTab(value: string | null): SettingsTab {
  return tabs.includes(value as SettingsTab) ? (value as SettingsTab) : 'emitter';
}

export function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const tab = readTab(params.get('aba'));

  const setTab = (value: string) => {
    const next = new URLSearchParams(params);
    if (value === 'emitter') next.delete('aba');
    else next.set('aba', value);
    setParams(next, { replace: true });
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-[#172337]">Configurações</h2>
        <p className="mt-1 text-sm text-[#64748b]">
          Dados da empresa, certificado digital, NF-e, NFS-e, parâmetros financeiros e
          ordem de serviço.
        </p>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="emitter">Emitente</TabsTrigger>
          <TabsTrigger value="certificate">Certificado</TabsTrigger>
          <TabsTrigger value="nfe">NF-e</TabsTrigger>
          <TabsTrigger value="nfse">NFS-e</TabsTrigger>
          <TabsTrigger value="financial">Financeiro</TabsTrigger>
          <TabsTrigger value="service-order">Ordem de serviço</TabsTrigger>
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
        <TabsContent value="nfse">
          <NfseSettingsForm />
        </TabsContent>
        <TabsContent value="financial">
          <FinancialSettingsForm />
        </TabsContent>
        <TabsContent value="service-order">
          <ServiceOrderSettingsForm />
        </TabsContent>
      </Tabs>
    </div>
  );
}
