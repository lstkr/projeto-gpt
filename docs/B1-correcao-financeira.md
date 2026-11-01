# B1 — correção financeira com motivo e histórico

Base: main 133bcd7. Somente trabalho local e PRs; aplicação remota exige OK de Lucas.

## Por quê
Uma correção precisa guardar valor anterior, novo, autor e motivo.
Duas telas não podem sobrescrever uma à outra sem aviso.

## Contrato e entregas
- Banco primeiro; interface em PR dependente, preparada sem remover a redução de fotos #185.
- `cash_closing_save(p_token,p_entry)` preserva criação; duplicidade nunca sobrescreve.
- Correção exige id, expectedRevision textual, correctionReason (1–300) e requestId UUID.
- Banco verifica Gestor/unidade; grava revisão, valor e histórico na mesma operação.
- Repetir tentativa idêntica confirma sem nova alteração; conteúdo diferente é recusado.
- `cash_closings_list` devolve revision textual; `cash_closing_audit_list` devolve histórico autorizado.
- Data/caixa fixos; centavos exatos; valores anteriores, autor e motivo preservados.
- Rascunho antigo em .task-work/B1 preservado. Migração vazia e contrato incompatível foram substituídos.
- PR #146 não foi integrada nem fechada; sua branch não é a base desta entrega.

## Reversão e risco
`db/rollback/cash_closing_corrections.sql` suspende novas correções no servidor.
Preserva valores, versões, histórico, leitura e criação; não restaura sobrescrita insegura.
Valor errado deve ser revertido por outra correção com motivo, mantendo os dois eventos.
Auditoria bloqueia resets antigos que tentem apagar fechamentos/usuários relacionados.
Antes de aplicar remotamente: backup verificável, revisão e OK específico; sem produção.

## Evidência e teste futuro na cafeteria
Replay e reversão passaram em PGlite/PostgreSQL 18.6; PG15/17 e concorrência real dependem do CI.
1. Corrigir fechamento de teste sem motivo → recusar; com motivo → salvar.
2. Abrir histórico → mostrar antes/depois, autor, horário e motivo.
3. Salvar na primeira de duas abas → a segunda deve recusar alteração antiga e preservar campos.
4. Entrar como funcionário → não permitir correção nem histórico administrativo.
