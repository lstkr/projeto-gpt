# Agentes do Estoque+

Este diretório contém as especialidades operacionais do projeto. **Todos os agentes devem seguir primeiro [AGENTS.md](../../AGENTS.md)**, que centraliza os padrões compartilhados de segurança, integridade, testes e colaboração.

## Perfis disponíveis

| Perfil | Competências e responsabilidade |
| --- | --- |
| [Database Architect](database-architect.md) | PostgreSQL, Supabase, Database Migration Specialist, Fiscal Data Integrity, RLS/RPC, transações, auditoria e recuperação. |
| [Back-end Specialist](backend-specialist.md) | Node.js/Next.js, APIs, autenticação/autorização no servidor, integrações fiscais, concorrência, API Contract Testing, CI/CD e testes. |
| [UI/UX Specialist](ui-ux-specialist.md) | React/Next.js, design system, UX, acessibilidade, responsividade, desempenho e testes de interface. |
| [Security Specialist](security-specialist.md) | Red Team/AppSec, revisão de commits, SCA, segredos, ataques simulados, auth/RBAC e integridade SQL em banco descartável. |
| [QA Specialist](qa-specialist.md) | Testes independentes, autorização/isolamento, OCR real, concorrência, evidências e parecer antes da homologação. |

## Como usar no ChatGPT

Abra **uma conversa separada para cada especialidade** dentro do projeto Estoque+. Exemplos de mensagens iniciais:

- **Banco de dados:** “Atue como Estoque+ Database Architect, seguindo AGENTS.md e docs/agents/database-architect.md no repositório lstkr/projeto-gpt.”
- **Back-end:** “Atue como Estoque+ Back-end Specialist, seguindo AGENTS.md e docs/agents/backend-specialist.md no repositório lstkr/projeto-gpt.”
- **Segurança:** “Atue como Estoque+ Security Specialist, seguindo AGENTS.md e docs/agents/security-specialist.md no repositório lstkr/projeto-gpt; tente quebrar o código em testes isolados e registre evidências por SHA.”
- **Front-end:** “Atue como Estoque+ UI/UX Specialist, seguindo AGENTS.md e docs/agents/ui-ux-specialist.md no repositório lstkr/projeto-gpt.”

Os documentos **não criam chats nem agentes autônomos automaticamente**. Eles fornecem instruções reutilizáveis para o especialista solicitado.

## Coordenação

- Security: audita independentemente cada commit enviado ao GitHub via workflow e realiza revisão contextual de alterações críticas, orientando correções dos donos das camadas.
- Banco: lidera alteração de schema, migrações, privilégios, RPC/RLS e garantias persistentes.
- Back-end: lidera endpoints, contratos de API, autenticação no servidor, integrações e entrega.
- UI/UX: lidera layout, acessibilidade, componentes, formulários e fluxos visuais.
- Alterações que atravessam camadas exigem **acordo de contrato**, análise de riscos e testes de integração antes de merge.
- Cada entrega deve citar as mudanças realizadas, testes efetivamente executados, riscos, pendências e eventual plano de rollback.

**Regra central:** nenhuma alteração pode comprometer a integridade do estoque, a segurança dos usuários ou funcionalidades existentes.
