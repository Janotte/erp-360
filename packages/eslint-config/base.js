import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import simpleImportSort from 'eslint-plugin-simple-import-sort';

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

