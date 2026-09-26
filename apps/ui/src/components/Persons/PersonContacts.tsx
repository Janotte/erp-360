import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { type ContactType, type PersonContact, personsService } from '@/services/persons';

const contactTypes: ContactType[] = ['Principal', 'Outro'];

interface ContactFormState {
  type: ContactType;
  department: string;
  name: string;
  phone: string;
  mobilePhone: string;
  email: string;
}

const emptyForm = (): ContactFormState => ({
  type: 'Principal',
  department: '',
  name: '',
  phone: '',
  mobilePhone: '',
  email: '',
});

function formatContact(contact: PersonContact) {
  return [contact.phone, contact.mobilePhone, contact.email].filter(Boolean).join(' · ');
}

interface PersonContactsProps {
  personId?: string;
}

export function PersonContacts({ personId }: PersonContactsProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ContactFormState | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [contactToDelete, setContactToDelete] = useState<PersonContact | null>(null);

  const contactsQuery = useQuery({
    queryKey: ['personContacts', personId],
    enabled: Boolean(personId),
    queryFn: () => personsService.listContacts(personId!),
  });

  const saveMutation = useMutation({
    mutationFn: (dados: ContactFormState) => {
      const payload = {
        type: dados.type,
        department: dados.department,
        name: dados.name,
        phone: dados.phone || undefined,
        mobilePhone: dados.mobilePhone || undefined,
        email: dados.email || undefined,
      };
      return editingId
        ? personsService.updateContact(personId!, editingId, payload)
        : personsService.createContact(personId!, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personContacts', personId] });
      toast.success(editingId ? 'Contato atualizado.' : 'Contato incluído.');
      closeForm();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Falha ao salvar contato.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (contactId: string) => personsService.deleteContact(personId!, contactId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personContacts', personId] });
      setContactToDelete(null);
      toast.success('Contato excluído.');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Falha ao excluir contato.');
    },
  });

  const closeForm = () => {
    setForm(null);
    setEditingId(null);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
  };

  const openEdit = (contact: PersonContact) => {
    setEditingId(contact.id);
    setForm({
      type: contact.type,
      department: contact.department,
      name: contact.name,
      phone: contact.phone ?? '',
      mobilePhone: contact.mobilePhone ?? '',
      email: contact.email ?? '',
    });
  };

  const updateForm = (patch: Partial<ContactFormState>) => {
    setForm((current) => (current ? { ...current, ...patch } : current));
  };

  if (!personId) {
    return (
      <p className="text-sm text-zinc-500">Salve a pessoa para cadastrar contatos.</p>
    );
  }

  const contacts = contactsQuery.data ?? [];

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Contatos</h3>
        {!form && (
          <Button type="button" variant="outline" size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Adicionar
          </Button>
        )}
      </div>

      {contactsQuery.isLoading ? (
        <p className="text-sm text-zinc-500">Carregando contatos...</p>
      ) : contacts.length === 0 && !form ? (
        <p className="text-sm text-zinc-500">Nenhum contato cadastrado.</p>
      ) : (
        <ul className="space-y-2">
          {contacts.map((contact) => (
            <li
              key={contact.id}
              className="flex items-start justify-between gap-3 rounded-md border border-zinc-200 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {contact.name}{' '}
                  <span className="font-normal text-zinc-500">· {contact.type}</span>
                </p>
                <p className="text-sm text-zinc-600">{contact.department}</p>
                {formatContact(contact) && (
                  <p className="text-sm text-zinc-600">{formatContact(contact)}</p>
                )}
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Editar contato ${contact.name}`}
                  onClick={() => openEdit(contact)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Excluir contato ${contact.name}`}
                  onClick={() => setContactToDelete(contact)}
                >
                  <Trash2 className="h-4 w-4 text-red-600" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {form && (
        <form
          className="space-y-3 rounded-md border border-zinc-200 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            saveMutation.mutate(form);
          }}
        >
          <div className="space-y-1">
            <Label>Tipo</Label>
            <Select
              value={form.type}
              onValueChange={(value) => updateForm({ type: value as ContactType })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {contactTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="contactName">Nome</Label>
              <Input
                id="contactName"
                value={form.name}
                maxLength={60}
                required
                onChange={(event) => updateForm({ name: event.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="department">Departamento</Label>
              <Input
                id="department"
                value={form.department}
                maxLength={40}
                required
                onChange={(event) => updateForm({ department: event.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="contactPhone">Telefone</Label>
              <Input
                id="contactPhone"
                value={form.phone}
                maxLength={20}
                onChange={(event) => updateForm({ phone: event.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="mobilePhone">Celular</Label>
              <Input
                id="mobilePhone"
                value={form.mobilePhone}
                maxLength={20}
                onChange={(event) => updateForm({ mobilePhone: event.target.value })}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="contactEmail">E-mail</Label>
            <Input
              id="contactEmail"
              type="email"
              value={form.email}
              maxLength={80}
              onChange={(event) => updateForm({ email: event.target.value })}
            />
          </div>

          {saveMutation.isError && (
            <p className="text-sm font-medium text-destructive">
              {saveMutation.error.message}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={closeForm}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Salvando...' : 'Salvar contato'}
            </Button>
          </div>
        </form>
      )}

      <AlertDialog
        open={Boolean(contactToDelete)}
        onOpenChange={(open) => {
          if (!open) setContactToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir contato</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja excluir o contato {contactToDelete?.name}? Essa ação não pode ser
              desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (contactToDelete) deleteMutation.mutate(contactToDelete.id);
              }}
            >
              {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
