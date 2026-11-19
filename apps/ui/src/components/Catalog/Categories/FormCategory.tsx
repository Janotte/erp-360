import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FormEvent } from 'react';
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  FloatingInput,
  FloatingSelect,
  FloatingTextarea,
} from '@/components/ui/FloatingField';
import {
  categoriesService,
  type Category,
  type CategoryInput,
} from '@/services/categories';

interface FormCategoryProps {
  categoryToUpdate?: Category | null;
  onSuccess?: () => void;
  onCancel?: () => void;
  onDeleted?: () => void;
}

export function FormCategory({
  categoryToUpdate,
  onSuccess,
  onCancel,
  onDeleted,
}: FormCategoryProps) {
  const queryClient = useQueryClient();
  const [categoryId, setCategoryId] = useState(categoryToUpdate?.id);
  const [name, setName] = useState(categoryToUpdate?.name ?? '');
  const [description, setDescription] = useState(categoryToUpdate?.description ?? '');
  const [parentId, setParentId] = useState(categoryToUpdate?.parentId ?? '');
  const [isActive, setIsActive] = useState(categoryToUpdate?.isActive !== false);
  const [openDelete, setOpenDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [nameError, setNameError] = useState('');

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

  const deleteMutation = useMutation({
    mutationFn: () => categoriesService.delete(categoryId ?? ''),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['listaCategories'] });
      queryClient.invalidateQueries({ queryKey: ['categories', 'options'] });
      if (categoryId) queryClient.removeQueries({ queryKey: ['category', categoryId] });
      toast.success('Categoria removida com sucesso!');
      onDeleted?.();
    },
    onError: (error: Error) => {
      setDeleteError(error.message);
    },
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setNameError('Informe o nome.');
      toast.error('Informe o nome.');
      return;
    }
    setNameError('');
    mutation.mutate({
      name,
      description,
      parentId: parentId || null,
      isActive,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <FloatingInput
        id="categoryName"
        label="Nome"
        value={name}
        maxLength={80}
        required
        error={nameError}
        onChange={(event) => {
          setName(event.target.value);
          if (nameError) setNameError('');
        }}
      />

      <FloatingSelect
        id="categoryParent"
        label="Categoria pai"
        pinned
        value={parentId}
        onChange={(event) => setParentId(event.target.value)}
      >
        <option value="">Nenhuma (raiz)</option>
        {parents.map((parent) => (
          <option key={parent.id} value={parent.id}>
            {parent.path}
          </option>
        ))}
      </FloatingSelect>

      <FloatingTextarea
        id="categoryDescription"
        label="Descrição"
        value={description}
        maxLength={2000}
        onChange={(event) => setDescription(event.target.value)}
      />

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

      <div className="flex flex-wrap justify-end gap-2 pt-2">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        ) : null}
        {categoryId ? (
          <Button
            type="button"
            variant="destructive"
            disabled={mutation.isPending || deleteMutation.isPending}
            onClick={() => {
              setDeleteError(null);
              setOpenDelete(true);
            }}
          >
            Excluir
          </Button>
        ) : null}
        <Button type="submit" disabled={mutation.isPending || deleteMutation.isPending}>
          {mutation.isPending ? 'Salvando...' : categoryId ? 'Atualizar' : 'Cadastrar'}
        </Button>
      </div>

      <AlertDialog open={openDelete} onOpenChange={setOpenDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir categoria</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteError ??
                `Deseja excluir ${name || 'esta categoria'}? Essa ação não pode ser desfeita.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteMutation.isPending || !!deleteError}
              onClick={(event) => {
                event.preventDefault();
                if (categoryId) deleteMutation.mutate();
              }}
            >
              {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
