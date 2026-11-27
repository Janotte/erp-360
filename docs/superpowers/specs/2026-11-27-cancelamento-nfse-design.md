# Cancelamento de NFS-e

## Para que serve

Na lista `/nfse`, a empresa cancela no SEFIN uma nota já autorizada, confere os eventos registrados e, se precisar, pede uma nova NFS-e no mesmo documento de faturamento. O estorno da ordem de serviço não cancela nota no fisco: com NFS-e autorizada, o estorno fica bloqueado até o cancelamento SEFIN.

## O que já existe

- Lista `/nfse` com pedidos em `nfse_requests` (`pending` | `authorized` | `rejected` | `canceled`).
- Envio DPS no SEFIN (`POST …/SefinNacional/nfse`), mTLS, gzip+base64 e assinatura XML em `dps.ts`.
- Nota autorizada grava `accessKey`, `nfseXml`, série, DPS e ambiente.
- DANFSe na lista (`GET /nfse/:id/danfse`) a partir do XML local.
- Unique `(tenant_id, billing_document_id)` — um pedido por documento, inclusive após cancelar.
- Status `canceled` hoje só no estorno da OS, e só em pedido `pending` (cancelamento local, sem SEFIN).
- `billing_documents.fiscalStatus` tem valor `canceled`, mas nenhum fluxo o grava.
- Specs da lista e da DANFSe deixaram cancelamento fora de escopo.

## Decisões

- Identificadores em inglês. Rótulos e mensagens em português.
- Cancelar **somente na lista** `/nfse`. Sem botão de cancelar na ordem de serviço nesta entrega.
- Menu de contexto (botão direito na linha), no espírito das Entradas:
  - **Visualizar DANFSe** — só se `authorized` com chave (mesmo fluxo do ícone atual).
  - **Cancelar** — só se `authorized` com chave.
  - **Visualizar os eventos** — se houver chave (autorizada ou já cancelada com histórico).
- Antes de cancelar: confirmação com motivo (`cMotivo` + `xMotivo`). Sem motivo válido não envia.
- Protocolo: evento nacional **e101101** (`pedRegEvento` assinado → gzip → base64).
- Endpoint SEFIN: `POST /SefinNacional/nfse/{chaveAcesso}/eventos` no mesmo host/ambiente do envio da DPS.
- Body: `{ "pedidoRegistroEventoXmlGZipB64": "…" }`.
- Motivos oficiais: `1` Erro na emissão, `2` Serviço não prestado, `9` Outros. `xMotivo` com 15–255 caracteres. `xDesc` literal `Cancelamento de NFS-e`.
- Id do pedido: `PRE` + chave(50) + `101` + sequência(3). Primeiro cancelamento usa `001`. Cancelamento é único por nota no SEFIN.
- Prazo e teto municipal: **não** pré-validar no ERP. Mostrar com clareza o erro devolvido pelo SEFIN (E0822, E0823, E0824, etc.).
- Após cancelamento aceito: pedido `authorized` → `canceled`; `billing_documents.fiscalStatus` → `canceled`; gravar o evento localmente.
- Reemissão: **novo pedido no mesmo documento** de faturamento. O pedido cancelado permanece no histórico.
- Unique do pedido por documento vira índice parcial: no máximo um pedido vivo (`pending` | `rejected` | `authorized`) por documento; vários `canceled` podem coexistir.
- Estorno da OS: se existir NFS-e `authorized` ligada ao documento emitido, responde erro e **não** estorna. Continua cancelando só pedido `pending` local, como hoje.
- Eventos na UI: leitura do que o ERP gravou (local). Sem consulta ADN/SEFIN na visualização nesta entrega.

## Fora desta entrega

- Cancelar pela ordem de serviço ou pela DANFSe.
- Cancelamento em cascata no estorno da OS.
- Substituição de NFS-e (`e105102`) e demais eventos além do cancelamento.
- Pré-consulta de parâmetro municipal (prazo/valor/tomador).
- Consulta remota de eventos no SEFIN/ADN ao abrir o painel.
- Download do XML do evento fora do painel de eventos.
- Cancelar título financeiro junto com a nota.
- NFS-e de contrato ou de venda fora da ordem.

## Modelo de dados

### `nfse_requests`

- Remover o unique absoluto `(tenant_id, billing_document_id)`.
- Criar unique parcial: `(tenant_id, billing_document_id)` onde `status in ('pending','rejected','authorized')`.
- Colunas novas opcionais de resumo do cancelamento (espelho do último evento aceito), se facilitar a lista — ou só a tabela de eventos abaixo. Preferência: **tabela de eventos**; o status do pedido basta na lista.

### `nfse_events` (nova)

Uma linha por evento aceito (ou, se útil para auditoria, também o XML do pedido enviado). Mínimo desta entrega:

| Campo | Regra |
|---|---|
| `id` | UUID |
| `tenant_id` | tenant |
| `request_id` | FK composta com tenant → `nfse_requests` |
| `type` | texto curto; cancelamento = `e101101` |
| `sequence` | 1–999; no cancelamento, `1` |
| `reason_code` | `1` \| `2` \| `9` (obrigatório no cancelamento) |
| `reason_text` | `xMotivo` (15–255) |
| `event_xml` | XML do evento retornado (ou do pedido+retorno), texto |
| `registered_at` | instante do registro local / `dhEvento` |

Unique `(tenant_id, request_id, type, sequence)`.

## Protocolo (espelho do envio)

```
ListNfse (Cancelar + confirmação)
  → POST /nfse/:requestId/cancel { reasonCode, reasonText }
  → carrega pedido authorized + chave + ambiente + CNPJ
  → monta pedRegEvento (e101101), assina como a DPS
  → gzip + base64
  → POST SEFIN …/nfse/{chave}/eventos (mTLS do ambiente do pedido)
  → sucesso: grava nfse_events, status canceled, fiscalStatus canceled
  → falha: mantém authorized; devolve mensagem/código do SEFIN
```

Assinatura e compressão reutilizam o padrão de `dps.ts` (mesmo namespace, C14N exclusivo, RSA-SHA256). Relógio: `America/Sao_Paulo`, com a mesma margem de atraso já usada na emissão se o SEFIN for sensível a `dhEvento` futuro.

## API

### `POST /nfse/:requestId/cancel`

Corpo:

```ts
{
  reasonCode: '1' | '2' | '9'
  reasonText: string // trim; 15–255
}
```

Regras:

- Pedido do tenant, `status === 'authorized'`, com `accessKey` e `environment`.
- Caso contrário: 409/400 com mensagem clara (ex.: só nota autorizada pode ser cancelada).
- Sucesso: 200 com o pedido atualizado (`status: 'canceled'`) e o evento gravado (id, type, sequence, reasonCode, reasonText, registeredAt).
- Recusa SEFIN: 502 (ou 409 se for regra de negócio clara) com a mensagem parseada; **não** altera status.

### `GET /nfse/:requestId/events`

Lista os eventos locais do pedido, ordenados por `registered_at` / sequência.

```ts
{
  data: Array<{
    id: string
    type: string
    sequence: number
    reasonCode: string | null
    reasonText: string | null
    registeredAt: string
  }>
}
```

Sem XML na lista. Detalhe do XML, se necessário no painel, pode vir no mesmo item como campo opcional `eventXml` nesta entrega (painel simples) ou ficar para depois. Preferência: incluir `eventXml` no item para o diálogo mostrar o texto sem segundo round-trip.

### Pedido na OS (ajuste)

`POST /service-orders/:id/nfse` (pedir):

- Continua recusando se já houver pedido vivo (`pending` | `rejected` | `authorized`).
- Se o único histórico for `canceled`, **permite** novo pedido no mesmo documento.
- Mensagem de “já solicitada” só para pedido vivo.

### Estorno da OS (ajuste)

`POST /service-orders/:id/reversal`:

- Se o documento emitido tiver NFS-e `authorized`, responde 409: é preciso cancelar a NFS-e na lista antes de estornar.
- Pedido `pending` continua sendo marcado `canceled` localmente no estorno, como hoje.
- Pedido já `canceled` no SEFIN não bloqueia o estorno por si só.

## UI

### Lista `/nfse`

- Botão direito na linha abre menu flutuante (padrão Entradas / `InboundNoteMenu`).
- Itens:
  - **Visualizar DANFSe** — habilitado se `authorized` + chave; abre o diálogo atual.
  - **Cancelar** — habilitado se `authorized` + chave; abre confirmação.
  - **Visualizar os eventos** — habilitado se houver chave; abre diálogo com a lista de eventos (vazio: “Nenhum evento registrado.”).
- O ícone de DANFSe na linha pode permanecer; o menu não o substitui obrigatoriamente.

### Confirmação de cancelamento

- `AlertDialog` ou diálogo curto com:
  - texto de confirmação (ex.: cancelar a NFS-e no ambiente nacional; ação irreversível naquela chave);
  - select de motivo (`1` / `2` / `9`) com rótulos em português;
  - campo de justificativa (`xMotivo`), mínimo 15 caracteres;
  - botões Cancelar / Confirmar.
- Em sucesso: toast, fecha diálogo, invalida a lista.
- Em erro: toast/mensagem com o retorno do SEFIN; status permanece Autorizada.

### Eventos

- Diálogo listando data/hora, tipo (Cancelamento de NFS-e), motivo e texto.
- Opcional nesta entrega: bloco com XML em `<pre>` recolhível.

### Ordem de serviço

- Sem novo botão de cancelar.
- “Pedir NFS-e” reaparece quando não houver pedido vivo (após cancelamento SEFIN).
- Estorno: se a API devolver 409 por nota autorizada, a UI mostra a mensagem.

## Testes

- Montagem/assinatura do `pedRegEvento` (Id `PRE…101001`, `e101101`, motivos).
- Parser de sucesso e de recusa do endpoint de eventos.
- Cancelamento: só `authorized`; grava evento; status e `fiscalStatus` → `canceled`.
- Unique parcial: segundo pedido no mesmo documento após `canceled`; bloqueio se ainda houver vivo.
- Estorno: 409 com `authorized`; libera com só `pending`/`canceled`/sem pedido.
- API de eventos: lista vazia e com cancelamento.
- UI coberta por testes de API/contratos; E2E do menu fica fora se o projeto não tiver harness para isso.

## Sequência sugerida de implementação

1. Migration (`nfse_events` + unique parcial).
2. Builder/assinatura do evento + cliente HTTP SEFIN (espelho do send).
3. `POST /nfse/:id/cancel` + `GET /nfse/:id/events`.
4. Ajuste do pedir NFS-e e do estorno da OS.
5. Menu de contexto + confirmação + painel de eventos na lista.
6. Testes de integração.
