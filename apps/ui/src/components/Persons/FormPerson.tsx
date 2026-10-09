import {
  formatTaxId,
  isValidCnpj,
  isValidCpf,
  parsePersonKind,
  parseTaxpayerType,
  personKindLabels,
  personKinds,
  taxpayerTypeLabels,
  taxpayerTypes,
  toTitleCasePtBr,
  type PersonKind,
} from '@erp-360/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import {
  type CnpjLookupAddress,
  type Person,
  type PersonInput,
  personsService,
} from '../../services/persons';
import { Separator } from '../ui/separator';
import { PersonAddresses } from './PersonAddresses';
import { PersonContacts } from './PersonContacts';

const fieldLabels: Record<
  PersonKind,
  { name: string; taxId: string; stateRegistration: string; birthDate: string }
> = {
  individual: {
    name: 'Nome',
    taxId: 'CPF',
    stateRegistration: 'RG',
    birthDate: 'Data de nascimento',
  },
  company: {
    name: 'Razão social',
    taxId: 'CNPJ',
    stateRegistration: 'IE',
    birthDate: 'Data de fundação',
  },
  foreigner: {
    name: 'Nome',
    taxId: 'Documento',
    stateRegistration: 'Documento 2',
    birthDate: 'Nascimento/Fundação',
  },
};

function toDateInput(value?: string | null) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function parseEmails(raw: string) {
  return raw
    .split(/[,;\n]/)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function taxIdMaxLength(kind: PersonKind) {
  if (kind === 'individual') return 14;
  if (kind === 'company') return 18;
  return 19;
}

interface FormPersonProps {
  personToUpdate?: Person | null;
  onPersisted?: (person: Person) => void;
}

export function FormPerson({ personToUpdate, onPersisted }: FormPersonProps) {
  const queryClient = useQueryClient();
  const [personId, setPersonId] = useState(personToUpdate?.id);
  const [personKind, setPersonKind] = useState<PersonKind>('individual');
  const [name, setName] = useState('');
  const [preserveNameCasing, setPreserveNameCasing] = useState(false);
  const [taxId, setTaxId] = useState('');
  const [taxIdError, setTaxIdError] = useState('');
  const [taxpayerType, setTaxpayerType] = useState('9');
  const [stateRegistration, setStateRegistration] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [nfeEmail, setNfeEmail] = useState('');
  const [documentEmails, setDocumentEmails] = useState('');
  const [notes, setNotes] = useState('');
  const [isRuralProducer, setIsRuralProducer] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [isVisible, setIsVisible] = useState(true);
  const [isClient, setIsClient] = useState(false);
  const [isSupplier, setIsSupplier] = useState(false);
  const [isEmployee, setIsEmployee] = useState(false);
  const [isFinancialInstitution, setIsFinancialInstitution] = useState(false);
  const [pendingAddress, setPendingAddress] = useState<CnpjLookupAddress | null>(null);
  const pendingAddressRef = useRef<CnpjLookupAddress | null>(null);
  pendingAddressRef.current = pendingAddress;

  const { data: personLoaded } = useQuery({
    queryKey: ['person', personId],
    enabled: Boolean(personId),
    staleTime: 0,
    queryFn: () => personsService.get(personId!),
  });

  useEffect(() => {
    if (!personLoaded && !personToUpdate) return;

    const person = { ...personToUpdate, ...personLoaded };
    const kind = parsePersonKind(person.type);
    const taxpayer =
      kind === 'individual'
        ? 9
        : (parseTaxpayerType(personLoaded?.taxpayerType) ??
          parseTaxpayerType(personToUpdate?.taxpayerType) ??
          parseTaxpayerType((person as { taxpayer_type?: unknown }).taxpayer_type));

    setPersonKind(kind);
    setName(person.name ?? '');
    setPreserveNameCasing(Boolean(person.preserveNameCasing));
    setTaxId(formatTaxId(kind, person.taxId || ''));
    setTaxIdError('');
    setTaxpayerType(taxpayer != null ? String(taxpayer) : '');
    setStateRegistration(person.stateRegistration || '');
    setBirthDate(toDateInput(person.birthDate));
    setNfeEmail(person.nfeEmail || '');
    setDocumentEmails((person.documentEmails ?? []).join(', '));
    setNotes(person.notes || '');
    setIsRuralProducer(Boolean(person.isRuralProducer));
    setIsActive(person.isActive !== false);
    setIsVisible(person.isVisible !== false);
    setIsClient(Boolean(person.isClient));
    setIsSupplier(Boolean(person.isSupplier));
    setIsEmployee(Boolean(person.isEmployee));
    setIsFinancialInstitution(Boolean(person.isFinancialInstitution));
  }, [personLoaded, personToUpdate]);

  const mutation = useMutation({
    mutationFn: (dados: PersonInput) => {
      return personId
        ? personsService.update(personId, dados)
        : personsService.create(dados);
    },
    onSuccess: async (saved) => {
      const created = !personId;
      setPersonId(saved.id);
      const savedKind = parsePersonKind(saved.type);
      setPersonKind(savedKind);
      setName(saved.name);
      setPreserveNameCasing(Boolean(saved.preserveNameCasing));
      setTaxId(formatTaxId(savedKind, saved.taxId || ''));
      const savedType =
        savedKind === 'individual'
          ? '9'
          : (parseTaxpayerType(saved.taxpayerType)?.toString() ?? taxpayerType);
      setTaxpayerType(savedType);
      queryClient.setQueryData(['person', saved.id], saved);
      queryClient.invalidateQueries({ queryKey: ['person', saved.id] });
      queryClient.invalidateQueries({ queryKey: ['listaPessoas'] });

      const draft = pendingAddressRef.current;
      if (created && draft?.cityId) {
        try {
          await personsService.createAddress(saved.id, {
            type: 'Principal',
            postalCode: draft.postalCode || undefined,
            street: draft.street || undefined,
            number: draft.number || undefined,
            complement: draft.complement || undefined,
            neighborhood: draft.neighborhood || undefined,
            cityId: draft.cityId,
          });
          setPendingAddress(null);
          queryClient.invalidateQueries({ queryKey: ['personAddresses', saved.id] });
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : 'Pessoa salva, mas o endereço principal não foi gravado.',
          );
        }
      }

      onPersisted?.(saved);
      toast.success(
        created ? 'Pessoa cadastrada com sucesso!' : 'Pessoa atualizada com sucesso!',
      );
    },
    onError: (error) => {
      toast.error(`Falha ao salvar: ${error.message || 'Erro inesperado'}`);
    },
  });

  const labels = fieldLabels[personKind];
  const showTaxpayerType = personKind === 'company';

  const handleKindChange = (next: PersonKind) => {
    setPersonKind(next);
    setTaxId((current) => formatTaxId(next, current));
    setTaxIdError('');
    if (next !== 'company') setPendingAddress(null);
    if (next === 'individual') setTaxpayerType('9');
  };

  const handleTaxIdChange = (value: string) => {
    setTaxId(formatTaxId(personKind, value));
    setTaxIdError('');
  };

  const lookupMutation = useMutation({
    mutationFn: () => personsService.lookupCnpj(taxId),
    onSuccess: (data) => {
      setName(data.name);
      setBirthDate(data.birthDate ?? '');
      setNfeEmail(data.nfeEmail ?? '');
      setPendingAddress(data.address);
      if (data.existingPersonId && data.existingPersonId !== personId) {
        toast.error('Este CNPJ já está cadastrado neste ambiente.');
      } else if (data.address && !data.address.cityId) {
        toast.error('Dados preenchidos, mas a cidade não foi encontrada. Complete o endereço após salvar.');
      } else {
        toast.success('Dados do CNPJ preenchidos. Confira e salve.');
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const lookupCnpj = () => {
    if (!isValidCnpj(taxId)) {
      setTaxIdError('CNPJ inválido');
      return;
    }
    lookupMutation.mutate();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (personKind === 'individual' && taxId && !isValidCpf(taxId)) {
      setTaxIdError('CPF inválido');
      return;
    }
    if (personKind === 'company' && taxId && !isValidCnpj(taxId)) {
      setTaxIdError('CNPJ inválido');
      return;
    }

    mutation.mutate({
      type: personKind,
      name,
      preserveNameCasing,
      taxId: taxId || null,
      taxpayerType: personKind === 'individual' ? 9 : parseTaxpayerType(taxpayerType),
      stateRegistration: stateRegistration || null,
      isRuralProducer,
      birthDate: birthDate || null,
      nfeEmail: nfeEmail || null,
      documentEmails: parseEmails(documentEmails),
      notes: notes || null,
      isActive,
      isVisible,
      isClient,
      isSupplier,
      isEmployee,
      isFinancialInstitution,
    });
  };

  const selectClassName =
    'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

  return (
    <div className="space-y-6 pt-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="personKind">Tipo de pessoa</Label>
          <select
            id="personKind"
            value={personKind}
            onChange={(event) => handleKindChange(parsePersonKind(event.target.value))}
            className={selectClassName}
            required
          >
            {personKinds.map((kind) => (
              <option key={kind} value={kind}>
                {personKindLabels[kind]}
              </option>
            ))}
          </select>
        </div>

        {personKind === 'company' ? (
          <div className="space-y-1">
            <Label htmlFor="taxId">{labels.taxId}</Label>
            <Input
              id="taxId"
              value={taxId}
              maxLength={taxIdMaxLength(personKind)}
              inputMode="numeric"
              autoComplete="off"
              onChange={(e) => handleTaxIdChange(e.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                lookupCnpj();
              }}
            />
            <p className="text-xs text-zinc-500">
              {lookupMutation.isPending
                ? 'Consultando CNPJ...'
                : 'Digite o CNPJ e pressione Enter para preencher os dados.'}
            </p>
            {taxIdError ? (
              <p className="text-sm text-destructive">{taxIdError}</p>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-1">
          <Label htmlFor="nome">{labels.name}</Label>
          <Input
            id="nome"
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              if (!preserveNameCasing) setName(toTitleCasePtBr(name));
            }}
            required
          />
          <div className="flex items-center space-x-2 pt-1">
            <Checkbox
              id="preserveNameCasing"
              checked={preserveNameCasing}
              onCheckedChange={(checked) => {
                const next = Boolean(checked);
                setPreserveNameCasing(next);
                if (!next) setName(toTitleCasePtBr(name));
              }}
            />
            <label htmlFor="preserveNameCasing" className="text-sm text-zinc-600">
              Manter grafia
            </label>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {personKind !== 'company' ? (
            <div className="space-y-1">
              <Label htmlFor="taxId">{labels.taxId}</Label>
              <Input
                id="taxId"
                value={taxId}
                maxLength={taxIdMaxLength(personKind)}
                inputMode={personKind === 'foreigner' ? 'text' : 'numeric'}
                autoComplete="off"
                onChange={(e) => handleTaxIdChange(e.target.value)}
              />
              {taxIdError ? (
                <p className="text-sm text-destructive">{taxIdError}</p>
              ) : null}
            </div>
          ) : null}
          <div className="space-y-1">
            <Label htmlFor="birthDate">{labels.birthDate}</Label>
            <Input
              id="birthDate"
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
            />
          </div>
        </div>

        {showTaxpayerType ? (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="taxpayerType">Indicador de contribuinte</Label>
              <select
                id="taxpayerType"
                value={taxpayerType}
                onChange={(event) => setTaxpayerType(event.target.value)}
                className={selectClassName}
              >
                <option value="">Selecione</option>
                {taxpayerTypes.map((value) => (
                  <option key={value} value={String(value)}>
                    {taxpayerTypeLabels[value]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="stateRegistration">{labels.stateRegistration}</Label>
              <Input
                id="stateRegistration"
                value={stateRegistration}
                maxLength={20}
                onChange={(e) => setStateRegistration(e.target.value)}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <Label htmlFor="stateRegistration">{labels.stateRegistration}</Label>
            <Input
              id="stateRegistration"
              value={stateRegistration}
              maxLength={20}
              onChange={(e) => setStateRegistration(e.target.value)}
            />
          </div>
        )}

        <div className="space-y-1">
          <Label htmlFor="nfeEmail">E-mail da NF-e</Label>
          <Input
            id="nfeEmail"
            type="email"
            value={nfeEmail}
            maxLength={60}
            onChange={(e) => setNfeEmail(e.target.value.toLowerCase())}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="documentEmails">E-mails de documentos</Label>
          <Input
            id="documentEmails"
            value={documentEmails}
            placeholder="Separe por vírgula"
            onChange={(e) => setDocumentEmails(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="notes">Observações</Label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="flex min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <Label>Perfil da Pessoa</Label>
          <div className="flex flex-wrap gap-6 mt-1">
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
            <div className="flex items-center space-x-2">
              <Checkbox
                id="instituicao"
                checked={isFinancialInstitution}
                onCheckedChange={(v) => setIsFinancialInstitution(!!v)}
              />
              <label htmlFor="instituicao" className="text-sm font-medium">
                Instituição financeira
              </label>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-6">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="rural"
              checked={isRuralProducer}
              onCheckedChange={(v) => setIsRuralProducer(!!v)}
            />
            <label htmlFor="rural" className="text-sm font-medium">
              Produtor rural
            </label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="ativo"
              checked={isActive}
              onCheckedChange={(v) => setIsActive(!!v)}
            />
            <label htmlFor="ativo" className="text-sm font-medium">
              Ativo
            </label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="visivel"
              checked={isVisible}
              onCheckedChange={(v) => setIsVisible(!!v)}
            />
            <label htmlFor="visivel" className="text-sm font-medium">
              Visível
            </label>
          </div>
        </div>

        {mutation.isError && (
          <p className="text-sm font-medium text-destructive bg-destructive/10 p-3 rounded-md">
            {mutation.error.message}
          </p>
        )}

        {pendingAddress && !personId ? (
          <p className="text-sm text-zinc-600">
            Endereço Principal a gravar:{' '}
            {[
              pendingAddress.street,
              pendingAddress.number,
              pendingAddress.neighborhood,
              pendingAddress.cityName,
              pendingAddress.stateAbbreviation,
            ]
              .filter(Boolean)
              .join(', ')}
            {pendingAddress.cityId ? '' : ' (cidade pendente)'}
          </p>
        ) : null}

        <Button type="submit" className="w-full mt-4" disabled={mutation.isPending}>
          {mutation.isPending ? 'Salvando...' : 'Salvar'}
        </Button>
      </form>

      <Separator />
      <PersonAddresses personId={personId} />
      <Separator />
      <PersonContacts personId={personId} />
    </div>
  );
}
