import { type MeasureType, measureTypeLabels, measureTypes } from '@erp-360/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { type Measure, type MeasureInput, measuresService } from '@/services/measures';

const selectClassName =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

function parseMeasureType(value: unknown): MeasureType | '' {
  return measureTypes.includes(value as MeasureType) ? (value as MeasureType) : '';
}

interface FormMeasureProps {
  measureToUpdate?: Measure | null;
  onSuccess?: () => void;
}

export function FormMeasure({ measureToUpdate, onSuccess }: FormMeasureProps) {
  const queryClient = useQueryClient();
  const [measureId, setMeasureId] = useState(measureToUpdate?.id);
  const [name, setName] = useState(measureToUpdate?.name ?? '');
  const [abbreviation, setAbbreviation] = useState(measureToUpdate?.abbreviation ?? '');
  const [measureType, setMeasureType] = useState<MeasureType | ''>(
    parseMeasureType(measureToUpdate?.measureType),
  );
  const [showOnProduct, setShowOnProduct] = useState(
    measureToUpdate?.showOnProduct === true,
  );
  const [showOnService, setShowOnService] = useState(
    measureToUpdate?.showOnService === true,
  );
  const [isActive, setIsActive] = useState(measureToUpdate?.isActive !== false);

  const { data: loaded } = useQuery({
    queryKey: ['measure', measureId],
    enabled: Boolean(measureId),
    staleTime: 0,
    queryFn: () => measuresService.get(measureId!),
  });

  useEffect(() => {
    if (!loaded && !measureToUpdate) return;
    const measure = { ...measureToUpdate, ...loaded };
    setName(measure.name ?? '');
    setAbbreviation(measure.abbreviation ?? '');
    setMeasureType(parseMeasureType(measure.measureType));
    setShowOnProduct(measure.showOnProduct === true);
    setShowOnService(measure.showOnService === true);
    setIsActive(measure.isActive !== false);
  }, [loaded, measureToUpdate]);

  const mutation = useMutation({
    mutationFn: (dados: MeasureInput) =>
      measureId
        ? measuresService.update(measureId, dados)
        : measuresService.create(dados),
    onSuccess: (saved) => {
      const created = !measureId;
      setMeasureId(saved.id);
      queryClient.setQueryData(['measure', saved.id], saved);
      queryClient.invalidateQueries({ queryKey: ['listaMeasures'] });
      onSuccess?.();
      toast.success(
        created ? 'Medida cadastrada com sucesso!' : 'Medida atualizada com sucesso!',
      );
    },
    onError: (error) => {
      toast.error(`Falha ao salvar: ${error.message || 'Erro inesperado'}`);
    },
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!measureType || (!showOnProduct && !showOnService)) return;
    mutation.mutate({
      name,
      abbreviation,
      measureType,
      showOnProduct,
      showOnService,
      isActive,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-2">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="measureAbbreviation">Sigla</Label>
          <Input
            id="measureAbbreviation"
            value={abbreviation}
            maxLength={6}
            onChange={(event) => setAbbreviation(event.target.value.toUpperCase())}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="measureType">Tipo</Label>
          <select
            id="measureType"
            value={measureType}
            onChange={(event) => setMeasureType(parseMeasureType(event.target.value))}
            className={selectClassName}
            required
          >
            <option value="" disabled>
              Selecione o tipo
            </option>
            {measureTypes.map((type) => (
              <option key={type} value={type}>
                {measureTypeLabels[type]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="measureName">Nome</Label>
        <Input
          id="measureName"
          value={name}
          maxLength={30}
          onChange={(event) => setName(event.target.value)}
          required
        />
      </div>

      <p className="text-sm text-zinc-500">
        A sigla vai para a NF-e e tem no máximo 6 caracteres.
      </p>

      <div className="space-y-2">
        <Label>Exibir em</Label>
        <div className="flex gap-6">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="showOnProduct"
              checked={showOnProduct}
              onCheckedChange={(value) => setShowOnProduct(!!value)}
            />
            <label htmlFor="showOnProduct" className="text-sm font-medium">
              Produto
            </label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="showOnService"
              checked={showOnService}
              onCheckedChange={(value) => setShowOnService(!!value)}
            />
            <label htmlFor="showOnService" className="text-sm font-medium">
              Serviço
            </label>
          </div>
        </div>
        {!showOnProduct && !showOnService ? (
          <p className="text-sm text-destructive">Marque produto, serviço ou os dois.</p>
        ) : null}
      </div>

      <div className="flex items-center space-x-2">
        <Checkbox
          id="measureActive"
          checked={isActive}
          onCheckedChange={(value) => setIsActive(!!value)}
        />
        <label htmlFor="measureActive" className="text-sm font-medium">
          Ativa
        </label>
      </div>

      {mutation.isError ? (
        <p className="text-sm font-medium text-destructive bg-destructive/10 p-3 rounded-md">
          {mutation.error.message}
        </p>
      ) : null}

      <div className="flex justify-end pt-2">
        <Button
          type="submit"
          disabled={mutation.isPending || (!showOnProduct && !showOnService)}
        >
          {mutation.isPending ? 'Salvando...' : measureId ? 'Atualizar' : 'Cadastrar'}
        </Button>
      </div>
    </form>
  );
}
