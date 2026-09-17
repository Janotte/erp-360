Configurar o Prettier em um monorepo com Turborepo é ainda mais simples do que o ESLint. Diferente do linter, a convenção mais eficiente para o Prettier é ter um único arquivo de configuração na raiz do projeto. Dessa forma, todo o monorepo (API, UI e pacotes) segue as mesmas regras de formatação instantaneamente, e a sua IDE (como o VS Code) consegue ler tudo perfeitamente.
Aqui está o passo a passo para centralizar a formatação do seu código:
------------------------------

## 🛠️ Passo 1: Instalar o Prettier na Raiz

Execute o comando na raiz do projeto para instalar o Prettier e a tarefa do Turbo de forma global no monorepo:

pnpm add -wD prettier

---

## 📝 Passo 2: Criar as Configurações Globais (na Raiz)

Crie os dois arquivos abaixo diretamente na pasta raiz do seu monorepo (meu-monorepo/):

1.  .prettierrc (Define as regras de estilo):

{
"semi": true,
"trailingComma": "all",
"singleQuote": true,
"printWidth": 90,
"tabWidth": 2,
"endOfLine": "auto"
}

2.  .prettierignore (Diz ao Prettier o que não formatar):

node_modules
dist
.vite
.turbo
pnpm-lock.yaml
coverage

---

## ⚙️ Passo 3: Integrar ao Turborepo (turbo.json)

Para tirar proveito do cache super rápido do Turbo ao formatar o código, adicione a tarefa "format" dentro do objeto "tasks" no seu turbo.json na raiz:

{
"$schema": "https://turbo.build",
"tasks": {
"build": { "dependsOn": ["^build"], "outputs": ["dist/**", ".vite/**"] },
"dev": { "cache": false, "persistent": true },
"lint": { "cache": true },
"format": { "cache": true }
}
}

---

## 🏃‍♂️ Passo 4: Adicionar os Scripts no package.json da Raiz

Abra o package.json principal (da raiz) e adicione os comandos para verificar e aplicar a formatação:

{
"scripts": {
"dev": "turbo dev",
"build": "turbo build",
"lint": "turbo lint",
"format": "turbo format",
"format:fix": "prettier --write ."
}
}

Agora, adicione o script individual dentro do package.json de cada um dos subprojetos (apps/ui, apps/api e packages/shared) para que o Turbo consiga orquestrá-los:

"scripts": {
"format": "prettier --check ."
}

---

## 🚀 Como Usar no Dia a Dia

A partir de agora, você tem dois comandos principais na raiz:

- Validar a formatação (em CI/CD ou antes do commit):

pnpm format

(O Turbo vai rodar a checagem em paralelo em todas as pastas e salvar o resultado no cache. Se nenhum arquivo mudar, a segunda execução será instantânea).

- Corrigir e formatar todos os arquivos automaticamente:

pnpm format:fix

💡 Dica de Ouro: Se você usa o VS Code, instale a extensão oficial do Prettier e adicione a configuração "editor.formatOnSave": true nas configurações do seu editor. Ele vai ler o .prettierrc da raiz e formatar o seu código automaticamente toda vez que você salvar um arquivo da API ou da UI!
