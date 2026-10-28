# Recebimento idempotente de arquivos fiscais — PR 1a

Status: proposto para revisão; issue #174; base aprovada `87407e3`. Sem aplicação remota.

## Decisão e contrato

`pending_receipt_receive(p_token text, p_file jsonb, p_drafts jsonb)` recebe
`fileName`, `mime`, `base64`, `channel` (`celular`/`desktop`) e opcional `sha256`.
O banco calcula SHA-256 dos bytes decodificados e confere o hash informado.
`p_drafts` contém de 1 a 20 objetos: os cupons distintos da mesma foto.
A mesma transação arquiva todos; qualquer erro desfaz o lote inteiro.

`private.receipt_uploads` tem unicidade `(tenant_id, file_sha256)`. Cada pendência
tem `upload_id` e `upload_part`; o vínculo composto impede unidade divergente.
O conflito no índice espera o vencedor. Sob READ COMMITTED, a consulta seguinte
retorna seus IDs; sob isolamento mais forte, o consumidor deve repetir `40001`.
O replay nunca troca bytes, quantidade de cupons, rascunhos, autoria ou canal.

A resposta contém `ok`, `uploadId`, `reused`, `submittedBy` (`id`, `displayName`),
`submittedAt`, `channel` e `receipts` (`id`, `part`, `revision`, `state`).
Nome e horário vêm do servidor; `channel` é declaração do cliente validada por
allowlist, não atestado de dispositivo. `draft.source` continua indicando a
proveniência fiscal, e `checkedBy` não serve como autoria do envio.

`pending_receipt_submissions(p_token)` retorna por pendência `id`, `submittedBy`,
`submittedAt` e `channel`, filtrando a unidade e exigindo `fiscal.pending.read`.
Complementa a lista existente sem redefinir sua assinatura ou conteúdo.

## Compatibilidade e dependências

Os RPCs antigos permanecem intactos; o desktop ainda os utiliza. Não há backfill
nem fusão de duplicatas históricas: notas e IDs existentes são preservados.
A deduplicação desta PR vale para o novo contrato, não para o caminho legado
nem para fotos recomprimidas (bytes diferentes). Idempotência fiscal por chave
continua sendo uma proteção distinta. Registros cancelados não são ressuscitados.
Se manutenção remover todas as pendências do envio, o replay falha com `55000`;
não retorna sucesso vazio. Reset/restore com esta tabela exige revisão específica.

Não modifica `require_actor`, login ou validadores de sessão: os locks adicionais
da #133 continuam uma dependência de segurança para homologação. A #153 redefine
ações de pendências e autoria fiscal; integrar depois por nova migração, mantendo
este contrato de envio separado. Nenhum comportamento de QR externo foi alterado.

PR 1b acrescentará magic bytes e quota. PR 2 preparará imagens. PR 2b exigirá
confirmação por nota, com padrão de não enviar se a política do fornecedor não
for verificada. PR 3 ligará a interface ao contrato e exibirá remetente/horário.
Para arquivar antes do OCR, a PR 3 deve enviar primeiro um rascunho manual e
definir atualização/segmentação posterior com revisão: um replay não é edição.
PR 4 tratará o restante da interface móvel. PWA e fila offline permanecem adiadas.

## Migração, verificação e recuperação

Aplicar a migration versionada somente após as nove migrations da base aprovada,
em ambiente autorizado. O roteiro de instalação limpo continua congelado nas nove
migrations revisadas; esta expansão deve ser aplicada separadamente após ele.
Não existe autorização de produção nem necessidade de reset.

Teste local/CI: `python -B tests/sql/run-receipt-upload.py`, com `PGHOST` loopback,
`PGDATABASE=estoque_rpc_test*` vazio e `psql` local (ou prefixo Docker explícito).
Fixtures sintéticas; duas conexões com barreira e observação real do lock.
O workflow de tenants executa o teste em PostgreSQL 15/17.

Recuperação conservadora: suspender o consumidor novo e revogar EXECUTE dos dois
RPCs novos de `anon` e `authenticated`. Manter tabela, colunas e originais para
recuperação; o desktop anterior continua funcionando. Não apagar metadados,
pendências ou usuários. Remoção estrutural exige plano e autorização separados.
