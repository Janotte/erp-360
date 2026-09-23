import { useMutation, useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { type Person, personsService } from '../../services/persons';
interface FormPersonProps {
  personToUpdate?: Person | null;
  onSuccess: () => void;
}
export function FormPerson({ personToUpdate, onSuccess }: FormPersonProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [document, setDocument] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [isClient, setIsClient] = useState(false);
  const [isSupplier, setIsSupplier] = useState(false);
  const [isEmployee, setIsEmployee] = useState(false);

  useEffect(() => {
    if (personToUpdate) {
      setName(personToUpdate.name);
      setDocument(personToUpdate.document || '');
      setEmail(personToUpdate.email || '');
      setPhone(personToUpdate.phone || '');
      setIsClient(personToUpdate.isClient);
      setIsSupplier(personToUpdate.isSupplier);
      setIsEmployee(personToUpdate.isEmployee);
    }
  }, [personToUpdate]);

  const mutation = useMutation({
    mutationFn: (dados: Omit<Person, 'id'>) => {
      return personToUpdate
        ? personsService.update(personToUpdate.id, dados)
        : personsService.create(dados);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['listaPessoas'] });
      toast.success(
        personToUpdate
          ? 'Pessoa atualizada com sucesso!'
          : 'Pessoa cadastrada com sucesso!',
      );
      onSuccess();
    },
    onError: (error) => {
      toast.error(`Falha ao salvar: ${error.message || 'Erro inesperado'}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      name,
      document: document || undefined,
      email: email || undefined,
      phone: phone || undefined,
      isClient,
      isSupplier,
      isEmployee,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-4">
      <div className="space-y-1">
        <Label htmlFor="nome">Nome / Razão Social</Label>
        <Input
          id="nome"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="document">Documento</Label>
          <Input
            id="document"
            value={document}
            onChange={(e) => setDocument(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="phone">Telefone</Label>
          <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2 pt-2">
        <Label>Perfil da Pessoa</Label>
        <div className="flex gap-6 mt-1">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="cliente"
              checked={isClient}
              onCheckedChange={(v) => setIsClient(!!v)}
            />
            <label htmlFor="cliente" className="text-sm font-medium">
              Cliente
            </label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="fornecedor"
              checked={isSupplier}
              onCheckedChange={(v) => setIsSupplier(!!v)}
            />
            <label htmlFor="fornecedor" className="text-sm font-medium">
              Fornecedor
            </label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="colaborador"
              checked={isEmployee}
              onCheckedChange={(v) => setIsEmployee(!!v)}
            />
            <label htmlFor="colaborador" className="text-sm font-medium">
              Colaborador
            </label>
          </div>
        </div>
      </div>

      {mutation.isError && (
        <p className="text-sm font-medium text-destructive bg-destructive/10 p-3 rounded-md">
          {mutation.error.message}
        </p>
      )}

      <Button type="submit" className="w-full mt-4" disabled={mutation.isPending}>
        {mutation.isPending ? 'Salvando...' : 'Salvar'}
      </Button>
    </form>
  );
}
