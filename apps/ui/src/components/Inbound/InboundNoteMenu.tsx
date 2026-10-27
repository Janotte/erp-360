import { useMutation, useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  type InboundListItem,
  inboundService,
  type RecipientManifestKind,
} from '@/services/inbound';

import { danfeDocument } from './danfeDocument';

type Panel = 'events' | 'xml' | 'danfe' | 'justify' | null;

const manifestActions: {
  kind: RecipientManifestKind;
  label: string;
  confirm: string | null;
}[] = [
  { kind: 'aware', label: 'Ciência', confirm: 'Registrar ciência desta NF-e na SEFAZ?' },
  {
    kind: 'confirmed',
    label: 'Confirmação',
    confirm:
      'Confirmar o recebimento desta NF-e na SEFAZ? A confirmação impede o cancelamento pelo emitente.',
  },
  {
    kind: 'unaware',
    label: 'Desconhecimento',
    confirm: 'Registrar desconhecimento desta operação na SEFAZ?',
  },
  { kind: 'not_performed', label: 'Não realizada', confirm: null },
];

function formatAt(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

export function InboundNoteMenu({
  cursor,
  onClose,
  onManifested,
}: {
  cursor: { row: InboundListItem; x: number; y: number } | null;
  onClose: () => void;
  onManifested: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const danfeFrame = useRef<HTMLIFrameElement>(null);
  const [manifestOpen, setManifestOpen] = useState(false);
  const [active, setActive] = useState<InboundListItem | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [justification, setJustification] = useState('');
  const [confirmKind, setConfirmKind] = useState<RecipientManifestKind | null>(null);

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
  }, [cursor, manifestOpen]);

  const events = useQuery({
    queryKey: ['inbound', 'events', active?.id],
    queryFn: () => inboundService.events(active?.id as string),
    enabled: panel === 'events' && Boolean(active),
  });
  const xml = useQuery({
    queryKey: ['inbound', 'manifestation', active?.id],
    queryFn: () => inboundService.manifestationXml(active?.id as string),
    enabled: panel === 'xml' && Boolean(active),
  });
  const danfe = useQuery({
    queryKey: ['inbound', 'danfe', active?.id],
    queryFn: () => inboundService.danfe(active?.id as string),
    enabled: panel === 'danfe' && Boolean(active),
  });
  const manifest = useMutation({
    mutationFn: (input: {
      id: string;
      kind: RecipientManifestKind;
      justification?: string;
    }) => inboundService.manifest(input.id, input.kind, input.justification),
    onMutate: () => {
      toast.loading('Enviando manifestação à SEFAZ...', { id: 'manifest' });
    },
    onSuccess: (result) => {
      toast.success(result.reason || 'Manifestação registrada.', { id: 'manifest' });
      setPanel(null);
      onManifested();
    },
    onError: (error: Error) => toast.error(error.message, { id: 'manifest' }),
  });

  function openPanel(next: Exclude<Panel, 'justify' | null>) {
    if (!cursor) return;
    setActive(cursor.row);
    setPanel(next);
    onClose();
  }

  function askManifest(kind: RecipientManifestKind) {
    if (!cursor) return;
    setActive(cursor.row);
    setConfirmKind(kind);
    onClose();
  }

  function sendManifest(kind: RecipientManifestKind, text?: string) {
    const row = active ?? cursor?.row;
    if (!row) return;
    setConfirmKind(null);
    setActive(row);
    onClose();
    manifest.mutate({ id: row.id, kind, justification: text });
  }

  const confirmAction = manifestActions.find((item) => item.kind === confirmKind);
  const locked = !cursor?.row.accessKey;
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
                disabled={locked}
                onClick={() => openPanel('danfe')}
              >
                Visualizar o DANFE
              </button>
              <button
                type="button"
                className={itemClass}
                disabled={locked}
                onClick={() => setManifestOpen((open) => !open)}
              >
                Manifestar
                <ChevronRight className="ml-auto h-4 w-4" />
              </button>
              {manifestOpen ? (
                <div className="ml-2 border-l pl-1">
                  {manifestActions.map((action) => (
                    <button
                      key={action.kind}
                      type="button"
                      className={itemClass}
                      disabled={locked || manifest.isPending}
                      onClick={() => {
                        if (action.kind === 'not_performed') {
                          setActive(cursor.row);
                          setJustification('');
                          setPanel('justify');
                          onClose();
                          return;
                        }
                        askManifest(action.kind);
                      }}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              ) : null}
              <button
                type="button"
                className={itemClass}
                disabled={locked}
                onClick={() => openPanel('xml')}
              >
                Visualizar XML da manifestação do destinatário
              </button>
              <button
                type="button"
                className={itemClass}
                disabled={locked}
                onClick={() => openPanel('events')}
              >
                Visualizar os eventos
              </button>
              {locked ? (
                <p className="px-2 py-1 text-xs text-zinc-500">
                  Nota sem chave de acesso.
                </p>
              ) : null}
            </div>,
            document.body,
          )
        : null}

      <Dialog open={panel === 'events'} onOpenChange={(open) => !open && setPanel(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Eventos da NF-e</DialogTitle>
            <DialogDescription>
              Cancelamento, carta de correção e manifestação do destinatário ligados a
              esta chave.
            </DialogDescription>
          </DialogHeader>
          {events.isPending ? (
            <p className="text-sm text-zinc-500">Carregando...</p>
          ) : null}
          {events.isError ? (
            <p className="text-sm text-rose-700">{events.error.message}</p>
          ) : null}
          {events.data && events.data.length === 0 ? (
            <p className="text-sm text-zinc-500">
              Nenhum evento encontrado para esta chave.
            </p>
          ) : null}
          {events.data && events.data.length > 0 ? (
            <div className="max-h-[60vh] overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-zinc-500">
                    <th className="py-2 pr-3 font-medium">Evento</th>
                    <th className="py-2 pr-3 font-medium">Data</th>
                    <th className="py-2 pr-3 font-medium">Protocolo</th>
                    <th className="py-2 font-medium">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {events.data.map((event) => (
                    <tr
                      key={`${event.code}-${event.at}-${event.protocol}`}
                      className="border-b"
                    >
                      <td className="py-2 pr-3">{event.label}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {formatAt(event.at)}
                      </td>
                      <td className="py-2 pr-3">{event.protocol || '—'}</td>
                      <td className="py-2">{event.reason || event.status || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={panel === 'xml'} onOpenChange={(open) => !open && setPanel(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>XML da manifestação do destinatário</DialogTitle>
            <DialogDescription>
              Evento de ciência, confirmação, desconhecimento ou operação não realizada.
            </DialogDescription>
          </DialogHeader>
          {xml.isPending ? <p className="text-sm text-zinc-500">Carregando...</p> : null}
          {xml.isError ? (
            <p className="text-sm text-rose-700">{xml.error.message}</p>
          ) : null}
          {xml.data ? (
            <>
              <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-all rounded-md bg-zinc-50 p-3 font-mono text-xs">
                {xml.data}
              </pre>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(xml.data)
                      .then(() => toast.success('XML copiado.'))
                      .catch(() => toast.error('Não foi possível copiar o XML.'));
                  }}
                >
                  Copiar XML
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={panel === 'danfe'} onOpenChange={(open) => !open && setPanel(null)}>
        <DialogContent className="max-h-[92vh] max-w-[1100px]">
          <DialogHeader>
            <DialogTitle>DANFE</DialogTitle>
            <DialogDescription>
              Visualização da NF-e de entrada a partir do XML completo.
            </DialogDescription>
          </DialogHeader>
          {danfe.isPending ? (
            <p className="text-sm text-zinc-500">Carregando...</p>
          ) : null}
          {danfe.isError ? (
            <p className="text-sm text-rose-700">{danfe.error.message}</p>
          ) : null}
          {danfe.data ? (
            <>
              <iframe
                ref={danfeFrame}
                title="DANFE"
                className="h-[65vh] w-full rounded-md border bg-white"
                srcDoc={danfeDocument(danfe.data)}
              />
              <DialogFooter>
                <Button
                  type="button"
                  onClick={() => {
                    const frame = danfeFrame.current?.contentWindow;
                    if (!frame) {
                      toast.error('Não foi possível imprimir o DANFE.');
                      return;
                    }
                    frame.focus();
                    frame.print();
                  }}
                >
                  Imprimir
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(confirmAction)}
        onOpenChange={(open) => !open && setConfirmKind(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Manifestar</AlertDialogTitle>
            <AlertDialogDescription className="text-base text-zinc-900">
              {confirmAction?.confirm}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={manifest.isPending}
              onClick={() => {
                if (confirmKind) sendManifest(confirmKind);
              }}
            >
              Registrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={panel === 'justify'} onOpenChange={(open) => !open && setPanel(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Operação não realizada</DialogTitle>
            <DialogDescription>
              A SEFAZ exige uma justificativa de 15 a 255 caracteres.
            </DialogDescription>
          </DialogHeader>
          <textarea
            className="min-h-28 w-full rounded-md border px-3 py-2 text-sm"
            value={justification}
            maxLength={255}
            onChange={(event) => setJustification(event.target.value)}
          />
          <p className="text-xs text-zinc-500">{justification.trim().length}/255</p>
          <DialogFooter>
            <Button
              type="button"
              disabled={
                manifest.isPending ||
                justification.trim().length < 15 ||
                justification.trim().length > 255
              }
              onClick={() => sendManifest('not_performed', justification.trim())}
            >
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
