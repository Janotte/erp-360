import {
  type CatalogItemType,
  catalogItemTypeLabels,
  catalogItemTypes,
  type FiscalItemType,
  fiscalItemTypeLabels,
  fiscalItemTypes,
  formatRawDate,
  productFiscalItemTypes,
  syncPricing,
} from '@erp-360/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { CatalogSearchSelect } from '@/components/ui/CatalogSearchSelect';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { categoriesService } from '@/services/categories';
import { type CatalogItem, type CatalogItemInput, itemsService } from '@/services/items';
import { measuresService } from '@/services/measures';

const selectClassName =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

function focusNextItemField(form: HTMLFormElement, current: HTMLElement) {
  const fields = Array.from(form.querySelectorAll<HTMLElement>('[data-item-field]')).filter(
    (field) => !field.hasAttribute('disabled'),
  );
  const index = fields.findIndex((field) => field === current || field.contains(current));
  if (index < 0) return;
  fields[index + 1]?.focus();
}

function maskListPrice(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 15);
  if (!digits) return '';
  const padded = digits.padStart(5, '0');
  const fraction = padded.slice(-4);
  const integers = padded.slice(0, -4).replace(/^0+(?=\d)/, '') || '0';
  const grouped = integers.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${grouped},${fraction}`;
}

function formatListPrice(value: string | null | undefined) {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return '';
  const normalized = trimmed.includes(',')
    ? trimmed.replace(/\./g, '').replace(',', '.')
    : trimmed;
  const [integers, fraction = ''] = normalized.split('.');
  const intDigits = integers.replace(/\D/g, '').replace(/^0+(?=\d)/, '') || '0';
  const fractionDigits = fraction.replace(/\D/g, '').padEnd(4, '0').slice(0, 4);
  return maskListPrice(`${intDigits}${fractionDigits}`);
}

function listPriceForApi(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.replace(/\./g, '').replace(',', '.');
}

function maskPercent(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 6);
  if (!digits) return '';
  const padded = digits.padStart(3, '0');
  const fraction = padded.slice(-2);
  const integers = padded.slice(0, -2).replace(/^0+(?=\d)/, '') || '0';
  return `${integers},${fraction}`;
}

function formatPercent(value: string | null | undefined) {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return '';
  const number = Number(trimmed);
  if (!Number.isFinite(number)) return '';
  return maskPercent(String(Math.round(number * 100)));
}

function formatMoney4(value: string | null | undefined) {
  if (!value) return '—';
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return number.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

function parseItemType(value: string): CatalogItemType {
  return value === 'service' ? 'service' : 'product';
}

function parseFiscalType(value: string): FiscalItemType {
  return fiscalItemTypes.includes(value as FiscalItemType)
    ? (value as FiscalItemType)
    : 'resale';
}

export interface CatalogItemSeed {
  name?: string;
  description?: string;
  barcode?: string;
  ncmCode?: string;
  cestCode?: string;
}

interface FormItemProps {
  itemToUpdate?: CatalogItem | null;
  seed?: CatalogItemSeed | null;
  onSuccess?: (item: CatalogItem) => void;
}

export function FormItem({ itemToUpdate, seed, onSuccess }: FormItemProps) {
  const queryClient = useQueryClient();
  const [itemId, setItemId] = useState(itemToUpdate?.id);
  const [code, setCode] = useState(itemToUpdate?.code ?? '');
  const [sku, setSku] = useState(itemToUpdate?.sku ?? '');
  const [name, setName] = useState(
    (itemToUpdate?.name ?? seed?.name ?? '').toLocaleUpperCase('pt-BR'),
  );
  const [type, setType] = useState<CatalogItemType>(itemToUpdate?.type ?? 'product');
  const [fiscalItemType, setFiscalItemType] = useState<FiscalItemType>(
    itemToUpdate?.fiscalItemType ?? 'resale',
  );
  const [tracksStock, setTracksStock] = useState(itemToUpdate?.tracksStock !== false);
  const [categoryId, setCategoryId] = useState(itemToUpdate?.categoryId ?? '');
  const [measureId, setMeasureId] = useState(itemToUpdate?.measureId ?? '');
  const [description, setDescription] = useState(
    (itemToUpdate?.description ?? seed?.description ?? '').toLocaleUpperCase('pt-BR'),
  );
  const [barcode, setBarcode] = useState(itemToUpdate?.barcode ?? seed?.barcode ?? '');
  const [listPrice, setListPrice] = useState(formatListPrice(itemToUpdate?.listPrice));
  const [grossMargin, setGrossMargin] = useState(formatPercent(itemToUpdate?.grossMargin));
  const [listPriceError, setListPriceError] = useState('');
  const [ncmCode, setNcmCode] = useState(itemToUpdate?.ncmCode ?? seed?.ncmCode ?? '');
  const [ncmDescription, setNcmDescription] = useState(
    itemToUpdate?.ncmDescription ?? '',
  );
  const [ncmOpen, setNcmOpen] = useState(false);
  const [cestCode, setCestCode] = useState(itemToUpdate?.cestCode ?? seed?.cestCode ?? '');
  const [netWeightKg, setNetWeightKg] = useState(itemToUpdate?.netWeightKg ?? '');
  const [grossWeightKg, setGrossWeightKg] = useState(itemToUpdate?.grossWeightKg ?? '');
  const [lengthCm, setLengthCm] = useState(itemToUpdate?.lengthCm ?? '');
  const [widthCm, setWidthCm] = useState(itemToUpdate?.widthCm ?? '');
  const [heightCm, setHeightCm] = useState(itemToUpdate?.heightCm ?? '');
  const [isActive, setIsActive] = useState(itemToUpdate?.isActive !== false);
  const [ncmSearch, setNcmSearch] = useState('');

  const { data: loaded } = useQuery({
    queryKey: ['item', itemId],
    enabled: Boolean(itemId),
    staleTime: 0,
    queryFn: () => itemsService.get(itemId!),
  });

  const categoriesQuery = useQuery({
    queryKey: ['categories', 'options', null],
    queryFn: () => categoriesService.options(),
  });
  const categories = categoriesQuery.data ?? [];
  const categoryOptions = useMemo(
    () => categories.map((category) => ({ id: category.id, label: category.path })),
    [categories],
  );

  const { data: measureOptions = [], isLoading: measuresLoading } = useQuery({
    queryKey: ['measures', 'options', type],
    queryFn: () => measuresService.options(type),
  });

  const { data: ncmOptions = [] } = useQuery({
    queryKey: ['ncms', ncmSearch],
    enabled: ncmSearch.trim().length >= 2,
    queryFn: () => itemsService.searchNcms(ncmSearch.trim()),
  });

  useEffect(() => {
    const timer = setTimeout(() => setNcmSearch(ncmCode), 300);
    return () => clearTimeout(timer);
  }, [ncmCode]);

  useEffect(() => {
    if (!loaded && !itemToUpdate) return;
    const item = { ...itemToUpdate, ...loaded };
    setCode(item.code ?? '');
    setSku(item.sku ?? '');
    setName((item.name ?? '').toLocaleUpperCase('pt-BR'));
    setType(item.type === 'service' ? 'service' : 'product');
    setFiscalItemType(parseFiscalType(item.fiscalItemType ?? 'resale'));
    setTracksStock(item.tracksStock !== false);
    setCategoryId(item.categoryId ?? '');
    setMeasureId(item.measureId ?? '');
    setDescription((item.description ?? '').toLocaleUpperCase('pt-BR'));
    setBarcode(item.barcode ?? '');
    setListPrice(formatListPrice(item.listPrice));
    setGrossMargin(formatPercent(item.grossMargin));
    setListPriceError('');
    setNcmCode(item.ncmCode ?? '');
    setNcmDescription(item.ncmDescription ?? '');
    setCestCode(item.cestCode ?? '');
    setNetWeightKg(item.netWeightKg ?? '');
    setGrossWeightKg(item.grossWeightKg ?? '');
    setLengthCm(item.lengthCm ?? '');
    setWidthCm(item.widthCm ?? '');
    setHeightCm(item.heightCm ?? '');
    setIsActive(item.isActive !== false);
  }, [loaded, itemToUpdate]);

  const measureChoices = (() => {
    const choices = measureOptions.map((measure) => ({
      id: measure.id,
      name: measure.name,
      abbreviation: measure.abbreviation,
    }));
    if (choices.some((measure) => measure.id === measureId) || !loaded) return choices;
    if (loaded.measureId !== measureId || loaded.type !== type) return choices;
    return [
      {
        id: loaded.measureId,
        name: loaded.measureName,
        abbreviation: loaded.measureAbbreviation,
      },
      ...choices,
    ];
  })();

  const stockLocked = type === 'service' || fiscalItemType === 'fixed_asset';
  const fiscalChoices =
    type === 'service' ? (['service'] as const) : productFiscalItemTypes;

  const mutation = useMutation({
    mutationFn: (dados: CatalogItemInput) =>
      itemId ? itemsService.update(itemId, dados) : itemsService.create(dados),
    onSuccess: (saved) => {
      const created = !itemId;
      setItemId(saved.id);
      queryClient.setQueryData(['item', saved.id], saved);
      queryClient.invalidateQueries({ queryKey: ['listaItems'] });
      onSuccess?.(saved);
      toast.success(
        created ? 'Item cadastrado com sucesso!' : 'Item atualizado com sucesso!',
      );
    },
    onError: (error) => {
      toast.error(`Falha ao salvar: ${error.message || 'Erro inesperado'}`);
    },
  });

  const changeType = (next: CatalogItemType) => {
    setType(next);
    if (next === 'service') {
      setFiscalItemType('service');
      setTracksStock(false);
      return;
    }
    setFiscalItemType((current) => (current === 'service' ? 'resale' : current));
  };

  const changeFiscal = (next: FiscalItemType) => {
    setFiscalItemType(next);
    if (next === 'fixed_asset') setTracksStock(false);
  };

  const averageCost = (() => {
    const value = Number(itemToUpdate?.averageCost ?? 0);
    return Number.isFinite(value) ? value : 0;
  })();

  const changeListPrice = (typed: string) => {
    const masked = maskListPrice(typed);
    const priceText = listPriceForApi(masked);
    const marginText = listPriceForApi(grossMargin);
    const synced = syncPricing({
      average: averageCost,
      marginPercent: marginText ? Number(marginText) : null,
      price: priceText ? Number(priceText) : null,
      edited: 'price',
      emptyPriceWithoutCost: false,
    });
    setListPrice(masked);
    if (synced.marginPercent === null) {
      if (!masked) {
        setGrossMargin('');
        setListPriceError('');
      } else if (averageCost > 0) {
        setListPriceError('Preço de lista menor que o custo médio.');
      } else {
        setListPriceError('');
      }
      return;
    }
    setGrossMargin(formatPercent(synced.marginPercent.toFixed(4)));
    setListPriceError('');
  };

  const changeGrossMargin = (typed: string) => {
    const masked = maskPercent(typed);
    const priceText = listPriceForApi(listPrice);
    const marginText = listPriceForApi(masked);
    const synced = syncPricing({
      average: averageCost,
      marginPercent: marginText ? Number(marginText) : null,
      price: priceText ? Number(priceText) : null,
      edited: 'margin',
      emptyPriceWithoutCost: false,
    });
    setGrossMargin(masked);
    if (!(averageCost > 0)) return;
    if (synced.price !== null) {
      setListPrice(formatListPrice(synced.price.toFixed(4)));
      setListPriceError('');
    } else if (!masked) {
      setListPrice('');
      setListPriceError('');
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!measureId || listPriceError) return;
    mutation.mutate({
      sku,
      name,
      type,
      fiscalItemType,
      tracksStock: stockLocked ? false : tracksStock,
      categoryId: categoryId || null,
      measureId,
      description,
      barcode,
      listPrice: listPriceForApi(listPrice),
      grossMargin: listPriceForApi(grossMargin),
      ncmCode,
      cestCode,
      netWeightKg,
      grossWeightKg,
      lengthCm,
      widthCm,
      heightCm,
      isActive,
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 pt-2"
      onKeyDown={(event) => {
        if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        if (target instanceof HTMLTextAreaElement && event.shiftKey) return;
        if (target instanceof HTMLButtonElement && target.type === 'submit') return;
        if (!target.closest('[data-item-field]')) return;
        event.preventDefault();
        focusNextItemField(event.currentTarget, target);
      }}
    >
      <p className="text-sm text-zinc-500">
        Campos com <span className="text-destructive">*</span> são obrigatórios.
      </p>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="itemCode">Código</Label>
          <Input
            id="itemCode"
            value={code}
            readOnly
            disabled
            placeholder="Gerado ao salvar"
          />
          <p className="text-sm text-zinc-500">Segue de 000001 até 999999.</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="itemSku">SKU</Label>
          <Input
            id="itemSku"
            data-item-field
            autoFocus
            value={sku}
            maxLength={60}
            onChange={(event) => setSku(event.target.value)}
            placeholder="Código livre da empresa"
          />
          <p className="text-sm text-zinc-500">Opcional. A empresa define o formato.</p>
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="itemName">
          Nome <span className="text-destructive">*</span>
        </Label>
        <Input
          id="itemName"
          data-item-field
          value={name}
          maxLength={120}
          className="uppercase"
          onChange={(event) => setName(event.target.value.toLocaleUpperCase('pt-BR'))}
          required
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="itemType">Tipo</Label>
          <select
            id="itemType"
            data-item-field
            value={type}
            onChange={(event) => changeType(parseItemType(event.target.value))}
            className={selectClassName}
          >
            {catalogItemTypes.map((itemType) => (
              <option key={itemType} value={itemType}>
                {catalogItemTypeLabels[itemType]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="itemFiscalType">Tipo fiscal</Label>
          <select
            id="itemFiscalType"
            data-item-field
            value={fiscalItemType}
            onChange={(event) => changeFiscal(parseFiscalType(event.target.value))}
            className={selectClassName}
            disabled={type === 'service'}
          >
            {fiscalChoices.map((fiscalType) => (
              <option key={fiscalType} value={fiscalType}>
                {fiscalItemTypeLabels[fiscalType]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1" data-item-field>
          <Label htmlFor="itemCategory">Categoria</Label>
          <CatalogSearchSelect
            id="itemCategory"
            value={categoryId}
            onChange={setCategoryId}
            options={categoryOptions}
            placeholder="Buscar categoria..."
            emptyMessage="Nenhuma categoria cadastrada."
            allowClear
            isLoading={categoriesQuery.isLoading}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="itemMeasure">
            Medida <span className="text-destructive">*</span>
          </Label>
          <select
            id="itemMeasure"
            data-item-field
            value={
              measureChoices.some((measure) => measure.id === measureId) ? measureId : ''
            }
            onChange={(event) => setMeasureId(event.target.value)}
            className={selectClassName}
            required
          >
            <option value="" disabled>
              Selecione a medida
            </option>
            {measureChoices.map((measure) => (
              <option key={measure.id} value={measure.id}>
                {measure.abbreviation} - {measure.name}
              </option>
            ))}
          </select>
          {!measuresLoading && measureOptions.length === 0 ? (
            <p className="text-sm text-zinc-500">
              Cadastre uma medida marcada para {catalogItemTypeLabels[type].toLowerCase()}
              .
            </p>
          ) : null}
        </div>
        <div className="space-y-1">
          <Label htmlFor="itemPrice">Preço de tabela</Label>
          <Input
            id="itemPrice"
            data-item-field
            value={listPrice}
            inputMode="decimal"
            placeholder="0,0000"
            onChange={(event) => changeListPrice(event.target.value)}
          />
          {listPriceError ? (
            <p className="text-sm text-destructive">{listPriceError}</p>
          ) : null}
        </div>
        <div className="space-y-1">
          <Label htmlFor="itemMargin">Margem bruta (%)</Label>
          <Input
            id="itemMargin"
            data-item-field
            value={grossMargin}
            inputMode="decimal"
            placeholder="0,00"
            onChange={(event) => changeGrossMargin(event.target.value)}
          />
          <p className="text-sm text-zinc-500">
            Havendo custo médio, o preço de lista é esse custo dividido por um menos a margem.
          </p>
        </div>
        <div className="space-y-1">
          <Label>Custo médio</Label>
          <p className="text-sm text-zinc-700">{formatMoney4(itemToUpdate?.averageCost)}</p>
        </div>
        <div className="space-y-1">
          <Label>Última entrada</Label>
          <p className="text-sm text-zinc-700">
            {itemToUpdate?.lastInboundOn
              ? formatRawDate(itemToUpdate.lastInboundOn)
              : 'Ainda não houve entrada confirmada.'}
          </p>
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="itemDescription">Descrição</Label>
        <textarea
          id="itemDescription"
          data-item-field
          value={description}
          maxLength={2000}
          rows={2}
          onChange={(event) =>
            setDescription(event.target.value.toLocaleUpperCase('pt-BR'))
          }
          className="flex min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="itemBarcode">Código de barras</Label>
          <Input
            id="itemBarcode"
            data-item-field
            value={barcode}
            inputMode="numeric"
            maxLength={14}
            onChange={(event) => setBarcode(event.target.value.replace(/\D/g, ''))}
          />
        </div>
        <div className="relative space-y-1">
          <Label htmlFor="itemNcm">NCM</Label>
          <Input
            id="itemNcm"
            data-item-field
            value={ncmCode}
            maxLength={10}
            placeholder="0000.00.00"
            onChange={(event) => {
              setNcmCode(event.target.value);
              setNcmDescription('');
              setNcmOpen(true);
            }}
            onFocus={() => setNcmOpen(true)}
            onBlur={() => setTimeout(() => setNcmOpen(false), 150)}
          />
          {ncmOpen && ncmOptions.length > 0 ? (
            <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-zinc-200 bg-white shadow-md">
              {ncmOptions.map((ncm) => (
                <li key={ncm.code}>
                  <button
                    type="button"
                    tabIndex={-1}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-zinc-50"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setNcmCode(ncm.code);
                      setNcmDescription(ncm.description);
                      setNcmOpen(false);
                    }}
                  >
                    <span className="font-medium">{ncm.code}</span>
                    <span className="mt-0.5 block truncate text-zinc-500">
                      {ncm.description}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {ncmDescription ? (
            <p className="line-clamp-2 text-sm text-zinc-500">{ncmDescription}</p>
          ) : null}
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="itemCest">CEST</Label>
        <Input
          id="itemCest"
          data-item-field
          value={cestCode}
          inputMode="numeric"
          maxLength={7}
          onChange={(event) => setCestCode(event.target.value.replace(/\D/g, ''))}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="itemNetWeight">Peso líquido (kg)</Label>
          <Input
            id="itemNetWeight"
            data-item-field
            value={netWeightKg}
            inputMode="decimal"
            onChange={(event) => setNetWeightKg(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="itemGrossWeight">Peso bruto (kg)</Label>
          <Input
            id="itemGrossWeight"
            data-item-field
            value={grossWeightKg}
            inputMode="decimal"
            onChange={(event) => setGrossWeightKg(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="itemLength">Comprimento (cm)</Label>
          <Input
            id="itemLength"
            data-item-field
            value={lengthCm}
            inputMode="decimal"
            onChange={(event) => setLengthCm(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="itemWidth">Largura (cm)</Label>
          <Input
            id="itemWidth"
            data-item-field
            value={widthCm}
            inputMode="decimal"
            onChange={(event) => setWidthCm(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="itemHeight">Altura (cm)</Label>
          <Input
            id="itemHeight"
            data-item-field
            value={heightCm}
            inputMode="decimal"
            onChange={(event) => setHeightCm(event.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-6">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="itemStock"
            data-item-field
            checked={stockLocked ? false : tracksStock}
            disabled={stockLocked}
            onCheckedChange={(value) => setTracksStock(!!value)}
          />
          <label htmlFor="itemStock" className="text-sm font-medium">
            Controla estoque
          </label>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox
            id="itemActive"
            data-item-field
            checked={isActive}
            onCheckedChange={(value) => setIsActive(!!value)}
          />
          <label htmlFor="itemActive" className="text-sm font-medium">
            Ativo
          </label>
        </div>
      </div>
      {stockLocked ? (
        <p className="text-sm text-zinc-500">
          Serviço e ativo imobilizado não controlam estoque.
        </p>
      ) : null}

      {mutation.isError ? (
        <p className="text-sm font-medium text-destructive bg-destructive/10 p-3 rounded-md">
          {mutation.error.message}
        </p>
      ) : null}

      <div className="flex justify-end pt-2">
        <Button type="submit" data-item-field disabled={mutation.isPending || !measureId || Boolean(listPriceError)}>
          {mutation.isPending ? 'Salvando...' : itemId ? 'Atualizar' : 'Cadastrar'}
        </Button>
      </div>
    </form>
  );
}
