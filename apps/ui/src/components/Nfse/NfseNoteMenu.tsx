import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  type NfseCancelReasonCode,
  type NfseListItem,
  nfseCancelReasonLabel,
  nfseService,
} from '@/services/nfse';

type Panel = 'events' | null;

function formatAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function eventLabel(type: string) {
  if (type === 'e101101') return 'Cancelamento de NFS-e';
  return type;
}

export function NfseNoteMenu({
  cursor,
  onClose,
  onOpenDanfse,
  onCanceled,
}: {
  cursor: { row: NfseListItem; x: number; y: number } | null;
  onClose: () => void;
  onOpenDanfse: (row: NfseListItem) => void;
  onCanceled: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<NfseListItem | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reasonCode, setReasonCode] = useState<NfseCancelReasonCode>('1');
  const [reasonText, setReasonText] = useState('');

  useEffect(() => {
    if (!cursor) return;
    const closeOnPointer = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      onClose();
    };
    const closeOnKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', closeOnPointer);
    window.addEventListener('keydown', closeOnKey);
    window.addEventListener('scroll', onClose, true);
    return () => {
      window.removeEventListener('mousedown', closeOnPointer);
      window.removeEventListener('keydown', closeOnKey);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [cursor, onClose]);

  useEffect(() => {
    const el = menuRef.current;
    if (!el || !cursor) return;
    const rect = el.getBoundingClientRect();
    const top =
      rect.bottom > window.innerHeight - 8
        ? Math.max(8, window.innerHeight - rect.height - 8)
        : cursor.y;
    const left =
      rect.right > window.innerWidth - 8
        ? Math.max(8, window.innerWidth - rect.width - 8)
        : cursor.x;
    el.style.top = `${top}px`;
    el.style.left = `${left}px`;
  }, [cursor]);

  const events = useQuery({
    queryKey: ['nfse', 'events', active?.id],
    queryFn: () => nfseService.events(active!.id),
    enabled: panel === 'events' && Boolean(active),
  });

  const cancel = useMutation({
    mutationFn: () =>
      nfseService.cancel((active ?? cursor?.row)!.id, {
        reasonCode,
        reasonText: reasonText.trim(),
      }),
    onMutate: () => {
      toast.loading('Cancelando a NFS-e no ambiente nacional...', { id: 'nfse-cancel' });
    },
    onSuccess: (result) => {
      toast.success(result.message || 'NFS-e cancelada.', { id: 'nfse-cancel' });
      setConfirmOpen(false);
      setReasonText('');
      setReasonCode('1');
      onCanceled();
    },
    onError: (error: Error) => toast.error(error.message, { id: 'nfse-cancel' }),
  });

  const canDanfse = cursor?.row.status === 'authorized' && Boolean(cursor.row.accessKey);
  const canCancel = canDanfse;
  const canEvents = Boolean(cursor?.row.accessKey);
  const justificationOk = reasonText.trim().length >= 15 && reasonText.trim().length <= 255;
  const itemClass =
    'flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <>
      {cursor
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              className="fixed z-50 min-w-64 rounded-md border bg-white p-1 text-zinc-900 shadow-md"
              style={{ top: cursor.y, left: cursor.x }}
              onMouseDown={(event) => event.stopPropagation()}
              onContextMenu={(event) => event.preventDefault()}
            >
              <button
                type="button"
                className={itemClass}
                disabled={!canDanfse}
                onClick={() => {
                  onOpenDanfse(cursor.row);
                  onClose();
                }}
              >
                Visualizar DANFSe
              </button>
              <button
                type="button"
                className={itemClass}
                disabled={!canCancel}
                onClick={() => {
                  setActive(cursor.row);
                  setConfirmOpen(true);
                  onClose();
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={itemClass}
                disabled={!canEvents}
                onClick={() => {
                  setActive(cursor.row);
                  setPanel('events');
                  onClose();
                }}
              >
                Visualizar os eventos
              </button>
            </div>,
            document.body,
          )
        : null}

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (cancel.isPending) return;
          setConfirmOpen(open);
          if (!open) {
            setReasonText('');
            setReasonCode('1');
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar NFS-e</AlertDialogTitle>
            <AlertDialogDescription>
              O cancelamento é enviado ao ambiente nacional e não pode ser desfeito nesta chave de
              acesso. Informe o motivo oficial.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-3 py-2">
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-zinc-800">Motivo</span>
              <select
                className="h-9 rounded-md border border-zinc-300 bg-white px-2"
                value={reasonCode}
                onChange={(event) => setReasonCode(event.target.value as NfseCancelReasonCode)}
              >
                {(Object.keys(nfseCancelReasonLabel) as NfseCancelReasonCode[]).map((code) => (
                  <option key={code} value={code}>
                    {nfseCancelReasonLabel[code]}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-zinc-800">Justificativa</span>
              <textarea
                className="min-h-24 rounded-md border border-zinc-300 bg-white px-2 py-1.5"
                value={reasonText}
                maxLength={255}
                placeholder="Mínimo de 15 caracteres"
                onChange={(event) => setReasonText(event.target.value)}
              />
              <span className="text-xs text-zinc-500">{reasonText.trim().length}/255</span>
            </label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancel.isPending}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={!justificationOk || cancel.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (!justificationOk || cancel.isPending) return;
                cancel.mutate();
              }}
            >
              Confirmar cancelamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={panel === 'events'}
        onOpenChange={(open) => {
          if (open) return;
          setPanel(null);
          setActive(null);
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Eventos da NFS-e</DialogTitle>
            <DialogDescription>
              Eventos registrados localmente para esta nota.
            </DialogDescription>
          </DialogHeader>
          {events.isPending ? <p className="text-sm text-zinc-500">Carregando...</p> : null}
          {events.isError ? (
            <p className="text-sm text-rose-700">{events.error.message}</p>
          ) : null}
          {events.data && events.data.length === 0 ? (
            <p className="text-sm text-zinc-600">Nenhum evento registrado.</p>
          ) : null}
          {events.data && events.data.length > 0 ? (
            <ul className="grid gap-3">
              {events.data.map((event) => (
                <li key={event.id} className="rounded-md border border-zinc-200 p-3 text-sm">
                  <div className="font-medium text-zinc-900">{eventLabel(event.type)}</div>
                  <div className="mt-1 text-zinc-600">{formatAt(event.registeredAt)}</div>
                  {event.reasonCode ? (
                    <div className="mt-1 text-zinc-700">
                      Motivo:{' '}
                      {nfseCancelReasonLabel[event.reasonCode as NfseCancelReasonCode] ??
                        event.reasonCode}
                    </div>
                  ) : null}
                  {event.reasonText ? (
                    <div className="mt-1 whitespace-pre-wrap text-zinc-700">{event.reasonText}</div>
                  ) : null}
                  <details className="mt-2">
                    <summary className="cursor-pointer text-zinc-500">XML do evento</summary>
                    <pre className="mt-2 max-h-48 overflow-auto rounded bg-zinc-50 p-2 text-xs">
                      {event.eventXml}
                    </pre>
                  </details>
                </li>
              ))}
            </ul>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
