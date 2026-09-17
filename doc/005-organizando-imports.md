Para organizar e remover imports desnecessários automaticamente no ecossistema do ESLint v9+, a melhor abordagem é adicionar um plugin especializado na nossa configuração centralizada de Lint (packages/eslint-config).
O Prettier sozinho não remove código (como imports não usados), ele apenas cuida dos espaços e quebras de linha. Quem faz o trabalho pesado de organizar a ordem e deletar o que não é usado é o ESLint.
Vamos configurar o plugin eslint-plugin-simple-import-sort para fazer isso de forma 100% automática.
------------------------------

## 🛠️ Passo 1: Instalar o Plugin de Organização de Imports

Execute o comando na raiz do projeto para instalar o plugin no pacote de configuração:

pnpm add eslint-plugin-simple-import-sort --filter @erp-360/eslint-config

---

## 📝 Passo 2: Atualizar a Configuração Base (packages/eslint-config/base.js)

Abra o arquivo packages/eslint-config/base.js e adicione o plugin. Ele vai forçar uma ordem padrão (primeiro imports do node/npm, depois pacotes locais como o @erp-360/shared, depois arquivos relativos) e o TypeScript se encarregará de apontar e remover os não utilizados.
Substitua o conteúdo por:

import eslint from '@eslint/js';import tseslint from 'typescript-eslint';import simpleImportSort from 'eslint-plugin-simple-import-sort';
export default tseslint.config(
eslint.configs.recommended,
...tseslint.configs.recommended,
{
plugins: {
'simple-import-sort': simpleImportSort,
},
rules: {
// 1. Força a ordenação automática dos imports
'simple-import-sort/imports': 'error',
'simple-import-sort/exports': 'error',

      // 2. Transforma o aviso de variáveis/imports não usados em ERRO
      // Isso permite que o ESLint remova-os automaticamente no comando --fix
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_'
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
    },

}
);

---

## 🏃‍♂️ Passo 3: Criar o Script de Auto-Fix na Raiz

Para que o ESLint de fato corrija o código (ordene os imports e delete os que não estão sendo usados), precisamos rodá-lo com a flag --fix.
Abra o package.json da raiz do projeto e adicione o script lint:fix:

{
"scripts": {
"dev": "turbo dev",
"build": "turbo build",
"lint": "turbo lint",
"lint:fix": "turbo lint -- --fix",
"format": "turbo format",
"format:fix": "prettier --write ."
}
}

---

## 🚀 Como Usar no Dia a Dia

Agora, sempre que você quiser limpar a bagunça de arquivos na API ou na UI, basta rodar na raiz:

pnpm lint:fix

O que vai acontecer instantaneamente:

1.  Todos os imports serão ordenados de forma idêntica em todo o projeto.
2.  Qualquer import { ... } que você colocou e não usou no código será deletado automaticamente.

💡 Super Dica para o VS Code: Para fazer isso acontecer toda vez que você salvar o arquivo sem precisar rodar comandos no terminal, adicione isso ao seu arquivo .vscode/settings.json na raiz do monorepo:

{
"editor.codeActionsOnSave": {
"source.fixAll.eslint": "explicit"
}
}
