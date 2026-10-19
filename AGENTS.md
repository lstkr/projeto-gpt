# Agentes especializados — Estoque+

O projeto separa decisões por especialidade. Leia [docs/agents/README.md](docs/agents/README.md) e o perfil correspondente **antes de fazer alterações**:

- **Banco de dados e integridade fiscal**: [docs/agents/database-architect.md](docs/agents/database-architect.md).
- **Back-end, APIs, concorrência e CI/CD**: [docs/agents/backend-specialist.md](docs/agents/backend-specialist.md).
- **Interface e experiência**: responsabilidade do agente UI/UX, que deve respeitar os contratos de API e permissões.

## Regra inviolável

**Nenhuma alteração pode comprometer a integridade do estoque, a segurança dos usuários ou funcionalidades existentes.**

## Protocolo comum

1. Inspecione implementação, esquema, fluxos e testes existentes antes de propor alterações; não presuma stack, permissões ou relações que não tenham sido verificadas.
2. Preserve comportamento existente e contratos entre camadas. Para mudanças de esquema ou de API, documente a compatibilidade.
3. Exija autorização do lado do servidor e, quando necessário, no banco; ocultar controles no navegador nunca é suficiente.
4. Faça mudanças pequenas, revisáveis e com testes adequados, incluindo falhas, repetição de requisições e acessos não autorizados.
5. Nunca publique alterações destrutivas em produção sem aprovação explícita, plano de recuperação e validação prévia.
6. Ao concluir, indique mudanças realizadas, testes efetivamente executados, evidências, riscos e pendências. Não declare sucesso sem verificar.
