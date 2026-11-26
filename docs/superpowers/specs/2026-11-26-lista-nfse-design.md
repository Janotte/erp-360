# Lista de NFS-e

## Para que serve

A empresa consulta os pedidos de NFS-e já gravados, com busca, ordenação e filtro. Nesta entrega a tela só lista. Não abre detalhe, não pede e não envia nota.

Pedir e enviar continuam na ordem de serviço. A configuração continua em Configurações → NFS-e.

## O que já existe

Cada pedido fica em `nfse_requests`, ligado a um documento de faturamento. Status: `pending`, `authorized`, `rejected`, `canceled`. Valor de serviço em centavos. Série e número da DPS nascem no envio. Chave de acesso nasce na autorização. O cliente vem da pessoa do documento comercial.

Não há `GET /nfse` nem item de menu para a lista.

## Decisões

- Identificadores em inglês. Rótulos e mensagens em português. Dinheiro em centavos.
- A lista segue o padrão visual de Entradas (`ListShell`, painel, busca, filtros, paginação, cabeçalhos ordenáveis).
- Item de menu de primeiro nível **NFS-e**, perto de Ordens de serviço. Rota `/nfse`.
- Clique na linha não navega.
- Coluna **Emissão** e filtro de intervalo usam `createdAt` do pedido.
- Coluna **Total** usa `serviceAmount` do pedido.
- Coluna **NFS-e/Série** mostra a série só quando o status é `authorized`. Nos outros status mostra `—`.
- Coluna **DPS** mostra `dpsNumber` quando existe. Sem número mostra `—`.
- Busca por NFS-e consulta a série. Sem número próprio de NFS-e nesta entrega.
- Ordenação padrão: número da DPS ascendente, nulos por último.

## Fora desta entrega

- Tela ou diálogo de detalhe da NFS-e.
- Pedir, enviar, cancelar ou reenviar a partir da lista.
- Impressão, DANFE/DANFSe, download de XML.
- NFS-e de contrato ou de venda fora da ordem.
- Número próprio de NFS-e separado da série.

## Rotas e menu

| Caminho | Tela |
|---|---|
| `/nfse` | `ListNfse` |

`AppSidebar` ganha o item **NFS-e**. `App.tsx` registra a rota autenticada.

Filtros, ordenação e página ficam na query da URL, no mesmo espírito de Entradas.

## Lista

### Colunas

Nesta ordem:

| Coluna | Campo | Exibição |
|---|---|---|
| DPS | `dpsNumber` | Número ou `—` |
| NFS-e/Série | `series` | Série se `authorized`; senão `—` |
| Status | `status` | Pendente, Autorizada, Recusada, Cancelada |
| Emissão | `createdAt` | Data civil no fuso da empresa (`dd/mm/aaaa`) |
| Cliente | nome da pessoa do documento | Texto |
| Total | `serviceAmount` | Moeda |
| Chave | `accessKey` | Chave ou `—`; reticências + últimos dígitos como em Entradas, tooltip com a chave inteira, clique copia |

A linha usa o tom de status no mesmo espírito da lista de Entradas.

### Busca

Campo único `q`, com atraso curto como nas outras listas. Casa com:

- número da DPS
- série
- nome do cliente
- chave de acesso

### Ordenação

Cada cabeçalho ordena. Campos:

- `dpsNumber`
- `series`
- `status`
- `createdAt`
- `customerName`
- `serviceAmount`
- `accessKey`

Direção `asc` ou `desc`. Sem `sortField`, usa `dpsNumber` ascendente. Nulos por último.

### Filtros

- Status: todos ou um de `pending | authorized | rejected | canceled`
- Emissão de / até: intervalo civil sobre `createdAt` (início e fim do dia no fuso da empresa, o mesmo relógio das outras listas)

Atalhos de período no espírito de Entradas: **Hoje** e **Este mês** preenchem só o intervalo de emissão. Não alteram o status.

## API

`GET /nfse`

Query:

| Parâmetro | Regra |
|---|---|
| `page`, `limit` | `listPageQuery` |
| `q` | texto opcional |
| `status` | um dos quatro status, opcional |
| `issuedFrom`, `issuedTo` | `YYYY-MM-DD`, opcional |
| `sortField` | um dos campos de ordenação |
| `sortOrder` | `asc` \| `desc` |

`sortField` inválido responde 400.

Cada item:

```ts
{
  id: string
  dpsNumber: number | null
  series: string | null
  status: 'pending' | 'authorized' | 'rejected' | 'canceled'
  createdAt: string
  customerName: string
  serviceAmount: number
  accessKey: string | null
}
```

Resposta paginada no padrão das outras listas (`data`, total, página).

A consulta junta `nfse_requests` → `billing_documents` → `persons`, filtrada pelo tenant.

## UI

- `apps/ui/src/components/Nfse/ListNfse.tsx`
- `apps/ui/src/services/nfse.ts` com o cliente da lista
- Rótulos de status em português na própria tela ou no serviço

Sem botão de nova nota nesta entrega. Cabeçalho da página: título **NFS-e** e descrição curta de consulta.

## Testes

- Integração da API: paginação, busca por DPS/série/cliente/chave, filtro de status e intervalo, ordenação padrão por DPS.
- A UI segue o padrão das listas existentes; teste automatizado da tela só se o repositório já cobrir listas semelhantes desta forma.
