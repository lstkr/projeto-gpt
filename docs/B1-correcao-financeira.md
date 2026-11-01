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

## Instalação limpa e reset deliberado
O instalador de #173 inclui as 10 migrações, inclusive B1, sem remover sua transação.
`db/operations/reset-test-data.sql` preserva contas e recusa exclusão de caixas com histórico.
O reset total é separado: `db/operations/reset-test-environment.sql`, somente pelo proprietário
`postgres`, exige nesta mesma conexão, antes do arquivo:
```sql
set estoque.confirm_full_reset='APAGAR TODAS AS CONTAS E HISTORICO DA HOMOLOGACAO';
```
Essa operação apaga também usuários, senhas, caixas e histórico da aplicação; exige
NOVO OK específico, confirmação do projeto de homologação e cópia de recuperação.
Depois, o proprietário deve refazer o bootstrap; o agente não o executa com suas credenciais.
Não apaga schemas gerenciados `auth`/`storage`, estrutura/migrações, nem o snapshot B1 de recuperação.
Não foi executado remotamente. Aplicar B1 não autoriza executar esse reset.

## Correção do conflito entre abas (aguarda novo OK)
A rejeição manual com SQLSTATE 40001 ativa repetição infinita no PostgREST 14.
A migração 20261101223012 troca somente esse erro por PT409 (HTTP 409), sem gravar a segunda correção.
A instalação limpa aplica a nova migração após B1; definição divergente interrompe a aplicação.
A reversão continua suspendendo correções por db/rollback/cash_closing_corrections.sql.
Nunca restaurar o erro 40001: isso reintroduziria a repetição. Valores e histórico ficam preservados.
Processos já repetindo podem continuar após a migração: identificar por logs 40001/mensagem B1/process_id
e cruzar com pg_stat_activity (pid, usename, state, query_start, wait_event_type, wait_event),
filtrando usename='authenticator'. Não imprimir query, que pode conter dados sensíveis.
Encerrar somente os processos confirmados exige autorização explícita; não foi executado.
Fonte: https://supabase.com/kb/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions
