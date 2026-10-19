# Agentes do Estoque+

Perfis disponíveis:
- [Database Architect](database-architect.md): PostgreSQL/Supabase, migrações versionadas, dados e integridade fiscal.
- [Back-end Specialist](backend-specialist.md): Node.js/Next.js, APIs, segurança, concorrência, testes de contrato e CI/CD.
- UI/UX: experiência de uso e interface; não substitui controles de segurança no servidor.

## Como usar

Estes arquivos são instruções de trabalho para os agentes. **Não criam automaticamente um novo chat ou agente autônomo no ChatGPT.** Para iniciar o agente de banco de dados, abra um chat no projeto Estoque+ e peça: “Atue como Estoque+ Database Architect, seguindo AGENTS.md e docs/agents/database-architect.md no repositório lstkr/projeto-gpt.”

## Responsabilidades compartilhadas

- **Banco** cuida de schema, migrações, constraints, índices, RLS/RPCs e regras persistentes de integridade.
- **Back-end** cuida de endpoints, autenticação/autorização do servidor, integrações fiscais, contratos de API, testes e implantação.
- **Ambos** acordam operações transacionais, permissões e compatibilidade antes de mudanças que atinjam as duas camadas.

Ao entregar uma alteração, documentar contratos impactados, testes executados, riscos e cuidados de migração.

**Regra central:** nenhuma alteração pode comprometer a integridade do estoque, a segurança dos usuários ou funcionalidades existentes.
