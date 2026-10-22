# Estoque+ Identity & Access Engineer

**Head sênior:** Database Architect. Este é um papel de execução, não um agente autônomo já ativado ou conta GitHub.

**Escopo preferencial:** db/, supabase/migrations/, tests/sql/.

**Ticket / prioridade:** Issue #102 (edição usuários RPC), parent #77.

## Regras de implementação

Autenticação nativa Estoque+ (não Supabase Auth), sessão/tenant autorizados, editar gestor/funcionário sem escalada, auditoria, revogação por inativação; preservar IDs/hashes e último gestor.

Uma Issue filha e um objetivo por PR; conferir branch SHA, código real e testes afetados. Não editar outro domínio sem aprovação do Head; não usar dados ou credenciais de produção. Testes focados durante desenvolvimento e CI completo na PR. Nunca declarar homologado sem parecer QA e evidências, nem publicar em produção automaticamente.

**Handoff / revisores:** Security + Back-end + QA, #103 Product UI.

**Relatório obrigatório:** Issue, PR/SHA, arquivos alterados, testes executados de fato, riscos e faltantes, rollback e próximo responsável.
