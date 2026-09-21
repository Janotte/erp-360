Excelente iniciativa. O Tailwind CSS v4 trouxe uma mudança drástica de paradigma: ele removeu completamente o arquivo tailwind.config.js e agora utiliza uma arquitetura CSS-first, onde as configurações do tema ocorrem diretamente dentro do arquivo CSS global via @theme. [1, 2, 3]
Como o shadcn/ui agora possui suporte de primeira classe tanto para o Tailwind v4 quanto para estruturas de monorepo, vamos configurar tudo de forma limpa dentro do aplicativo frontend (apps/ui) utilizando o compilador nativo de alta performance do Vite. [2, 4, 5, 6]
------------------------------

## 🛠️ Passo 1: Instalar o Tailwind v4 e Dependências na UI

O Tailwind v4 integra-se ao Vite de forma nativa através do plugin @tailwindcss/vite, dispensando o uso clássico do PostCSS. Execute o comando na raiz do monorepo: [2, 6, 7]

# 1. Instala o Tailwind v4 e seu plugin do Vite no app de UI

pnpm add tailwindcss @tailwindcss/vite --filter @erp-360/ui

# 2. Instala os pacotes utilitários de estilo e ícones exigidos pelo shadcn

pnpm add clsx tailwind-merge lucide-react tailwindcss-animate --filter @erp-360/ui

# 3. Instala as tipagens do Node para resolver mapeamento de caminhos (Path Aliases)

pnpm add -D @types/node --filter @erp-360/ui

# 4. Instalar pacote class-variance-authority

pnpm add class-variance-authority --filter @erp-360/ui

---

## 🗺️ Passo 2: Configurar os Aliases (Caminhos) no TypeScript

O shadcn/ui necessita do alias @/* apontando para o seu diretório src/ para organizar as importações de componentes. [6, 8]

1.  Modifique o arquivo apps/ui/tsconfig.app.json (ou seu tsconfig.json correspondente do app) incluindo os mapeamentos em compilerOptions:

{
"compilerOptions": {
"baseUrl": ".",
"paths": {
"@/_": ["./src/_"]
}
}
}

2.  Se a sua raiz possuir um tsconfig.json genérico que gerencia as referências, certifique-se de espelhar o caminho nele para que a CLI do shadcn consiga validar a estrutura:

{
"compilerOptions": {
"paths": {
"@/_": ["./apps/ui/src/_"]
}
}
}

[9]

---

## ⚙️ Passo 3: Configurar o Tailwind v4 no Vite (apps/ui/vite.config.ts)

Agora, injete o plugin do Tailwind e ensine ao Vite como ler e traduzir o alias @/. Atualize seu apps/ui/vite.config.ts: [9]

import { defineConfig } from 'vite';import react from '@vitejs/plugin-react';import tailwindcss from '@tailwindcss/vite'; // 🆕 Importa o Tailwind v4import path from 'path';
export default defineConfig({
plugins: [
react(),
tailwindcss(), // 🆕 Ativa o compilador do Tailwind v4
],
resolve: {
alias: {
'@': path.resolve(__dirname, './src'), // Mapeia o alias @ para a pasta src
},
},
});

---

## 🎨 Passo 4: Criar as Variáveis Globais de CSS (Padrão Tailwind v4)

Substitua por completo o conteúdo do arquivo de estilos principal do seu frontend (apps/ui/src/index.css). Note a nova estrutura nativa da versão 4, utilizando a diretiva @theme para gerenciar as cores de variáveis CSS do shadcn: [1, 3]

@import "tailwindcss"; /* 🆕 No Tailwind v4, basta importar o pacote direto _/
@plugin "tailwindcss-animate"; /_ Ativa as animações de modais e dropdowns do shadcn */
@theme {
--color-border: hsl(var(--border));
--color-input: hsl(var(--input));
--color-ring: hsl(var(--ring));
--color-background: hsl(var(--background));
--color-foreground: hsl(var(--foreground));

--color-primary: hsl(var(--primary));
--color-primary-foreground: hsl(var(--primary-foreground));

--color-secondary: hsl(var(--secondary));
--color-secondary-foreground: hsl(var(--secondary-foreground));

--color-destructive: hsl(var(--destructive));
--color-destructive-foreground: hsl(var(--destructive-foreground));

--color-muted: hsl(var(--muted));
--color-muted-foreground: hsl(var(--muted-foreground));

--color-accent: hsl(var(--accent));
--color-accent-foreground: hsl(var(--accent-foreground));

--color-popover: hsl(var(--popover));
--color-popover-foreground: hsl(var(--popover-foreground));

--color-card: hsl(var(--card));
--color-card-foreground: hsl(var(--card-foreground));

--radius-lg: var(--radius);
--radius-md: calc(var(--radius) - 2px);
--radius-sm: calc(var(--radius) - 4px);

--animate-accordion-down: accordion-down 0.2s ease-out;
--animate-accordion-up: accordion-up 0.2s ease-out;
}
/* Customizações Base da UI do Shadcn */@layer base {
:root {
--background: 0 0% 100%;
--foreground: 222.2 84% 4.9%;
--card: 0 0% 100%;
--card-foreground: 222.2 84% 4.9%;
--popover: 0 0% 100%;
--popover-foreground: 222.2 84% 4.9%;
--primary: 222.2 47.4% 11.2%;
--primary-foreground: 210 40% 98%;
--secondary: 210 40% 96.1%;
--secondary-foreground: 222.2 47.4% 11.2%;
--muted: 210 40% 96.1%;
--muted-foreground: 215.4 16.3% 46.9%;
--accent: 210 40% 96.1%;
--accent-foreground: 222.2 47.4% 11.2%;
--destructive: 0 84.2% 60.2%;
--destructive-foreground: 210 40% 98%;
--border: 214.3 31.8% 91.4%;
--input: 214.3 31.8% 91.4%;
--ring: 222.2 84% 4.9%;
--radius: 0.5rem;
}

.dark {
--background: 222.2 84% 4.9%;
--foreground: 210 40% 98%;
--card: 222.2 84% 4.9%;
--card-foreground: 210 40% 98%;
--popover: 222.2 84% 4.9%;
--popover-foreground: 210 40% 98%;
--primary: 210 40% 98%;
--primary-foreground: 222.2 47.4% 11.2%;
--secondary: 217.2 32.6% 17.5%;
--secondary-foreground: 210 40% 98%;
--muted: 217.2 32.6% 17.5%;
--muted-foreground: 215 Fritz.3% 65%;
--accent: 217.2 32.6% 17.5%;
--accent-foreground: 210 40% 98%;
--destructive: 0 62.8% 30.6%;
--destructive-foreground: 210 40% 98%;
--border: 217.2 32.6% 17.5%;
--input: 217.2 32.6% 17.5%;
--ring: 212.7 26.8% 83.9%;
}
}
@layer base {

- {
  border-color: var(--color-border);
  }
  body {
  background-color: var(--color-background);
  color: var(--color-foreground);
  }
  }

---

## ⚙️ Passo 5: Inicializar o components.json do Shadcn

Crie o arquivo de mapeamento do CLI do shadcn em apps/ui/components.json. Deixar esse arquivo configurado manualmente evita que o inicializador automático quebre ao tentar procurar arquivos obsoletos do Tailwind v3. [4]

{
"$schema": "https://ui.shadcn.com/schema.json",
"style": "new-york",
"rsc": false,
"tsx": true,
"tailwind": {
"css": "src/index.css",
"baseColor": "slate",
"cssVariables": true
},
"iconLibrary": "lucide",
"aliases": {
"components": "@/components",
"utils": "@/lib/utils",
"ui": "@/components/ui",
"hooks": "@/hooks"
}
}

---

## 🔧 Passo 6: Criar a Função de Utilidade cn

Crie o arquivo auxiliar em apps/ui/src/lib/utils.ts que funde as classes condicionais do Tailwind de forma otimizada: [8, 10]

import { type ClassValue, clsx } from "clsx";import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) {
return twMerge(clsx(inputs));
}

---

## 🚀 Passo 7: Instalar seu Primeiro Componente Shadcn!

Com as pontes construídas para o Tailwind v4, navegue no terminal até a pasta do seu app de frontend e dispare a CLI oficial para instalar um componente (por exemplo, o Button ou um Card): [7]

cd apps/ui
pnpm dlx shadcn@latest add button

A CLI lerá seu arquivo components.json, detectará a estrutura de pastas e injetará o arquivo do botão estilizado perfeitamente em src/components/ui/button.tsx. Você já pode importá-lo em suas telas de login ou cadastros utilizando import { Button } from "@/components/ui/button".
