# Consulta de CEP no endereço da pessoa

## Objetivo

No formulário de endereço da pessoa, o usuário escolhe o tipo, digita o CEP e pressiona Enter. A API interna consulta uma base pública, resolve estado e cidade no cadastro local e devolve os campos obtidos. O usuário ajusta número e complemento e salva.

O fluxo segue o da consulta de CNPJ: a tela fala só com a API autenticada, e a API fala com a base pública.

## Comportamento na tela

O formulário atual de endereço permanece. O campo CEP ganha o mesmo gesto do CNPJ.

- Enter no CEP com 8 dígitos dispara a consulta e não envia o formulário.
- Enquanto a consulta está em andamento, outro Enter é ignorado. O texto de ajuda mostra "Consultando CEP...".
- Com menos de 8 dígitos, a tela mostra "CEP incompleto." e não chama a API.
- O texto de ajuda em repouso é "Digite o CEP e pressione Enter para preencher o endereço."

Quando a resposta chega com sucesso:

- Quando `stateId` e `cityId` vêm preenchidos, estado e cidade substituem os valores atuais. A busca de cidade passa a exibir `cityName`. O aviso é "Endereço preenchido. Confira número e complemento e salve."
- Quando `stateId` vem preenchido e `cityId` vem vazio, o estado é aplicado, a cidade selecionada é limpa e a busca de cidade fica vazia. O aviso é "Endereço preenchido, mas a cidade não foi encontrada. Selecione a cidade."
- Se `stateId` vem vazio, estado e cidade atuais permanecem.
- Logradouro e bairro só são substituídos quando vierem preenchidos. Valor `null` mantém o que já estava digitado.
- Tipo, número e complemento permanecem.
- O foco vai para o campo Número.

Erro de consulta (CEP inexistente ou falha da base pública) vira aviso com a mensagem da API. O formulário permanece como estava.

## API

`GET /persons/lookup/cep/:cep`, no mesmo grupo autenticado de `/persons`, ao lado de `GET /persons/lookup/cnpj/:cnpj`.

O parâmetro aceita CEP com ou sem hífen. A validação usa só os dígitos.

Resposta 200:

| Campo | Tipo | Conteúdo |
|---|---|---|
| `postalCode` | string | 8 dígitos |
| `street` | string ou null | logradouro, ou null quando a base pública não informa |
| `neighborhood` | string ou null | bairro, ou null quando a base pública não informa |
| `stateId` | string ou null | id do estado local |
| `stateAbbreviation` | string ou null | UF |
| `cityId` | string ou null | id da cidade local |
| `cityName` | string ou null | nome da cidade local quando ela foi encontrada; null quando não foi |

Número e complemento não fazem parte da resposta.

Erros, no mesmo formato `{ message }` da consulta de CNPJ:

| Situação | Status | Mensagem |
|---|---|---|
| CEP sem 8 dígitos | 400 | CEP inválido. |
| As duas fontes indicam que o CEP não existe | 404 | CEP não encontrado. |
| As duas fontes falham ou a resposta é inconclusiva | 502 | Não foi possível consultar o CEP agora. Tente de novo. |

## Serviço

Arquivo novo `apps/api/src/services/cep-lookup.ts`. A rota em `apps/api/src/routes/persons.ts` só valida o parâmetro, chama o serviço e traduz o erro.

Fontes, nesta ordem:

1. ViaCEP: `https://viacep.com.br/ws/{cep}/json/`
2. BrasilAPI: `https://brasilapi.com.br/api/cep/v2/{cep}`

Cada chamada espera no máximo 8 segundos. O ViaCEP com corpo `{ erro: true }` conta como CEP inexistente, e a BrasilAPI é tentada em seguida. Status 404 também conta como inexistente. Timeout, rede e status fora de 2xx/404 contam como falha transitória.

Uma resposta é utilizável quando o status é 2xx, o ViaCEP não marcou `erro: true`, e a fonte trouxe nome da cidade ou UF. CEP único de cidade, com logradouro e bairro vazios, é resposta utilizável. A primeira resposta utilizável encerra a busca. Se as duas fontes dizem que o CEP não existe, a resposta é 404. Se houve falha transitória e nenhuma fonte devolveu resposta utilizável, a resposta é 502.

Campos lidos:

- ViaCEP: `logradouro`, `bairro`, `localidade`, `uf`, `ibge`
- BrasilAPI: `street`, `neighborhood`, `city`, `state`

O complemento público é ignorado. Logradouro e bairro passam por título em português e são cortados em 60 caracteres. Texto vazio vira `null`.

Resolução local, reutilizando o critério da consulta de CNPJ:

1. Cidade pelo código IBGE de 7 dígitos em `cities.code`, com o estado obtido pelo join.
2. Se não houver IBGE ou o código não existir, cidade pelo nome com `unaccent` e a UF em `states.abbreviation`.
3. Se a cidade não for encontrada e a UF existir, `stateId` e `stateAbbreviation` são preenchidos e `cityId` e `cityName` ficam `null`.
4. Se a UF também não existir, `stateId`, `stateAbbreviation`, `cityId` e `cityName` ficam `null`. Logradouro e bairro ainda são devolvidos. A tela, por receber `stateId` vazio, mantém o estado e a cidade já selecionados.

Consulta bem-sucedida fica em cache na memória por 1 hora, chaveada pelos 8 dígitos. Falha não entra no cache. O cache não depende de tenant, porque o CEP e as cidades são dados compartilhados.

Não há migração nem alteração de schema.

## Interface

- `personsService.lookupCep` em `apps/ui/src/services/persons.ts`, no mesmo padrão de `lookupCnpj`.
- O formulário em `apps/ui/src/components/Persons/PersonAddresses.tsx` aplica a resposta segundo a seção "Comportamento na tela".

## Verificação

O repositório não tem suíte de testes. A checagem é manual, com API e tela no ar:

- CEP completo preenche logradouro, bairro, estado e cidade, e o foco vai para Número.
- Número e complemento digitados antes do Enter permanecem.
- CEP único de cidade preenche estado e cidade e mantém logradouro e bairro já digitados.
- CEP com menos de 8 dígitos não chama a API.
- CEP inexistente mostra o aviso e não altera os campos.
- Enter no CEP não salva o endereço.

## Fora do escopo

- Gravar o endereço automaticamente depois da consulta.
- Consultar CEP fora do formulário de endereço da pessoa.
- Alterar a consulta de CNPJ.
