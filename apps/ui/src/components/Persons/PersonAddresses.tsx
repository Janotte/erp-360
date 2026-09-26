import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
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
import { locationsService } from '@/services/locations';
import { type AddressType, type PersonAddress, personsService } from '@/services/persons';

const addressTypes: AddressType[] = ['Principal', 'Faturamento', 'Entrega', 'Outro'];

interface AddressFormState {
  type: AddressType;
  postalCode: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  stateId: string;
  cityId: string;
  cityName: string;
}

const emptyForm = (): AddressFormState => ({
  type: 'Principal',
  postalCode: '',
  street: '',
  number: '',
  complement: '',
  neighborhood: '',
  stateId: '',
  cityId: '',
  cityName: '',
});

function formatAddress(address: PersonAddress) {
  const streetLine = [address.street, address.number].filter(Boolean).join(', ');
  const cityLine = [address.cityName, address.stateAbbreviation]
    .filter(Boolean)
    .join('/');
  const place = [address.neighborhood, cityLine].filter(Boolean).join(' - ');
  return [streetLine, place, address.postalCode].filter(Boolean).join(' · ');
}

interface PersonAddressesProps {
  personId?: string;
}

export function PersonAddresses({ personId }: PersonAddressesProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<AddressFormState | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [citySearchText, setCitySearchText] = useState('');
  const [citySearch, setCitySearch] = useState('');
  const [addressToDelete, setAddressToDelete] = useState<PersonAddress | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setCitySearch(citySearchText.trim()), 300);
    return () => clearTimeout(timer);
  }, [citySearchText]);

  const addressesQuery = useQuery({
    queryKey: ['personAddresses', personId],
    enabled: Boolean(personId),
    queryFn: () => personsService.listAddresses(personId!),
  });

  const statesQuery = useQuery({
    queryKey: ['states'],
    enabled: Boolean(personId && form),
    staleTime: 10 * 60 * 1000,
    queryFn: locationsService.listStates,
  });

  const citiesQuery = useQuery({
    queryKey: ['cities', form?.stateId, citySearch],
    enabled: Boolean(form?.stateId) && citySearch.length >= 2,
    queryFn: () => locationsService.listCities(form!.stateId, citySearch),
  });

  const saveMutation = useMutation({
    mutationFn: (dados: AddressFormState) => {
      const payload = {
        type: dados.type,
        postalCode: dados.postalCode || undefined,
        street: dados.street || undefined,
        number: dados.number || undefined,
        complement: dados.complement || undefined,
        neighborhood: dados.neighborhood || undefined,
        cityId: dados.cityId || null,
      };
      return editingId
        ? personsService.updateAddress(personId!, editingId, payload)
        : personsService.createAddress(personId!, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personAddresses', personId] });
      toast.success(editingId ? 'Endereço atualizado.' : 'Endereço incluído.');
      closeForm();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Falha ao salvar endereço.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (addressId: string) => personsService.deleteAddress(personId!, addressId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personAddresses', personId] });
      setAddressToDelete(null);
      toast.success('Endereço excluído.');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Falha ao excluir endereço.');
    },
  });

  const closeForm = () => {
    setForm(null);
    setEditingId(null);
    setCitySearchText('');
    setCitySearch('');
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setCitySearchText('');
    setCitySearch('');
  };

  const openEdit = (address: PersonAddress) => {
    setEditingId(address.id);
    setForm({
      type: address.type,
      postalCode: address.postalCode ?? '',
      street: address.street ?? '',
      number: address.number ?? '',
      complement: address.complement ?? '',
      neighborhood: address.neighborhood ?? '',
      stateId: address.stateId ?? '',
      cityId: address.cityId ?? '',
      cityName: address.cityName ?? '',
    });
    setCitySearchText(address.cityName ?? '');
    setCitySearch(address.cityName?.trim() ?? '');
  };

  const updateForm = (patch: Partial<AddressFormState>) => {
    setForm((current) => (current ? { ...current, ...patch } : current));
  };

  if (!personId) {
    return (
      <p className="text-sm text-zinc-500">Salve a pessoa para cadastrar endereços.</p>
    );
  }

  const addresses = addressesQuery.data ?? [];
  const cities = [...(citiesQuery.data ?? [])];
  if (form?.cityId && form.cityName && !cities.some((city) => city.id === form.cityId)) {
    cities.unshift({ id: form.cityId, name: form.cityName });
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Endereços</h3>
        {!form && (
          <Button type="button" variant="outline" size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Adicionar
          </Button>
        )}
      </div>

      {addressesQuery.isLoading ? (
        <p className="text-sm text-zinc-500">Carregando endereços...</p>
      ) : addresses.length === 0 && !form ? (
        <p className="text-sm text-zinc-500">Nenhum endereço cadastrado.</p>
      ) : (
        <ul className="space-y-2">
          {addresses.map((address) => (
            <li
              key={address.id}
              className="flex items-start justify-between gap-3 rounded-md border border-zinc-200 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{address.type}</p>
                <p className="text-sm text-zinc-600">
                  {formatAddress(address) || 'Endereço sem detalhes'}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Editar endereço ${address.type}`}
                  onClick={() => openEdit(address)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Excluir endereço ${address.type}`}
                  onClick={() => setAddressToDelete(address)}
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
              onValueChange={(value) => updateForm({ type: value as AddressType })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {addressTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="postalCode">CEP</Label>
              <Input
                id="postalCode"
                value={form.postalCode}
                maxLength={9}
                onChange={(event) => updateForm({ postalCode: event.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="number">Número</Label>
              <Input
                id="number"
                value={form.number}
                maxLength={10}
                onChange={(event) => updateForm({ number: event.target.value })}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="street">Logradouro</Label>
            <Input
              id="street"
              value={form.street}
              maxLength={60}
              onChange={(event) => updateForm({ street: event.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="complement">Complemento</Label>
              <Input
                id="complement"
                value={form.complement}
                maxLength={30}
                onChange={(event) => updateForm({ complement: event.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="neighborhood">Bairro</Label>
              <Input
                id="neighborhood"
                value={form.neighborhood}
                maxLength={50}
                onChange={(event) => updateForm({ neighborhood: event.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Estado</Label>
              <Select
                value={form.stateId || undefined}
                onValueChange={(value) => {
                  updateForm({ stateId: value, cityId: '', cityName: '' });
                  setCitySearchText('');
                  setCitySearch('');
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {(statesQuery.data ?? []).map((state) => (
                    <SelectItem key={state.id} value={state.id}>
                      {state.abbreviation} - {state.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="citySearch">Cidade</Label>
              <Input
                id="citySearch"
                value={citySearchText}
                placeholder="Digite ao menos 2 letras"
                disabled={!form.stateId}
                onChange={(event) => {
                  setCitySearchText(event.target.value);
                  updateForm({ cityId: '', cityName: '' });
                }}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Select
              value={form.cityId || undefined}
              onValueChange={(value) => {
                const city = cities.find((item) => item.id === value);
                updateForm({ cityId: value, cityName: city?.name ?? '' });
              }}
              disabled={!form.stateId || citySearch.length < 2}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    citySearch.length < 2 ? 'Busque a cidade' : 'Selecione a cidade'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {cities.map((city) => (
                  <SelectItem key={city.id} value={city.id}>
                    {city.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              {saveMutation.isPending ? 'Salvando...' : 'Salvar endereço'}
            </Button>
          </div>
        </form>
      )}

      <AlertDialog
        open={Boolean(addressToDelete)}
        onOpenChange={(open) => {
          if (!open) setAddressToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir endereço</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja excluir o endereço {addressToDelete?.type.toLowerCase()}? Essa ação
              não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (addressToDelete) deleteMutation.mutate(addressToDelete.id);
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
