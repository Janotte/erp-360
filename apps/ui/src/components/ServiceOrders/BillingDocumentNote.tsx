import { formatCurrency } from '@erp-360/shared';

import { Button } from '@/components/ui/button';
import type {
  ServiceOrderBillingDocument,
  ServiceOrderNfseLine,
} from '@/services/serviceOrders';

const fiscalStatusLabel: Record<ServiceOrderBillingDocument['fiscalStatus'], string> = {
  not_requested: 'Nota não solicitada',
  pending: 'Nota pendente',
  authorized: 'Nota autorizada',
  rejected: 'Nota recusada',
  canceled: 'Nota cancelada',
};

export function BillingDocumentNote({
  document,
  lines,
  onRequest,
  requesting,
}: {
  document: ServiceOrderBillingDocument;
  lines?: ServiceOrderNfseLine[];
  onRequest?: () => void;
  requesting?: boolean;
}) {
  const situation =
    document.commercialStatus === 'canceled' ? 'Documento cancelado' : 'Documento emitido';
  return (
    <div className="space-y-2">
      <p className="text-sm text-zinc-700">
        {situation} {document.numberLabel}. {fiscalStatusLabel[document.fiscalStatus]}.
      </p>
      {document.fiscalStatus === 'pending' ? (
        <p className="text-sm text-zinc-500">O pedido ficou na empresa. Nada foi enviado.</p>
      ) : null}
      {lines && lines.length > 0 ? (
        <ul className="text-sm text-zinc-700">
          {lines.map((line) => (
            <li key={line.lineNumber}>
              {line.description} · {formatCurrency(line.amount)}
            </li>
          ))}
        </ul>
      ) : null}
      {onRequest ? (
        <Button type="button" disabled={requesting} onClick={onRequest}>
          {requesting ? 'Pedindo...' : 'Pedir NFS-e'}
        </Button>
      ) : null}
    </div>
  );
}
