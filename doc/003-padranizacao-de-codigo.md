Para padronizar o código em um monorepo, a abordagem moderna e eficiente recomendada pelo Turborepo é criar uma pasta dentro de packages/ dedicada a configurações compartilhadas. Com a chegada do ESLint v9+ (Flat Config), essa configuração ficou muito mais limpa, baseada em objetos JavaScript puros.
Vamos criar um pacote de linting centralizado que será herdado tanto pela nossa API quanto pela UI.
------------------------------

## 📂 Nova Estrutura de Pastas de Configuração

meu-monorepo/
├── packages/
│ ├── shared/
│ └── eslint-config/ # 🆕 Pacote centralizado de Lint
│ ├── package.json
│ ├── base.js # Regras globais (TS / Node)
│ └── react.js # Regras específicas para React (Vite)

---

## 🛠️ Passo 1: Criar o Pacote Centralizado (packages/eslint-config)

1.  Crie a pasta do pacote:

mkdir -p packages/eslint-config

2.  Crie o arquivo packages/eslint-config/package.json:

{
"name": "@erp-360/eslint-config",
"version": "1.0.0",
"private": true,
"main": "base.js",
"dependencies": {
"@eslint/js": "^9.0.0",
"typescript-eslint": "^8.0.0",
"eslint-plugin-react-hooks": "^5.0.0",
"eslint-plugin-react-refresh": "^0.4.0"
}
}

3.  Crie a configuração base (TypeScript/Node) em packages/eslint-config/base.js:

import eslint from '@eslint/js';import tseslint from 'typescript-eslint';
export default tseslint.config(
eslint.configs.recommended,
...tseslint.configs.recommended,
{
languageOptions: {
ecmaVersion: 'latest',
sourceType: 'module',
},
rules: {
'no-unused-vars': 'off',
'@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
'@typescript-eslint/no-explicit-any': 'warn',
},
}
);

4.  Crie a configuração específica para React em packages/eslint-config/react.js:

import tseslint from 'typescript-eslint';import baseConfig from './base.js';import reactHooks from 'eslint-plugin-react-hooks';import reactRefresh from 'eslint-plugin-react-refresh';
export default tseslint.config(
...baseConfig,
{
plugins: {
'react-hooks': reactHooks,
'react-refresh': reactRefresh,
},
rules: {
...reactHooks.configs.recommended.rules,
'react-refresh/only-export-components': [
'warn',
{ allowConstantExport: true },
],
},
}
);

---

## 🔗 Passo 2: Vincular o Config de Lint nos Projetos

Instale globalmente o pacote de configuração e a CLI do ESLint nos apps que precisam dele. Execute na raiz do projeto:

# Adiciona o pacote de lint global nas aplicações e pacotes

pnpm add @erp-360/eslint-config eslint -wD

# Registra a tarefa de lint no turbo.json da raiz (adicione dentro do objeto "tasks")

Atualize o seu turbo.json na raiz para que o Turbo saiba rodar e cachear o processo de lint:

{
"$schema": "https://turbo.build",
"tasks": {
"build": { "dependsOn": ["^build"], "outputs": ["dist/**", ".vite/**"] },
"dev": { "cache": false, "persistent": true },
"lint": { "cache": true }
}
}

---

## 📝 Passo 3: Aplicar as Configurações nos Subprojetos

Agora vamos substituir as configurações locais de ESLint pelo nosso pacote centralizado.

## 1. Na API (apps/api)

Crie ou substitua o arquivo apps/api/eslint.config.js:

import baseConfig from '@erp-360/eslint-config/base.js';
export default baseConfig;

## 2. Na UI (apps/ui)

Substitua o arquivo apps/ui/eslint.config.js gerado pelo Vite por:

import reactConfig from '@erp-360/eslint-config/react.js';
export default reactConfig;

## 3. No pacote Compartilhado (packages/shared)

Crie o arquivo packages/shared/eslint.config.js:

import baseConfig from '@erp-360/eslint-config/base.js';
export default baseConfig;

---

## 🏃‍♂️ Passo 4: Adicionar o Script Global e Testar

1.  Adicione o script de lint no package.json da raiz do projeto:

"scripts": {
"dev": "turbo dev",
"build": "turbo build",
"lint": "turbo lint",
"clean": "turbo clean"
}

2.  Adicione também um script de lint correspondente em cada um dos package.json internos (apps/ui, apps/api, e packages/shared):

"scripts": {
"lint": "eslint ."
}

Agora, execute o comando na raiz:

pnpm lint

O Turborepo vai rodar o ESLint em todos os pacotes em paralelo. Se você rodar o comando uma segunda vez sem alterar o código, ele completará em poucos milissegundos porque o Turbo vai trazer o resultado direto do cache!