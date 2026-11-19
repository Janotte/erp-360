import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { PersonSearchSelect } from '@/components/Persons/PersonSearchSelect';
import { Button } from '@/components/ui/button';
import { FloatingInput, FloatingSelect } from '@/components/ui/FloatingField';
import { type CompanyCard, companyCardService } from '@/services/companyCards';
import { treasuryService } from '@/services/treasury';

function dayValue(value: string) {
  const day = Number(value);
  return Number.isInteger(day) ? day : Number.NaN;
}

export function CompanyCardForm({
  cardToUpdate,
  onCancel,
  onSuccess,
}: {
  cardToUpdate: CompanyCard | null;
  onCancel: () => void;
  onSuccess: (card: CompanyCard) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(cardToUpdate?.name ?? '');
  const [issuerId, setIssuerId] = useState(cardToUpdate?.issuerId ?? '');
  const [closingDay, setClosingDay] = useState(String(cardToUpdate?.closingDay ?? 1));
  const [dueDay, setDueDay] = useState(String(cardToUpdate?.dueDay ?? 10));
  const [bankAccountId, setBankAccountId] = useState(cardToUpdate?.bankAccountId ?? '');
  const [isActive, setIsActive] = useState(cardToUpdate?.isActive ?? true);

  const accounts = useQuery({
    queryKey: ['treasury', 'bank-accounts'],
    queryFn: treasuryService.bankAccounts,
  });

  const save = useMutation({
    mutationFn: () => {
      const closing = dayValue(closingDay);
      const due = dayValue(dueDay);
      if (!name.trim()) throw new Error('Informe o nome do cartão.');
      if (!issuerId) throw new Error('Informe o emissor.');
      if (!Number.isInteger(closing) || closing < 1 || closing > 28) {
        throw new Error('O fechamento vai do dia 1 ao 28.');
      }
      if (!Number.isInteger(due) || due < 1 || due > 28) {
        throw new Error('O vencimento vai do dia 1 ao 28.');
      }
      const payload = {
        name: name.trim(),
        issuerId,
        cardBrandId: cardToUpdate?.cardBrandId ?? null,
        closingDay: closing,
        dueDay: due,
        bankAccountId: bankAccountId || null,
        isActive,
      };
      return cardToUpdate
        ? companyCardService.update(cardToUpdate.id, payload)
        : companyCardService.create(payload);
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ['company-cards'] });
      toast.success(cardToUpdate ? 'Cartão atualizado.' : 'Cartão cadastrado.');
      onSuccess(saved);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <FloatingInput
        label="Nome"
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={60}
        required
        autoFocus
      />
      <PersonSearchSelect
        label="Emissor"
        value={issuerId}
        onChange={setIssuerId}
        type="instituicao"
        placeholder="Buscar instituição financeira"
        required
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <FloatingInput
          label="Dia de fechamento"
          value={closingDay}
          inputMode="numeric"
          pinned
          onChange={(event) => setClosingDay(event.target.value.replace(/\D/g, ''))}
          required
        />
        <FloatingInput
          label="Dia de vencimento"
          value={dueDay}
          inputMode="numeric"
          pinned
          onChange={(event) => setDueDay(event.target.value.replace(/\D/g, ''))}
          required
        />
      </div>
      <FloatingSelect
        label="Conta que paga a fatura"
        value={bankAccountId}
        pinned
        onChange={(event) => setBankAccountId(event.target.value)}
      >
        <option value="">Nenhuma</option>
        {(accounts.data ?? []).map((account) => (
          <option key={account.id} value={account.id}>
            {account.name}
          </option>
        ))}
      </FloatingSelect>
      <FloatingSelect
        label="Situação"
        value={isActive ? 'ativo' : 'inativo'}
        pinned
        onChange={(event) => setIsActive(event.target.value === 'ativo')}
      >
        <option value="ativo">Ativo</option>
        <option value="inativo">Inativo</option>
      </FloatingSelect>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={save.isPending}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Salvando...' : cardToUpdate ? 'Atualizar' : 'Cadastrar'}
        </Button>
      </div>
    </form>
  );
}
