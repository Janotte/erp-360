import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  categoriesService,
  type Category,
  type CategoryInput,
} from '@/services/categories';

const selectClassName =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

interface FormCategoryProps {
  categoryToUpdate?: Category | null;
  onSuccess?: () => void;
}

export function FormCategory({ categoryToUpdate, onSuccess }: FormCategoryProps) {
  const queryClient = useQueryClient();
  const [categoryId, setCategoryId] = useState(categoryToUpdate?.id);
  const [name, setName] = useState(categoryToUpdate?.name ?? '');
  const [description, setDescription] = useState(categoryToUpdate?.description ?? '');
  const [parentId, setParentId] = useState(categoryToUpdate?.parentId ?? '');
  const [isActive, setIsActive] = useState(categoryToUpdate?.isActive !== false);

  const { data: loaded } = useQuery({
    queryKey: ['category', categoryId],
    enabled: Boolean(categoryId),
    staleTime: 0,
    queryFn: () => categoriesService.get(categoryId!),
  });

  const { data: parents = [] } = useQuery({
    queryKey: ['categories', 'options', categoryId ?? null],
    queryFn: () => categoriesService.options(categoryId),
  });

  useEffect(() => {
    if (!loaded && !categoryToUpdate) return;
    const category = { ...categoryToUpdate, ...loaded };
    setName(category.name ?? '');
    setDescription(category.description ?? '');
    setParentId(category.parentId ?? '');
    setIsActive(category.isActive !== false);
  }, [loaded, categoryToUpdate]);

  const mutation = useMutation({
    mutationFn: (dados: CategoryInput) =>
      categoryId
        ? categoriesService.update(categoryId, dados)
        : categoriesService.create(dados),
    onSuccess: (saved) => {
      const created = !categoryId;
      setCategoryId(saved.id);
      queryClient.setQueryData(['category', saved.id], saved);
      queryClient.invalidateQueries({ queryKey: ['listaCategories'] });
      queryClient.invalidateQueries({ queryKey: ['categories', 'options'] });
      onSuccess?.();
      toast.success(
        created
          ? 'Categoria cadastrada com sucesso!'
          : 'Categoria atualizada com sucesso!',
      );
    },
    onError: (error) => {
      toast.error(`Falha ao salvar: ${error.message || 'Erro inesperado'}`);
    },
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate({
      name,
      description,
      parentId: parentId || null,
      isActive,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-2">
      <div className="space-y-1">
        <Label htmlFor="categoryName">Nome</Label>
        <Input
          id="categoryName"
          value={name}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
          required
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="categoryParent">Categoria pai</Label>
        <select
          id="categoryParent"
          value={parentId}
          onChange={(event) => setParentId(event.target.value)}
          className={selectClassName}
        >
          <option value="">Nenhuma (raiz)</option>
          {parents.map((parent) => (
            <option key={parent.id} value={parent.id}>
              {parent.path}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <Label htmlFor="categoryDescription">Descrição</Label>
        <textarea
          id="categoryDescription"
          value={description}
          maxLength={2000}
          rows={3}
          onChange={(event) => setDescription(event.target.value)}
          className="flex min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      <div className="flex items-center space-x-2">
        <Checkbox
          id="categoryActive"
          checked={isActive}
          onCheckedChange={(value) => setIsActive(!!value)}
        />
        <label htmlFor="categoryActive" className="text-sm font-medium">
          Ativa
        </label>
      </div>

      {mutation.isError ? (
        <p className="text-sm font-medium text-destructive bg-destructive/10 p-3 rounded-md">
          {mutation.error.message}
        </p>
      ) : null}

      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Salvando...' : categoryId ? 'Atualizar' : 'Cadastrar'}
        </Button>
      </div>
    </form>
  );
}
