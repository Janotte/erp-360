Para automatizar o processo de inicialização e garantir que o banco esteja ligado e atualizado assim que você rodar o ambiente de desenvolvimento, podemos ajustar a orquestração de tarefas no Turborepo e configurar scripts na raiz do projeto.
Como o Docker pode levar alguns segundos para subir totalmente e aceitar conexões, a melhor prática é usar uma ferramenta leve chamada wait-on para garantir que o PostgreSQL esteja pronto antes de disparar as migrações do Drizzle.
------------------------------

## 🛠️ Passo 1: Instalar Utilitários na Raiz

Vamos instalar o wait-on e o npm-run-all (para rodar scripts sequenciais ou paralelos facilmente) na raiz do erp-360. Rode no seu terminal:

pnpm add -wD wait-on npm-run-all

---

## ⚙️ Passo 2: Criar o Script de Inicialização da API

Antes do Turbo iniciar o servidor Fastify em modo de desenvolvimento, precisamos que ele prepare o banco. Vamos criar uma tarefa dedicada a isso no apps/api/package.json.
Abra o apps/api/package.json e altere a seção de scripts:

"scripts": {
"dev": "ts-node src/index.ts",
"build": "tsc",
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate",
"db:setup": "wait-on tcp:localhost:5432 && pnpm db:migrate"
}

(O comando db:setup vai esperar a porta 5432 responder e, logo em seguida, aplicará as migrações automaticamente).
------------------------------

## 🗺️ Passo 3: Configurar a Dependência de Tarefas no Turborepo

Agora vamos dizer ao Turborepo que a tarefa dev da API depende que o db:setup termine primeiro.
Atualize o seu arquivo turbo.json na raiz do projeto:

{
"$schema": "https://turbo.build",
"tasks": {
"build": {
"dependsOn": ["^build"],
"outputs": ["dist/**", ".vite/**"]
},
"db:setup": {
"cache": false
},
"dev": {
"dependsOn": ["^db:setup"],
"cache": false,
"persistent": true
},
"lint": { "cache": true },
"format": { "cache": true }
}
}

(A linha "dependsOn": ["^db:setup"] garante que o Turbo execute as migrações do Drizzle antes de ligar os servidores).
------------------------------

## 🏁 Passo 4: Unificar Tudo no Comando Principal da Raiz

Por fim, vamos alterar o comando pnpm dev na raiz para que ele primeiro suba o container do Docker (em segundo plano) e depois execute o Turborepo.
Abra o package.json da raiz do erp-360 e atualize os scripts:

{
"scripts": {
"docker:up": "docker compose up -d",
"predev": "pnpm docker:up",
"dev": "turbo dev",
"build": "turbo build",
"lint": "turbo lint",
"lint:fix": "turbo lint -- --fix",
"format": "turbo format",
"format:fix": "prettier --write ."
}
}

(O npm/pnpm executa automaticamente qualquer script começado com pre antes do script principal. Portanto, ao digitar pnpm dev, o comando pnpm docker:up roda primeiro).
------------------------------

## 🚀 O Novo Fluxo de Inicialização

Agora, quando você digitar apenas:

pnpm dev

O ciclo de vida automatizado fará o seguinte:

1.  predev: Inicializa o container do PostgreSQL no Docker em segundo plano (docker compose up -d). Se já estiver rodando, ele apenas ignora.
2.  turbo dev: Inicia o ecossistema.
3.  db:setup: O Turbo segura a inicialização da API enquanto o wait-on monitora a porta 5432. Assim que o banco aceita conexões, o drizzle-kit migrate é disparado.
4.  dev (API + UI): Com as tabelas do banco prontas e atualizadas, o Fastify e o Vite são liberados em paralelo no terminal.
