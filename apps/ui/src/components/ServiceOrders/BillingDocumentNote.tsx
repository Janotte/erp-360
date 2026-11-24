import type { ServiceOrderBillingDocument } from '@/services/serviceOrders';

const fiscalStatusLabel: Record<ServiceOrderBillingDocument['fiscalStatus'], string> = {
  not_requested: 'Nota não solicitada',
  pending: 'Nota pendente',
  authorized: 'Nota autorizada',
  rejected: 'Nota recusada',
  canceled: 'Nota cancelada',
};

export function BillingDocumentNote({
  document,
}: {
  document: ServiceOrderBillingDocument;
}) {
  const situation =
    document.commercialStatus === 'canceled' ? 'Documento cancelado' : 'Documento emitido';
  return (
    <p className="text-sm text-zinc-700">
      {situation} {document.numberLabel}. {fiscalStatusLabel[document.fiscalStatus]}.
    </p>
  );
}
