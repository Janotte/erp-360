import tailwindcss from '@tailwindcss/vite'; // Importa o Tailwind v4
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(), // Ativa o compilador do Tailwind v4
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'), // Mapeia o alias @ para a pasta src
    },
  },
  server: {
    fs: {
      allow: [path.resolve(import.meta.dirname, '../..')],
    },
  },
});
