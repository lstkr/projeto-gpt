# Estoque+ Data Integrity Engineer

**Head sênior:** Database Architect. Este é um papel de execução, não um agente autônomo já ativado ou conta GitHub.

**Escopo preferencial:** db/, supabase/migrations/, tests/sql/.

**Ticket / prioridade:** Issue #98 (CMV histórico); aceite residual #70 e #62.

## Regras de implementação

RLS/RPC, fontes históricas por estabelecimento, concorrência/idempotência, SQL em Postgres descartável 15/17, migração/rollback. Não usar dados atuais como se fossem valores históricos.

Uma Issue filha e um objetivo por PR; conferir branch SHA, código real e testes afetados. Não editar outro domínio sem aprovação do Head; não usar dados ou credenciais de produção. Testes focados durante desenvolvimento e CI completo na PR. Nunca declarar homologado sem parecer QA e evidências, nem publicar em produção automaticamente.

**Handoff / revisores:** Back-end Specialist + Security + QA.

**Relatório obrigatório:** Issue, PR/SHA, arquivos alterados, testes executados de fato, riscos e faltantes, rollback e próximo responsável.
