# Visualização e impressão da DANFSe

## Para que serve

Na lista `/nfse`, a empresa abre a DANFSe de uma nota autorizada, confere os dados e imprime. O documento segue o modelo nacional (NT 008 / DANFSe v2.0): A4 retrato, uma página, blocos oficiais, QR Code de consulta pública e aviso de homologação quando couber.

Pedir e enviar continuam na ordem de serviço. A lista em si não muda de colunas, busca ou filtros.

## O que já existe

- Lista `/nfse` (`ListNfse`) com pedidos em `nfse_requests`.
- Nota autorizada grava `accessKey`, `nfseXml`, série, número da DPS e ambiente.
- Entradas já têm o padrão: `GET /inbound/:id/danfe` → JSON → HTML em diálogo com iframe → `contentWindow.print()`.
- Não há template DANFSe, endpoint de visualização nem ação na lista de NFS-e.
- A API ADN de geração de DANFSe está sobrestada; a geração fica no ERP a partir do XML local.

## Decisões

- Identificadores em inglês. Rótulos e mensagens em português.
- Entrada só na lista `/nfse` (ícone na linha). Sem abertura pela ordem de serviço nesta entrega.
- Só status `authorized` com chave de acesso. Ícone desabilitado nos demais casos.
- Clique na linha continua sem navegar. Só o ícone abre a DANFSe.
- UX igual às Entradas: diálogo com prévia em iframe + botão **Imprimir**.
- Fonte dos dados: `nfse_requests.nfse_xml` do tenant. Sem regenerar da OS, sem ADN, sem SEFIN na visualização.
- Layout: modelo permitido da NT 008 (Anexo I). Blocos, campos, QR, logo e aviso de homologação. Sem canhoto. Sem fidelidade milimétrica de coordenadas tipográficas; tamanhos mínimos e estrutura dos blocos importam.
- QR Code: `https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave={accessKey}`.
- Homologação (`tpAmb` / ambiente 2): texto vermelho **NFS-e SEM VALIDADE JURÍDICA** abaixo do título.
- Logo oficial da NFS-e embutida como asset local (sem hotlink em runtime).
- Campos só do XML. Ausentes: string vazia ou texto fixo da NT 2.3 (“não identificado”, “não sujeita ao ISSQN”, “destinatário é o próprio tomador”, etc.).
- Totais aproximados de tributos (Lei 12.741/2012), quando existirem no XML, entram em Informações Complementares.

## Fora desta entrega

- Abrir DANFSe pela ordem de serviço.
- Download ou visualização do XML.
- Canhoto.
- PDF no servidor ou biblioteca de PDF.
- Uso da API ADN / portal para montar o documento.
- Cancelamento, reenvio ou detalhe administrativo da nota.
- Fidelidade tipográfica milimétrica (coordenadas X/Y do anexo).

## Arquitetura

```
ListNfse (ícone)
  → GET /nfse/:requestId/danfse
  → lê nfse_xml + valida authorized/tenant
  → readDanfse(xml) → DanfseView
  → danfseDocument(view) → HTML
  → Dialog + iframe srcDoc + Imprimir
```

## API

`GET /nfse/:requestId/danfse`

- Autenticado e filtrado pelo tenant.
- Sucesso: `200` + `DanfseView`.
- Pedido inexistente / outro tenant: `404`.
- Status diferente de `authorized`: `400` — mensagem clara de que a DANFSe só vale para nota autorizada.
- Sem `nfse_xml`: `400` — “XML da NFS-e não está disponível para a DANFSe.”
- XML inválido ou incompleto demais para montar o documento: `400` — “Não foi possível montar a DANFSe a partir do XML.”

### `DanfseView` (resumo)

JSON tipado com, no mínimo:

- identificação: chave (50 dígitos), número da NFS-e, competência, emissão da NFS-e, número/série/emissão da DPS, emitente da NFS-e, situação, finalidade, município do emitente, ambiente gerador, tipo de ambiente
- prestador, tomador (e destinatário/intermediário quando existirem no XML)
- serviço prestado (código nacional, municipal se houver, descrição)
- tributação municipal (ISSQN), federal (exceto CBS) se houver, IBS/CBS se houver
- valores totais e líquido
- informações complementares
- `qrCodeUrl`
- flag ou ambiente para o aviso de homologação

Tipos no API e no cliente da UI, no espírito de `DanfeView` das Entradas (sem obrigar pacote shared nesta entrega).

Parser: `readDanfse` no API (espelha `readDanfe` das Entradas).

## UI

- `ListNfse`: ícone `FileText` na linha; habilitado só com `authorized` + `accessKey`.
- Diálogo **DANFSe**: loading, erro da API, iframe com `srcDoc`, botão **Imprimir**.
- `nfseService.danfse(id)` no cliente.
- `danfseDocument(view)` monta o HTML a partir do template e embute o QR Code (imagem/SVG) gerado a partir de `qrCodeUrl`.
- Template: `doc/templates/danfse.html` (A4, uma página, bordas e sombreamento dos títulos/blocos conforme NT).

## Template (blocos)

Ordem alinhada à NT 008:

1. Cabeçalho (logo, DANFSe v2.0, município, ambiente, QR, texto de autenticidade; aviso de homologação se aplicável)
2. Identificação da NFS-e (inclui chave)
3. Prestador / Fornecedor
4. Tomador / Adquirente (ou texto fixo se ausente)
5. Destinatário (suprimido/simplificado se for o próprio tomador ou ausente)
6. Intermediário (ou texto fixo se ausente)
7. Serviço prestado
8. Tributação municipal (ISSQN) — ou texto de operação não sujeita
9. Tributação federal (exceto CBS), se houver dados
10. Tributação IBS/CBS, se houver dados
11. Valor total
12. Informações complementares

Sem canhoto; descrição e/ou complementares ocupam o espaço liberado.

## Erros na UI

- Ícone desabilitado: sem chamada.
- Resposta de erro: mensagem no diálogo.
- Imprimir só com HTML carregado; falha do iframe mostra toast como no DANFE.

## Testes

- Unitário: XML autorizado de amostra → `DanfseView` com chave, prestador, tomador, serviço e totais.
- Unitário / smoke do HTML: contém chave, URL do QR e, em homologação, o aviso sem validade jurídica.
- Integração: `GET` com pedido autorizado e XML → 200; pending → 400; sem XML → 400; outro tenant → 404.

## Relação com a lista

A spec da lista (`2026-11-26-lista-nfse-design.md`) tirava impressão/DANFSe do escopo. Esta entrega acrescenta só a visualização/impressão pela lista; o restante da lista permanece.
