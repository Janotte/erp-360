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
import { FloatingInput, FloatingSelect } from '@/components/ui/FloatingField';
import { type Emitter, emitterService, type TenantCrt } from '@/services/emitter';
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
  const [mobilePhone, setMobilePhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [logo, setLogo] = useState('');
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
    setMobilePhone(displayPhone(emitter.mobilePhone));
    setWhatsapp(displayPhone(emitter.whatsapp));
    setLogo(emitter.logo ?? '');
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
    const state = (statesQuery.data ?? []).find(
      (item) => item.abbreviation === pendingUf,
    );
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

  if (!data) {
    if (isPending && !isError) {
      return <p className="text-sm text-[#64748b]">Carregando emitente...</p>;
    }
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-600">Não foi possível carregar o emitente.</p>
        <Button type="button" variant="outline" onClick={() => void refetch()}>
          Tentar de novo
        </Button>
      </div>
    );
  }

  return (
    <form
      className="max-w-3xl space-y-4 rounded-lg border bg-white p-6"
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
            mobilePhone: mobilePhone || null,
            whatsapp: whatsapp || null,
            logo: logo || null,
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
        <h3 className="text-lg font-bold text-[#172337]">Emitente</h3>
        <p className="mt-1 text-sm text-[#64748b]">
          Dados da empresa usados na emissão de NF-e, NFC-e e NFS-e.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <FloatingInput
            id="emitterCnpj"
            label="CNPJ"
            value={cnpj}
            maxLength={18}
            inputMode="numeric"
            autoComplete="off"
            error={cnpjError || undefined}
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
          <p className="text-xs text-[#64748b]">
            {lookupMutation.isPending
              ? 'Consultando CNPJ...'
              : 'Digite o CNPJ e pressione Enter para preencher os dados.'}
          </p>
        </div>
        <FloatingSelect
          id="emitterCrt"
          label="CRT"
          value={crt}
          pinned
          onChange={(event) => setCrt(event.target.value as TenantCrt)}
        >
          {crtOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </FloatingSelect>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <FloatingInput
          id="emitterName"
          label="Razão social"
          value={name}
          maxLength={60}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => setName(toTitleCasePtBr(name))}
          required
        />
        <FloatingInput
          id="emitterTradeName"
          label="Nome fantasia"
          value={tradeName}
          maxLength={60}
          onChange={(event) => setTradeName(event.target.value)}
          onBlur={() => setTradeName(toTitleCasePtBr(tradeName))}
          required
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <FloatingInput
          id="emitterIe"
          label="Inscrição estadual"
          value={stateRegistration}
          maxLength={14}
          pinned
          placeholder="ISENTO"
          onChange={(event) => setStateRegistration(event.target.value.toUpperCase())}
        />
        <FloatingInput
          id="emitterIm"
          label="Inscrição municipal"
          value={municipalRegistration}
          maxLength={15}
          onChange={(event) => setMunicipalRegistration(event.target.value)}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <FloatingInput
          id="emitterCnae"
          label="CNAE"
          value={cnae}
          maxLength={9}
          inputMode="numeric"
          onChange={(event) => setCnae(formatCnae(event.target.value))}
        />
        <FloatingInput
          id="emitterEmail"
          label="E-mail"
          type="email"
          value={email}
          maxLength={80}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>

      <FloatingInput
        id="emitterLogo"
        label="Logo"
        type="url"
        value={logo}
        maxLength={500}
        pinned
        placeholder="https://"
        onChange={(event) => setLogo(event.target.value)}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <FloatingInput
          id="emitterPhone"
          label="Telefone"
          value={phone}
          maxLength={16}
          inputMode="numeric"
          onChange={(event) => setPhone(displayPhone(event.target.value))}
        />
        <FloatingInput
          id="emitterMobilePhone"
          label="Celular"
          value={mobilePhone}
          maxLength={16}
          inputMode="numeric"
          onChange={(event) => setMobilePhone(displayPhone(event.target.value))}
        />
        <FloatingInput
          id="emitterWhatsapp"
          label="WhatsApp"
          value={whatsapp}
          maxLength={16}
          inputMode="numeric"
          onChange={(event) => setWhatsapp(displayPhone(event.target.value))}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="space-y-1">
          <FloatingInput
            id="emitterPostalCode"
            label="CEP"
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
          <p className="text-xs text-[#64748b]">
            {cepMutation.isPending ? 'Consultando CEP...' : 'Enter consulta o CEP.'}
          </p>
        </div>
        <div className="md:col-span-2">
          <FloatingInput
            id="emitterStreet"
            label="Logradouro"
            value={street}
            maxLength={60}
            onChange={(event) => setStreet(event.target.value)}
            onBlur={() => setStreet(toTitleCasePtBr(street))}
          />
        </div>
        <FloatingInput
          id="emitterNumber"
          label="Número"
          value={number}
          maxLength={60}
          onChange={(event) => setNumber(event.target.value)}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <FloatingInput
          id="emitterComplement"
          label="Complemento"
          value={complement}
          maxLength={60}
          onChange={(event) => setComplement(event.target.value)}
          onBlur={() => setComplement(toTitleCasePtBr(complement))}
        />
        <FloatingInput
          id="emitterNeighborhood"
          label="Bairro"
          value={neighborhood}
          maxLength={60}
          onChange={(event) => setNeighborhood(event.target.value)}
          onBlur={() => setNeighborhood(toTitleCasePtBr(neighborhood))}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <FloatingSelect
          id="emitterState"
          label="Estado"
          value={stateId}
          pinned={Boolean(stateId)}
          onChange={(event) => {
            const value = event.target.value;
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
          <option value="" disabled>
            Selecione
          </option>
          {(statesQuery.data ?? []).map((state) => (
            <option key={state.id} value={state.id}>
              {state.abbreviation} — {state.name}
            </option>
          ))}
        </FloatingSelect>
        <div className="space-y-1">
          <FloatingInput
            id="emitterCitySearch"
            label="Cidade"
            value={citySearchText}
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
          <p className="text-xs text-[#64748b]">Digite ao menos 2 letras.</p>
        </div>
      </div>

      <FloatingSelect
        id="emitterCity"
        label="Cidade encontrada"
        value={cityId}
        pinned={Boolean(cityId)}
        disabled={!stateId || (citySearch.length < 2 && !cityId)}
        onChange={(event) => {
          const value = event.target.value;
          if (!value) return;
          const city = cities.find((item) => item.id === value);
          setCityId(value);
          setCityName(city?.name ?? cityName);
          if (city?.name) setCitySearchText(city.name);
        }}
      >
        <option value="" disabled>
          {citySearch.length < 2 ? 'Busque a cidade' : 'Selecione a cidade'}
        </option>
        {cities.map((city) => (
          <option key={city.id} value={city.id}>
            {city.name}
          </option>
        ))}
      </FloatingSelect>

      <div className="flex justify-end">
        <Button type="submit" disabled={saveMutation.isPending}>
          {saveMutation.isPending ? 'Salvando...' : 'Salvar emitente'}
        </Button>
      </div>
    </form>
  );
}
