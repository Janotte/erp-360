Configurar o monorepo com pnpm e Turborepo eleva o projeto para o nível de produção, trazendo cache inteligente de builds e execução em paralelo de forma muito mais rápida.
Aqui está o guia atualizado para transformar ou criar essa estrutura do zero usando pnpm Workspaces e Turborepo:
------------------------------

## 📂 Estrutura de Pastas Final

erp-360/
├── apps/ # Aplicações executáveis
│ ├── api/ # API (Node.js + TS)
│ └── ui/ # Frontend (Vite + React + TS)
├── packages/ # Pacotes/Módulos compartilhados
│ └── shared/ # Tipos e utilitários compartilhados
├── package.json # Raiz
├── pnpm-workspace.yaml # Configuração de workspaces do pnpm
└── turbo.json # Configuração do Turborepo

---

## 🛠️ Passo 1: Inicializar a Raiz com pnpm e Turbo

1.  Crie a pasta do projeto e inicialize-o:

mkdir erp-360 && cd erp-360
pnpm init

2.  Crie o arquivo pnpm-workspace.yaml na raiz para definir onde ficam seus pacotes:

packages: - "apps/_" - "packages/_"

3.  Instale o Turborepo e o TypeScript como dependências de desenvolvimento na raiz:

pnpm add -wD turbo typescript @types/node

4.  Crie o arquivo de configuração do Turbo (turbo.json) na raiz:

{
"$schema": "https://turbo.build",
"tasks": {
"build": {
"dependsOn": ["^build"],
"outputs": ["dist/**", ".vite/**"]
},
"dev": {
"cache": false,
"persistent": true
}
}
}

5.  Atualize os scripts do package.json da raiz para usar o Turbo:

{
"name": "erp-360",
"private": true,
"scripts": {
"dev": "turbo dev",
"build": "turbo build",
"clean": "turbo clean"
}
}

---

## 📦 Passo 2: Criar o Pacote Compartilhado (packages/shared)

1.  Crie as pastas:

mkdir -p packages/shared/src

2.  Crie o packages/shared/package.json:

{
"name": "@erp-360/shared",
"version": "1.0.0",
"private": true,
"main": "./src/index.ts",
"types": "./src/index.ts"
}

3.  Adicione as exportações em packages/shared/src/index.ts:

export interface User {
id: string;
name: string;
email: string;
}
export const API_URL = "http://localhost:3000";

---

## 💻 Passo 3: Criar o Frontend com Vite (apps/ui)

1.  Crie o app Vite na pasta correta:

mkdir -p apps && cd apps
pnpm create vite ui --template react-ts
cd ..

2.  Para vincular o pacote compartilhado no seu frontend usando a sintaxe de workspace do pnpm, execute o seguinte comando na raiz do projeto:

pnpm add @erp-360/shared --filter @erp-360/ui --workspace

(Isso adicionará "@erp-360/shared": "workspace:*" no package.json da UI automaticamente). 3. Use as tipagens do shared no seu arquivo apps/ui/src/App.tsx:

import { User, API_URL } from '@erp-360/shared';
function App() {
const user: User = { id: '1', name: 'Dev Turbo', email: 'turbo@teste.com' };

     return (
       <div>
         <h1>Frontend com pnpm e Turbo</h1>
         <p>URL: {API_URL}</p>
         <p>Usuário: {user.name}</p>
       </div>
     );

}
export default App;

---

## ⚙️ Passo 4: Criar a API (apps/api)

1.  Crie a pasta da API:

mkdir -p apps/api/src

2.  Crie o arquivo apps/api/package.json:

{
"name": "@erp-360/api",
"version": "1.0.0",
"private": true,
"main": "dist/index.js",
"scripts": {
"dev": "ts-node src/index.ts",
"build": "tsc"
}
}

3.  Instale as dependências da API e vincule o shared:

pnpm add fastify @fastify/cors --filter @erp-360/api

4.   Crie o arquivo apps/api/src/index.ts:

    import Fastify from 'fastify';

    import cors from '@fastify/cors';
    import { User, API_URL } from '@erp-360/shared';

    // Inicializa o Fastify com logs ativados no ambiente de desenvolvimento
    const fastify = Fastify({
        logger: true
    });

    // Registra o plugin de CORS
    fastify.register(cors, {
        origin: '*' // Em produção, mude para a URL do seu Frontend
    });

    // Declara a rota usando a tipagem do pacote compartilhado
    fastify.get('/user', async (request, reply) => {
        const user: User = {
            id: '777',
            name: 'Lucas do Fastify',
            email: 'lucas@fastify.com'
        };

        return user; // O Fastify serializa objetos para JSON automaticamente
    });

    // Inicia o servidor
    const start = async () => {
        try {
            // O Fastify escuta na porta 3000
            await fastify.listen({ port: 3000, host: '0.0.0.0' });
            console.log(`🚀 Servidor Fastify pronto em ${API_URL}`);
        } catch (err) {
            fastify.log.error(err);
            process.exit(1);
        }
    };

    start();

---

## 🚀 Como Rodar Tudo em um só Comando

Graças ao Turborepo, você não precisa mais abrir vários terminais. Execute na raiz do projeto:

pnpm dev

O Turbo vai identificar o script dev dentro de apps/ui e apps/api, iniciando os dois servidores em paralelo no mesmo terminal, separando os logs por cores.
Para buildar todos os projetos respeitando a ordem de dependências:

pnpm build
