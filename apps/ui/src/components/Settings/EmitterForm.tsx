import {
  formatCnpj,
  formatPhone,
  formatPostalCode,
  isValidCnpj,
  onlyDigits,
  toTitleCasePtBr,
} from '@erp-360/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

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
import { emitterService, type Emitter, type TenantCrt } from '@/services/emitter';
import { locationsService } from '@/services/locations';
import { personsService } from '@/services/persons';

const crtOptions: { value: TenantCrt; label: string }[] = [
  { value: '1', label: '1 — Simples Nacional' },
  { value: '2', label: '2 — Simples Nacional, excesso de sublimite' },
  { value: '3', label: '3 — Regime Normal' },
  { value: '4', label: '4 — Simples Nacional, MEI' },
];

function formatCnae(value: string) {
  const digits = onlyDigits(value).slice(0, 7);
  if (digits.length <= 4) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 5)}/${digits.slice(5)}`;
}

function displayPhone(value: string | null | undefined) {
  const digits = onlyDigits(value ?? '');
  if (!digits) return '';
  if (digits.length <= 11) return formatPhone(digits);
  return digits.slice(0, 14);
}

function foldCityName(value: string) {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR').trim();
}

function findExactCity(options: { id: string; name: string }[], search: string) {
  const wanted = foldCityName(search);
  if (wanted.length < 2) return null;
  return options.find((city) => foldCityName(city.name) === wanted) ?? null;
}

export function EmitterForm() {
  const queryClient = useQueryClient();
  const { data, isError, isPending, refetch } = useQuery({
    queryKey: ['settings', 'emitter'],
    queryFn: emitterService.get,
  });
  const statesQuery = useQuery({
    queryKey: ['locations', 'states'],
    queryFn: locationsService.listStates,
  });

  const [name, setName] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [stateRegistration, setStateRegistration] = useState('');
  const [municipalRegistration, setMunicipalRegistration] = useState('');
  const [cnae, setCnae] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [crt, setCrt] = useState<TenantCrt>('1');
  const [postalCode, setPostalCode] = useState('');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [stateId, setStateId] = useState('');
  const [cityId, setCityId] = useState('');
  const [cityName, setCityName] = useState('');
  const [citySearchText, setCitySearchText] = useState('');
  const [citySearch, setCitySearch] = useState('');
  const [pendingUf, setPendingUf] = useState('');
  const [cnpjError, setCnpjError] = useState('');
  const edited = useRef(false);
  const lookupPatch = useRef<{
    stateId: string;
    cityId: string | null;
    cityName: string | null;
  } | null>(null);

  const applyEmitter = (emitter: Emitter) => {
    setName(emitter.name);
    setTradeName(emitter.tradeName);
    setCnpj(formatCnpj(emitter.cnpj));
    setStateRegistration(emitter.stateRegistration ?? '');
    setMunicipalRegistration(emitter.municipalRegistration ?? '');
    setCnae(emitter.cnae ? formatCnae(emitter.cnae) : '');
    setEmail(emitter.email ?? '');
    setPhone(displayPhone(emitter.phone));
    setCrt(emitter.crt);
    setPostalCode(emitter.postalCode ? formatPostalCode(emitter.postalCode) : '');
    setStreet(emitter.street ?? '');
    setNumber(emitter.number ?? '');
    setComplement(emitter.complement ?? '');
    setNeighborhood(emitter.neighborhood ?? '');
    setStateId(emitter.stateId ?? '');
    setCityId(emitter.cityId ?? '');
    setCityName(emitter.cityName ?? '');
    setCitySearchText(emitter.cityName ?? '');
    setCitySearch((emitter.cityName ?? '').trim());
  };

  useEffect(() => {
    if (!data || edited.current) return;
    applyEmitter(data);
  }, [data]);

  useEffect(() => {
    const timer = setTimeout(() => setCitySearch(citySearchText.trim()), 300);
    return () => clearTimeout(timer);
  }, [citySearchText]);

  useEffect(() => {
    if (!pendingUf || stateId) return;
    const state = (statesQuery.data ?? []).find((item) => item.abbreviation === pendingUf);
    if (!state) return;
    if (lookupPatch.current) {
      lookupPatch.current = { ...lookupPatch.current, stateId: state.id };
    }
    setStateId(state.id);
  }, [pendingUf, stateId, statesQuery.data]);

  const citiesQuery = useQuery({
    queryKey: ['locations', 'cities', stateId, citySearch],
    queryFn: () => locationsService.listCities(stateId, citySearch),
    enabled: Boolean(stateId) && citySearch.length >= 2,
  });

  const cities = [...(citiesQuery.data ?? [])];
  if (cityId && cityName && !cities.some((city) => city.id === cityId)) {
    cities.unshift({ id: cityId, name: cityName });
  }

  const saveMutation = useMutation({
    mutationFn: emitterService.save,
    onSuccess: (saved) => {
      edited.current = true;
      applyEmitter(saved);
      queryClient.setQueryData(['settings', 'emitter'], saved);
      toast.success('Emitente salvo.');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const lookupMutation = useMutation({
    mutationFn: () => personsService.lookupCnpj(cnpj),
    onSuccess: (result) => {
      edited.current = true;
      setName(result.name.slice(0, 60));
      if (result.tradeName) setTradeName(result.tradeName.slice(0, 60));
      if (result.nfeEmail) setEmail(result.nfeEmail);
      if (result.phone) setPhone(displayPhone(result.phone));
      if (result.cnae) setCnae(formatCnae(result.cnae));
      if (result.stateRegistration) {
        setStateRegistration(result.stateRegistration.slice(0, 14));
      }
      const address = result.address;
      if (address) {
        setPostalCode(address.postalCode ? formatPostalCode(address.postalCode) : '');
        setStreet(address.street ?? '');
        setNumber(address.number ?? '');
        setComplement(address.complement ?? '');
        setNeighborhood(address.neighborhood ?? '');
        const state = (statesQuery.data ?? []).find(
          (item) => item.abbreviation === address.stateAbbreviation,
        );
        lookupPatch.current = {
          stateId: state?.id ?? '',
          cityId: address.cityId,
          cityName: address.cityName,
        };
        if (address.stateAbbreviation) setPendingUf(address.stateAbbreviation);
        setStateId(state?.id ?? '');
        if (address.cityName) {
          setCitySearchText(address.cityName);
          setCitySearch(address.cityName.trim());
        }
        if (address.cityId) {
          setCityId(address.cityId);
          setCityName(address.cityName ?? '');
        }
      }
      if (address && !address.cityId) {
        toast.error('Dados preenchidos, mas a cidade não foi encontrada.');
      } else {
        toast.success('Dados do CNPJ preenchidos. Confira e salve.');
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const cepMutation = useMutation({
    mutationFn: (cep: string) => personsService.lookupCep(cep),
    onSuccess: (result) => {
      edited.current = true;
      lookupPatch.current = {
        stateId: result.stateId ?? '',
        cityId: result.cityId,
        cityName: result.cityName,
      };
      setPostalCode(formatPostalCode(result.postalCode));
      if (result.street) setStreet(result.street);
      if (result.neighborhood) setNeighborhood(result.neighborhood);
      if (result.stateId) setStateId(result.stateId);
      if (result.cityId) {
        setCityId(result.cityId);
        setCityName(result.cityName ?? '');
        setCitySearchText(result.cityName ?? '');
        setCitySearch((result.cityName ?? '').trim());
      } else {
        toast.error('CEP encontrado, mas a cidade não foi localizada.');
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  useEffect(() => {
    if (cityId || !stateId || citySearch.length < 2) return;
    const match = findExactCity(citiesQuery.data ?? [], citySearch);
    if (!match) return;
    setCityId(match.id);
    setCityName(match.name);
  }, [cityId, stateId, citySearch, citiesQuery.data]);

  const lookupCnpj = () => {
    if (!isValidCnpj(cnpj)) {
      setCnpjError('CNPJ inválido');
      return;
    }
    setCnpjError('');
    lookupMutation.mutate();
  };

  const lookupCep = () => {
    if (onlyDigits(postalCode).length !== 8) {
      toast.error('CEP deve ter 8 dígitos.');
      return;
    }
    cepMutation.mutate(postalCode);
  };

  const selectClassName =
    'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

  if (!data) {
    if (isPending && !isError) {
      return <p className="text-sm text-zinc-500">Carregando emitente...</p>;
    }
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">Não foi possível carregar o emitente.</p>
        <Button type="button" variant="outline" onClick={() => void refetch()}>
          Tentar de novo
        </Button>
      </div>
    );
  }

  return (
    <form
      className="max-w-3xl space-y-4 rounded-lg border bg-white p-4"
      onChange={() => {
        edited.current = true;
      }}
      onSubmit={(event) => {
        event.preventDefault();
        if (!isValidCnpj(cnpj)) {
          setCnpjError('CNPJ inválido');
          return;
        }
        const persist = async () => {
          let resolvedCityId = cityId;
          const typedCity = citySearchText.trim();
          if (!resolvedCityId && stateId && typedCity.length >= 2) {
            const list = await locationsService.listCities(stateId, typedCity);
            const match = findExactCity(list, typedCity);
            if (match) {
              resolvedCityId = match.id;
              setCityId(match.id);
              setCityName(match.name);
            }
          }
          if (!resolvedCityId) {
            toast.error(
              stateId
                ? 'Escolha a cidade na lista.'
                : 'Selecione o estado e a cidade do emitente.',
            );
            return;
          }
          saveMutation.mutate({
            name,
            tradeName,
            cnpj,
            stateRegistration: stateRegistration || null,
            municipalRegistration: municipalRegistration || null,
            cnae: cnae || null,
            email: email || null,
            phone: phone || null,
            crt,
            postalCode: postalCode || null,
            street: street || null,
            number: number || null,
            complement: complement || null,
            neighborhood: neighborhood || null,
            cityId: resolvedCityId,
          });
        };
        void persist();
      }}
    >
      <div>
        <h3 className="text-lg font-bold text-zinc-900">Emitente</h3>
        <p className="text-sm text-zinc-500">
          Dados da empresa usados na emissão de NF-e, NFC-e e NFS-e.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="emitterCnpj">CNPJ</Label>
          <Input
            id="emitterCnpj"
            value={cnpj}
            maxLength={18}
            inputMode="numeric"
            autoComplete="off"
            onChange={(event) => {
              setCnpj(formatCnpj(event.target.value));
              setCnpjError('');
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              lookupCnpj();
            }}
            required
          />
          <p className="text-xs text-zinc-500">
            {lookupMutation.isPending
              ? 'Consultando CNPJ...'
              : 'Digite o CNPJ e pressione Enter para preencher os dados.'}
          </p>
          {cnpjError ? <p className="text-sm text-destructive">{cnpjError}</p> : null}
        </div>
        <div className="space-y-1">
          <Label htmlFor="emitterCrt">CRT</Label>
          <select
            id="emitterCrt"
            className={selectClassName}
            value={crt}
            onChange={(event) => setCrt(event.target.value as TenantCrt)}
          >
            {crtOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="emitterName">Razão social</Label>
          <Input
            id="emitterName"
            value={name}
            maxLength={60}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => setName(toTitleCasePtBr(name))}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="emitterTradeName">Nome fantasia</Label>
          <Input
            id="emitterTradeName"
            value={tradeName}
            maxLength={60}
            onChange={(event) => setTradeName(event.target.value)}
            onBlur={() => setTradeName(toTitleCasePtBr(tradeName))}
            required
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="emitterIe">Inscrição estadual</Label>
          <Input
            id="emitterIe"
            value={stateRegistration}
            maxLength={14}
            onChange={(event) => setStateRegistration(event.target.value.toUpperCase())}
            placeholder="ISENTO"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="emitterIm">Inscrição municipal</Label>
          <Input
            id="emitterIm"
            value={municipalRegistration}
            maxLength={15}
            onChange={(event) => setMunicipalRegistration(event.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="emitterCnae">CNAE</Label>
          <Input
            id="emitterCnae"
            value={cnae}
            maxLength={9}
            inputMode="numeric"
            onChange={(event) => setCnae(formatCnae(event.target.value))}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="emitterEmail">E-mail</Label>
          <Input
            id="emitterEmail"
            type="email"
            value={email}
            maxLength={80}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="emitterPhone">Telefone</Label>
          <Input
            id="emitterPhone"
            value={phone}
            maxLength={16}
            inputMode="numeric"
            onChange={(event) => setPhone(displayPhone(event.target.value))}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="space-y-1 md:col-span-1">
          <Label htmlFor="emitterPostalCode">CEP</Label>
          <Input
            id="emitterPostalCode"
            value={postalCode}
            maxLength={9}
            inputMode="numeric"
            onChange={(event) => setPostalCode(formatPostalCode(event.target.value))}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              lookupCep();
            }}
          />
          <p className="text-xs text-zinc-500">
            {cepMutation.isPending ? 'Consultando CEP...' : 'Enter consulta o CEP.'}
          </p>
        </div>
        <div className="space-y-1 md:col-span-2">
          <Label htmlFor="emitterStreet">Logradouro</Label>
          <Input
            id="emitterStreet"
            value={street}
            maxLength={60}
            onChange={(event) => setStreet(event.target.value)}
            onBlur={() => setStreet(toTitleCasePtBr(street))}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="emitterNumber">Número</Label>
          <Input
            id="emitterNumber"
            value={number}
            maxLength={60}
            onChange={(event) => setNumber(event.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="emitterComplement">Complemento</Label>
          <Input
            id="emitterComplement"
            value={complement}
            maxLength={60}
            onChange={(event) => setComplement(event.target.value)}
            onBlur={() => setComplement(toTitleCasePtBr(complement))}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="emitterNeighborhood">Bairro</Label>
          <Input
            id="emitterNeighborhood"
            value={neighborhood}
            maxLength={60}
            onChange={(event) => setNeighborhood(event.target.value)}
            onBlur={() => setNeighborhood(toTitleCasePtBr(neighborhood))}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <Label>Estado</Label>
          <Select
            value={stateId || undefined}
            onValueChange={(value) => {
              if (!value || value === stateId) return;
              const patch = lookupPatch.current;
              if (patch?.stateId === value) {
                setStateId(value);
                if (patch.cityId) {
                  setCityId(patch.cityId);
                  setCityName(patch.cityName ?? '');
                  setCitySearchText(patch.cityName ?? '');
                  setCitySearch((patch.cityName ?? '').trim());
                }
                return;
              }
              lookupPatch.current = null;
              setPendingUf('');
              setStateId(value);
              setCityId('');
              setCityName('');
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
                  {state.abbreviation} — {state.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="emitterCitySearch">Cidade</Label>
          <Input
            id="emitterCitySearch"
            value={citySearchText}
            placeholder="Digite ao menos 2 letras"
            disabled={!stateId}
            onChange={(event) => {
              const nextValue = event.target.value;
              if (lookupPatch.current?.cityName === nextValue) {
                setCitySearchText(nextValue);
                return;
              }
              lookupPatch.current = null;
              setCitySearchText(nextValue);
              setCityId('');
              setCityName('');
            }}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Select
          value={cityId || undefined}
          onValueChange={(value) => {
            if (!value) return;
            const city = cities.find((item) => item.id === value);
            setCityId(value);
            setCityName(city?.name ?? cityName);
            if (city?.name) setCitySearchText(city.name);
          }}
          disabled={!stateId || (citySearch.length < 2 && !cityId)}
        >
          <SelectTrigger>
            <SelectValue
              placeholder={citySearch.length < 2 ? 'Busque a cidade' : 'Selecione a cidade'}
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

      <Button type="submit" disabled={saveMutation.isPending}>
        {saveMutation.isPending ? 'Salvando...' : 'Salvar emitente'}
      </Button>
    </form>
  );
}
