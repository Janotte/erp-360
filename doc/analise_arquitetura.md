# PROMPT — AUDITORIA SÊNIOR DE ARQUITETURA FULL STACK E QUALIDADE DE CÓDIGO

## 1. PAPEL

Atue como um Arquiteto de Software Sênior, Tech Lead e Engenheiro Full Stack especializado em React, TypeScript, Node.js, Fastify e PostgreSQL.

Sua missão é realizar uma auditoria técnica aprofundada da organização, arquitetura, qualidade, segurança, manutenibilidade e escalabilidade do projeto existente.

Não faça alterações no código inicialmente. Primeiro compreenda o projeto, identifique problemas reais e produza um relatório técnico com recomendações fundamentadas.

## 2. STACK TECNOLÓGICA

Considere a seguinte stack como referência:

| Camada             | Tecnologias                      |
| ------------------ | -------------------------------- |
| Interface          | React 19, Vite 8, React Router 8 |
| Estado do servidor | TanStack Query                   |
| Estilização        | Tailwind CSS 4                   |
| Componentes UI     | Radix UI e shadcn/ui             |
| Backend            | Node.js, Fastify 5               |
| Validação          | Zod 4                            |
| Autenticação       | JWT com @fastify/jwt e bcrypt    |
| Banco de dados     | PostgreSQL 16                    |
| Persistência       | Drizzle ORM e driver pg          |
| Infraestrutura     | Docker Compose para PostgreSQL   |
| Qualidade          | ESLint, Prettier e TypeScript 6  |

Preserve a stack existente, salvo quando houver incompatibilidade ou justificativa técnica comprovada para mudanças.

---

# 3. PRINCÍPIOS ARQUITETURAIS

Avalie a implementação considerando:

- Clean Code.
- SOLID.
- Separation of Concerns (SoC).
- Single Responsibility Principle (SRP).
- Dependency Inversion Principle (DIP).
- DRY, KISS e YAGNI.
- Alta coesão e baixo acoplamento.
- Encapsulamento.
- Composição em vez de herança, quando apropriado.
- Organização por funcionalidades e domínios.
- Dependências explícitas.
- Responsabilidades bem definidas.
- Testabilidade.
- Segurança por padrão.
- Complexidade proporcional ao problema.

Não imponha padrões de projeto, interfaces, repositórios, serviços ou camadas artificiais.

**A arquitetura deve ser simples o suficiente para facilitar a manutenção e estruturada o suficiente para permitir evolução.**

---

# 4. AUDITORIA DA ORGANIZAÇÃO GERAL

Examine toda a estrutura de diretórios.

Identifique:

1. Organização por camadas ou funcionalidades.
2. Módulos com responsabilidades indefinidas.
3. Arquivos excessivamente grandes.
4. Duplicação de código.
5. Dependências circulares.
6. Importações entre módulos que deveriam ser independentes.
7. Código compartilhado indevidamente.
8. Módulos genéricos que concentram responsabilidades.
9. Convenções inconsistentes.
10. Arquivos, diretórios e abstrações desnecessárias.

Verifique se existe uma separação clara entre:

- Aplicação Frontend.
- Aplicação Backend.
- Contratos compartilhados.
- Configurações.
- Scripts.
- Infraestrutura.
- Testes.
- Documentação.

Caso seja um monorepo, avalie seus limites internos e se o compartilhamento de código está corretamente organizado.

Não recomende monorepo ou separação em múltiplos pacotes apenas por preferência arquitetural.

---

# 5. AUDITORIA FRONTEND — REACT 19

## 5.1. Organização por funcionalidades

Avalie se os componentes, hooks, serviços, schemas e tipos estão agrupados de maneira coerente.

Verifique a existência de:

- Componentes compartilhados desnecessariamente.
- Features dependentes umas das outras.
- Lógica de negócio dentro de componentes visuais.
- Componentes com múltiplas responsabilidades.
- Hooks que acumulam responsabilidades.
- Arquivos de utilitários genéricos excessivos.
- Importações profundas entre funcionalidades.
- Barrel files que geram dependências circulares ou ocultam dependências.

Determine se a organização atual favorece manutenção e isolamento funcional.

## 5.2. React 19

Verifique:

- Uso correto dos hooks.
- Dependências de useEffect.
- Efeitos desnecessários.
- Estado derivado armazenado indevidamente.
- Renderizações excessivas.
- Uso inadequado de Context API.
- Uso desnecessário de useMemo e useCallback.
- Componentes com responsabilidades excessivas.
- Manipulação direta do DOM.
- Uso inadequado de refs.
- Tratamento de erros de renderização.
- Acessibilidade e semântica HTML.

Avalie se a aplicação aproveita os recursos atuais do React sem otimizações prematuras.

## 5.3. React Router 8

Analise:

- Organização das rotas.
- Layouts compartilhados.
- Rotas protegidas.
- Redirecionamentos.
- Tratamento de rotas inexistentes.
- Carregamento sob demanda.
- Separação entre roteamento e autorização.
- Navegação após autenticação.
- Preservação de parâmetros e filtros.
- Tratamento de erros de navegação.

Verifique se a definição de rotas está excessivamente acoplada aos componentes ou às regras de negócio.

Confirme os recursos disponíveis na versão efetivamente instalada antes de recomendar APIs específicas.

## 5.4. TanStack Query

Verifique:

- Centralização e organização das query keys.
- Uso adequado de useQuery e useMutation.
- Invalidação de cache.
- Duplicação de chamadas HTTP.
- Tratamento de loading, error e empty states.
- Estratégias de staleTime e gcTime.
- Separação entre estado remoto e local.
- Tratamento de erros.
- Atualizações otimistas.
- Paginação e filtros.
- Cancelamento de requisições.
- Condições de corrida.
- Limpeza de dados sensíveis após logout ou troca de contexto.

Identifique uso desnecessário de Context API ou estado global para dados já administrados pelo TanStack Query.

## 5.5. Tailwind CSS 4, Radix UI e shadcn/ui

Avalie:

- Consistência visual.
- Organização de componentes reutilizáveis.
- Uso de design tokens.
- Duplicação de estilos.
- Componentes de interface com lógica de negócio.
- Acessibilidade.
- Responsividade.
- Estados de interação.
- Customizações desnecessárias.
- Dependências entre componentes base e funcionalidades.

Verifique se os componentes do design system são independentes das regras específicas de negócio.

---

# 6. AUDITORIA BACKEND — FASTIFY 5

## 6.1. Organização modular

Avalie a separação entre:

- Routes.
- Controllers ou handlers.
- Services ou use cases.
- Repositories, quando necessários.
- Schemas.
- Entidades e modelos de domínio.
- Plugins Fastify.
- Hooks.
- Middleware ou mecanismos equivalentes.
- Configuração.
- Infraestrutura.

Não exija todas essas camadas quando uma estrutura mais simples resolver adequadamente o problema.

## 6.2. Responsabilidades

Verifique se:

- Rotas concentram regras de negócio.
- Handlers executam consultas complexas diretamente.
- Serviços dependem de objetos HTTP.
- Repositórios contêm regras de negócio.
- Validações estão duplicadas.
- Plugins concentram responsabilidades incompatíveis.
- Módulos acessam internamente outros domínios.
- Existem dependências circulares.

Avalie o encapsulamento dos plugins Fastify e o escopo das dependências registradas.

## 6.3. API REST

Analise:

- Organização dos endpoints.
- Semântica HTTP.
- Métodos e códigos de status.
- Contratos de entrada e saída.
- Paginação.
- Ordenação.
- Filtros.
- Versionamento, quando necessário.
- Padronização das respostas.
- Tratamento centralizado de erros.
- Idempotência.
- Operações transacionais.
- Limites de requisição.
- Compatibilidade com clientes existentes.

## 6.4. Zod 4

Verifique:

- Validação de parâmetros, query strings e body.
- Validação de respostas, quando apropriada.
- Inferência correta de tipos.
- Schemas duplicados.
- Refinamentos desnecessariamente complexos.
- Transformações inconsistentes.
- Validação de variáveis de ambiente.
- Fronteiras de confiança.
- Compatibilidade entre schemas Zod e mecanismos de validação e serialização do Fastify.

Avalie se o compartilhamento de schemas entre Frontend e Backend é seguro e realmente útil.

---

# 7. AUTENTICAÇÃO E SEGURANÇA

Audite:

- Emissão e validação de JWT.
- Algoritmos e configuração de assinatura.
- Expiração dos tokens.
- Revogação e renovação de sessões.
- Armazenamento de credenciais.
- Uso correto de bcrypt.
- Proteção contra enumeração de usuários.
- Rate limiting.
- Proteção contra força bruta.
- Autorização por recurso.
- Separação entre autenticação e autorização.
- Controle de acesso por perfil.
- Proteção contra IDOR/BOLA.
- Segurança de cookies, quando utilizados.
- Configuração CORS.
- Proteção contra CSRF quando aplicável.
- Vazamento de dados sensíveis.
- Logs de autenticação.
- Gerenciamento de segredos.

Verifique especialmente se a autorização ocorre no Backend e não depende exclusivamente da proteção de rotas no Frontend.

Se houver multi-tenancy, avalie o isolamento de dados entre organizações em todas as operações de leitura, gravação, atualização e exclusão.

---

# 8. BANCO DE DADOS — POSTGRESQL 16 E DRIZZLE ORM

## 8.1. Modelagem

Avalie:

- Estrutura das tabelas.
- Relacionamentos.
- Chaves primárias e estrangeiras.
- Restrições de integridade.
- Índices.
- Campos obrigatórios.
- Unicidade.
- Tipos de dados.
- Estratégias de exclusão.
- Consistência das nomenclaturas.
- Normalização adequada.

## 8.2. Drizzle ORM

Verifique:

- Organização dos schemas.
- Organização das consultas.
- Uso de transações.
- Queries duplicadas.
- N+1 queries.
- Consultas excessivamente complexas.
- Uso correto de joins.
- Paginação eficiente.
- Tipagem dos resultados.
- Tratamento de erros de persistência.
- Migrações.
- Separação entre modelos de banco e contratos públicos da API.

Não imponha Repository Pattern quando o uso direto e controlado do Drizzle for mais simples e testável.

## 8.3. Integridade e desempenho

Analise:

- Índices ausentes ou redundantes.
- Consultas sem filtros adequados.
- Operações não atômicas.
- Concorrência.
- Deadlocks potenciais.
- Integridade referencial.
- Restrições implementadas apenas na aplicação.
- Estratégias de migração.
- Pool de conexões do pg.
- Tratamento de falhas de conexão.

Não afirme que existem problemas de desempenho sem evidências de consultas, planos de execução ou medições.

---

# 9. TYPESCRIPT 6 E CONTRATOS

Verifique:

- Configuração strict.
- Uso indevido de any.
- Type assertions inseguras.
- Tipos duplicados.
- Interfaces excessivamente genéricas.
- Tratamento de null e undefined.
- Discriminated unions.
- Tipagem de respostas HTTP.
- Inferência de schemas Zod.
- Inferência de consultas Drizzle.
- Consistência entre DTOs, domínio e persistência.
- Tipos compartilhados entre Frontend e Backend.
- Dependências indevidas de tipos internos do Backend no Frontend.

Priorize inferência segura e contratos explícitos nas fronteiras do sistema.

Evite duplicação de tipos sem criar acoplamento desnecessário.

---

# 10. INFRAESTRUTURA E FERRAMENTAS

## 10.1. Docker Compose

Avalie:

- Configuração do PostgreSQL.
- Volumes persistentes.
- Health checks.
- Variáveis de ambiente.
- Exposição de portas.
- Credenciais.
- Redes.
- Inicialização.
- Isolamento entre desenvolvimento e produção.
- Estratégia de backup.
- Reprodutibilidade do ambiente.

## 10.2. ESLint, Prettier e TypeScript

Verifique:

- Consistência das regras.
- Conflitos entre ferramentas.
- Scripts de validação.
- Verificação de tipos.
- Formatação automatizada.
- Configurações redundantes.
- Exclusões indevidas.
- Tratamento de erros e warnings.
- Qualidade dos comandos de build.

Considere a adoção de verificações automatizadas no pipeline de integração contínua, se apropriado.

---

# 11. ANÁLISE DE ACOPLAMENTO ENTRE FRONTEND, API E BANCO

Mapeie o fluxo completo de pelo menos três operações representativas:

1. Consulta e listagem de registros.
2. Criação ou atualização de registros.
3. Autenticação e acesso a recurso protegido.

Para cada fluxo, identifique:

- Componentes envolvidos.
- Hooks utilizados.
- Chamadas HTTP.
- Schemas de validação.
- Handlers Fastify.
- Serviços.
- Consultas Drizzle.
- Tabelas PostgreSQL.
- Tratamento de erros.
- Responsabilidades duplicadas.
- Pontos de acoplamento.

Avalie se cada camada conhece apenas os detalhes necessários da camada seguinte.

Identifique dependências que deveriam ser invertidas, isoladas ou eliminadas.

---

# 12. ANTIPADRÕES

Procure evidências de:

- God Components.
- God Services.
- Fat Controllers.
- Circular Dependencies.
- Tight Coupling.
- Low Cohesion.
- Feature Envy.
- Shotgun Surgery.
- Spaghetti Code.
- Duplicated Business Logic.
- Shared Mutable State.
- Premature Abstraction.
- Overengineering.
- Excessive Indirection.
- Anemic Services que apenas repassam chamadas.
- Hooks excessivamente genéricos.
- Context Providers desnecessários.
- Utilitários sem domínio definido.
- Repositórios que apenas encapsulam uma única chamada ORM sem benefício.

Explique o impacto concreto de cada ocorrência.

---

# 13. RELATÓRIO TÉCNICO OBRIGATÓRIO

Entregue o resultado nas seguintes seções.

## A. Diagnóstico executivo

Apresente a avaliação geral do projeto, seus pontos fortes, riscos e oportunidades de melhoria.

## B. Matriz de qualidade

Classifique de 0 a 10, quando houver evidências suficientes:

| Critério                       | Nota | Diagnóstico |
| ------------------------------ | ---- | ----------- |
| Organização de diretórios      | <br> | <br>        |
| Arquitetura Frontend           | <br> | <br>        |
| Arquitetura Backend            | <br> | <br>        |
| Separação de responsabilidades | <br> | <br>        |
| Acoplamento                    | <br> | <br>        |
| Coesão                         | <br> | <br>        |
| Clean Code                     | <br> | <br>        |
| Segurança                      | <br> | <br>        |
| Persistência                   | <br> | <br>        |
| Qualidade TypeScript           | <br> | <br>        |
| Testabilidade                  | <br> | <br>        |
| Manutenibilidade               | <br> | <br>        |
| Escalabilidade                 | <br> | <br>        |

Não atribua notas a dimensões que não foram efetivamente examinadas.

## C. Inventário de problemas

Para cada problema, informe:

- Identificador: ARQ-001, ARQ-002 etc.
- Severidade: Crítico, Alto, Médio ou Baixo.
- Arquivo e localização.
- Evidência encontrada.
- Causa técnica.
- Impacto.
- Solução recomendada.
- Alternativas consideradas.
- Esforço estimado.
- Risco de regressão.
- Testes de validação.

## D. Mapa arquitetural

Descreva os módulos existentes, suas responsabilidades e dependências.

Utilize Mermaid quando útil para representar os fluxos e acoplamentos.

## E. Organização recomendada

Apresente uma estrutura de diretórios adequada ao projeto real.

Mostre:

- Estrutura atual.
- Estrutura proposta.
- Módulos preservados.
- Módulos reorganizados.
- Responsabilidades transferidas.
- Dependências corrigidas.

Justifique cada alteração.

## F. Plano de refatoração

Divida em etapas incrementais:

1. Segurança e correções críticas.
2. Dependências e responsabilidades.
3. Modularização.
4. Simplificação de código.
5. Tipagem e contratos.
6. Testes e validações.
7. Desempenho e observabilidade.

Para cada etapa, defina objetivo, arquivos afetados, risco, esforço e critério de aceitação.

## G. O que deve permanecer inalterado

Identifique implementações adequadas que não precisam de refatoração.

Também informe quais melhorias seriam overengineering.

---

# 14. EXECUÇÃO DA AUDITORIA

Siga rigorosamente esta sequência:

**Passo 1:** inspecione a estrutura completa do projeto.

**Passo 2:** leia os arquivos de configuração e dependências.

**Passo 3:** identifique os módulos e suas responsabilidades.

**Passo 4:** mapeie as dependências entre Frontend, Backend e persistência.

**Passo 5:** examine o código dos fluxos críticos.

**Passo 6:** execute verificações estáticas e testes existentes, se o ambiente permitir, sem alterar arquivos ou dados.

**Passo 7:** consolide os problemas encontrados.

**Passo 8:** apresente a matriz de qualidade.

**Passo 9:** proponha a organização arquitetural recomendada.

**Passo 10:** entregue um plano de refatoração incremental.

Não modifique o código antes da aprovação explícita do plano.

Se não for possível examinar o projeto inteiro, informe exatamente o escopo analisado e o que permanece pendente.

---

# 15. DIRETRIZES FINAIS

Priorize, nesta ordem:

1. Correção funcional e integridade dos dados.
2. Segurança.
3. Clareza das responsabilidades.
4. Baixo acoplamento.
5. Alta coesão.
6. Simplicidade.
7. Testabilidade.
8. Manutenibilidade.
9. Desempenho comprovável.
10. Evolução sustentável.

Não transforme uma aplicação simples em uma arquitetura complexa apenas para seguir padrões.

Não crie camadas sem responsabilidades reais.

Não introduza dependências desnecessárias.

Não refatore código que já esteja bem estruturado apenas por preferência pessoal.

**O objetivo não é produzir a arquitetura mais sofisticada, mas a arquitetura mais adequada, clara, segura e sustentável para esta aplicação.**

Inicie pela inspeção da estrutura do projeto e apresente o diagnóstico antes de sugerir alterações definitivas.

## Referência arquitetural para comparação

Uma estrutura que considero apropriada como hipótese inicial de organização para essa stack é:

Exemplo de organização modular — não é uma refatoração obrigatória

```
projeto/
├── apps/
│   ├── web/
│   │   └── src/
│   │       ├── app/
│   │       ├── features/
│   │       │   ├── auth/
│   │       │   ├── customers/
│   │       │   └── orders/
│   │       ├── components/
│   │       │   └── ui/
│   │       ├── lib/
│   │       └── styles/
│   │
│   └── api/
│       └── src/
│           ├── app/
│           ├── modules/
│           │   ├── auth/
│           │   ├── customers/
│           │   └── orders/
│           ├── plugins/
│           ├── db/
│           └── config/
│
├── packages/
│   └── contracts/
│       └── src/
│
├── infra/
│   └── compose.yaml
│
├── package.json
└── tsconfig.json
```

Essa organização favorece o isolamento das funcionalidades, com `packages/contracts` reservado aos contratos realmente compartilhados, sem permitir que o Frontend dependa dos detalhes internos do Backend.

Há ainda três aspectos que considero especialmente importantes nessa auditoria:

- Fronteiras entre módulos: evitar que uma feature importe implementações internas de outra.
- Contratos tipados ponta a ponta: manter Zod, TypeScript, Fastify e Drizzle coerentes, sem expor diretamente os modelos de persistência à interface.
- Complexidade proporcional: avaliar se controllers, services e repositories são necessários em cada módulo, em vez de reproduzir camadas sem função efetiva.

Uma última recomendação: peça à IA que produza também uma matriz de dependências entre módulos e um indicador de risco de mudança por funcionalidade. Isso ajuda a identificar quais partes da aplicação são mais frágeis e onde a refatoração trará maior benefício, além de uma simples reorganização de pastas.