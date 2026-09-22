Para configurar um sistema de notificações flutuantes (Toasts) profissional e integrado ao seu ecossistema, utilizaremos o componente nativo do shadcn/ui. O shadcn fornece o Sonner (baseado na biblioteca extremamente performática e elegante do emilkowalski), que é o padrão atual recomendado.
Vamos instalar o componente e adicioná-lo de forma global na aplicação para dar feedbacks instantâneos em todas as ações do CRUD (criação, edição e exclusão).
------------------------------

## 🛠️ Passo 1: Instalar o Sonner na UI

Navegue até a pasta do seu frontend no terminal e adicione o componente:

```bash
cd apps/ui
pnpm dlx shadcn@latest add sonner
```

---

## 🧱 Passo 2: Adicionar o Provedor Global (apps/ui/src/main.tsx)

Para que as notificações possam flutuar sobre qualquer tela da sua aplicação, precisamos renderizar o componente <Toaster /> na raiz do React.
Abra o arquivo apps/ui/src/main.tsx e injete o Toaster:

```tsx
import React from 'react'import ReactDOM from 'react-dom/client'import { QueryClient, QueryClientProvider } from '@tanstack/react-query'import { Toaster } from '@/components/ui/sonner' // 🆕 Importa o Toaster do shadcnimport App from './App.tsx'import './index.css'
const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster position="top-right" richColors /> {/* 🆕 Ativa notificações coloridas no topo direito */}
    </QueryClientProvider>
  </React.StrictMode>,
)
```

---

## 🚀 Passo 3: Disparar Toasts no Formulário (FormPessoa.tsx)

Agora, vamos utilizar a função toast para emitir alertas de sucesso ou erro de forma elegante quando o usuário salvar ou atualizar um registro.
Abra o seu arquivo apps/ui/src/components/Pessoas/FormPessoa.tsx e modifique-o:

```tsx
// 1. Adicione a importação do toast no topo do arquivoimport { toast } from 'sonner';
// ... (Mantenha o restante dos estados do formulário)
export function FormPessoa({ pessoaParaEditar, onSuccess }: FormPessoaProps) {
  const queryClient = useQueryClient();

  // 2. Atualize o hook useMutation adicionando os callbacks de feedback
  const mutation = useMutation({
    mutationFn: (dados: Omit<Pessoa, 'id'>) => {
      return pessoaParaEditar
        ? pessoasService.atualizar(pessoaParaEditar.id, dados)
        : pessoasService.criar(dados);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['listaPessoas'] });

      // 🌟 Dispara a notificação flutuante de sucesso
      toast.success(
        pessoaParaEditar
          ? 'Cadastro atualizado com sucesso!'
          : 'Nova pessoa cadastrada com sucesso!',
      );

      onSuccess();
    },
    onError: (error: any) => {
      // 🌟 Dispara a notificação de erro caso o servidor rejeite
      toast.error(`Falha ao salvar: ${error.message || 'Erro inesperado'}`);
    },
  });

  // ... (Mantenha a função handleSubmit e o retorno do JSX)
}
```

---

## 🗑️ Passo 4: Disparar Toasts na Exclusão (ListaPessoas.tsx)

Também precisamos notificar o usuário quando a exclusão for efetuada com sucesso ou quando ela for bloqueada por conter vínculos ativos no banco de dados.
Abra o seu arquivo apps/ui/src/components/Pessoas/ListaPessoas.tsx e adicione o feedback:

```tsx
// 1. Adicione a importação do toast no topoimport { toast } from 'sonner';
export function ListaPessoas() {
  const queryClient = useQueryClient();
  // ... (Mantenha os outros estados)

  // 2. Atualize a mutation de deleção
  const deleteMutation = useMutation({
    mutationFn: pessoasService.excluir,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['listaPessoas'] });
      setOpenAlert(false);

      // 🌟 Feedback de exclusão realizada
      toast.success('O registro foi removido permanentemente.');
    },
    onError: (error: any) => {
      setOpenAlert(false); // Fecha o modal de confirmação para não prender a tela

      // 🌟 Alerta crítico na tela explicando o bloqueio por vínculos (Multi-Tenant/ERP)
      toast.error('Não é possível excluir!', {
        description:
          error.message ||
          'Esta pessoa possui documentos ou movimentações financeiras ativas vinculadas.',
        duration: 5000, // Fica visível por 5 segundos para leitura clara
      });
    },
  });

  // ... (Mantenha o restante da renderização da tabela)
}
```

---

## 🎨 O que você ganhou com isso?

O seu sistema de feedback agora está padronizado. As mensagens aparecem de forma fluida no canto da tela com cores semânticas (verde para sucesso, vermelho para erro) e não bloqueiam o fluxo de trabalho do usuário, elevando drasticamente a experiência de uso do ERP.
O sistema de notificações flutuantes está totalmente funcional.
