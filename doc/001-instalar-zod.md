Integrar o Zod no pacote shared é a melhor estratégia para um monorepo. Você escreve o schema de validação uma única vez e ganha de forma automática:

   1. Validação em tempo de execução no Fastify (API).
   2. Tipagem estática em tempo de desenvolvimento no React (UI).

Aqui está como configurar essa integração robusta.
------------------------------
## 🛠️ Passo 1: Instalar o Zod no Monorepo
Como o Zod será compartilhado, vamos instalá-lo diretamente no pacote @erp-360/shared e uma biblioteca utilitária no Fastify para entender schemas do Zod. Rode na raiz do projeto:

# Instala o Zod no pacote shared
pnpm add zod --filter @erp-360/shared
# Instala o provedor de validação do Zod para o Fastify na API
pnpm add fastify-type-provider-zod --filter @erp-360/api

------------------------------
## 📦 Passo 2: Criar os Schemas no Pacote Compartilhado (packages/shared)
Agora vamos definir as validações dentro do pacote compartilhado. Substitua o conteúdo de packages/shared/src/index.ts:

import { z } from 'zod';
// 1. Criamos o Schema de validação usando Zodexport const UserSchema = z.object({
  id: z.string().uuid({ message: "ID precisa ser um UUID válido" }),
  name: z.string().min(3, { message: "Nome deve ter no mínimo 3 caracteres" }),
  email: z.string().email({ message: "E-mail inválido" }),
});
// 2. Extraímos a tipagem do TypeScript automaticamente a partir do Schema// Isso substitui a interface manual que tínhamos antes!export type User = z.infer<typeof UserSchema>;
export const API_URL = "http://localhost:3000";

------------------------------
## ⚙️ Passo 3: Configurar o Fastify com o Zod (apps/api)
O Fastify possui um ecossistema excelente que valida os dados da requisição (body, query, params) antes mesmo do código da rota rodar.
Atualize o seu apps/api/src/index.ts:

import Fastify from 'fastify';import cors from '@fastify/cors';import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';import { UserSchema, User, API_URL } from '@erp-360/shared';
// Inicializa o Fastify injetando o Type Provider do Zodconst fastify = Fastify({ logger: true }).withTypeProvider<ZodTypeProvider>();
// Configura os compiladores de validação e serialização do Zod
fastify.setValidatorCompiler(validatorCompiler);
fastify.setSerializerCompiler(serializerCompiler);

fastify.register(cors, { origin: '*' });
// Rota POST validando o corpo (Body) da requisição com o Schema Compartilhado
fastify.post('/user', {
  schema: {
    body: UserSchema, // Valida o input que vem do Frontend
    response: {
      201: UserSchema // Garante que a resposta da API também segue o Schema
    }
  }
}, async (request, reply) => {
  // Aqui dentro, o TS já sabe perfeitamente que request.body é do tipo User!
  const { id, name, email } = request.body;
  
  // Lógica de banco/negócio fictícia...
  
  return reply.status(201).send({ id, name, email });
});
const start = async () => {
  try {
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
    console.log(`🚀 Servidor Fastify + Zod pronto em ${API_URL}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();

------------------------------
## 💻 Passo 4: Consumir na UI com React (apps/ui)
No seu Frontend, você não precisa mudar absolutamente nada na forma de importar. O TypeScript já lê o User gerado pelo Zod automaticamente.
Exemplo de uso em apps/ui/src/App.tsx:

import { useState } from 'react';import { User, API_URL } from '@erp-360/shared';
function App() {
  // O estado do React usa a tipagem inferida pelo Zod no pacote shared
  const [usuario, setUsuario] = useState<User | null>(null);

  const criarUsuario = async () => {
    const novoUsuario: User = {
      id: "ea9b60ee-6c30-4e67-bb78-3db8ccda3da3", // UUID Válido
      name: "Ana Silva",
      email: "ana@email.com"
    };

    const response = await fetch(`${API_URL}/user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(novoUsuario)
    });

    const dados: User = await response.json();
    setUsuario(dados);
  };

  return (
    <div style={{ padding: '20px' }}>
      <h1>Frontend + Fastify + Zod Monorepo</h1>
      <button onClick={criarUsuario}>Criar Usuário via API</button>
      
      {usuario && (
        <div style={{ marginTop: '20px', border: '1px solid #ccc', padding: '10px' }}>
          <h3>Usuário Retornado pela API (Validado):</h3>
          <p><strong>ID:</strong> {usuario.id}</p>
          <p><strong>Nome:</strong> {usuario.name}</p>
          <p><strong>Email:</strong> {usuario.email}</p>
        </div>
      )}
    </div>
  );
}
export default App;

Se você tentar enviar um id que não seja um UUID, ou um name com menos de 3 caracteres, o próprio Fastify vai rejeitar a requisição automaticamente com um erro 400 Bad Request detalhando o que falhou no Zod, protegendo sua API sem que você precise digitar um único if.

