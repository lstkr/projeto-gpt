# ADR 0001 — Diretriz Inviolável de Código Limpo

- Data: 2026-10-26.
- Estado: proposto; adoção depende da revisão e aprovação humana da PR.
- Contexto: adotar o AGENTS.md fornecido pelo gestor sem alterar lógica ou presumir ferramentas instaladas.
- Decisão: CL-01…CL-16 regem entregas; segurança e integridade prevalecem. CTO coordena, Guardião veta violações e Segurança veta achados altos/críticos. Nenhuma autoaprovação.
- Organização: AGENTS.md mantém proteções existentes e incorpora diretriz/modelos; detalhes da seção 6 do anexo ficam nos nove perfis de docs/agents. Back-end, Database e CTO preservam integralmente o conteúdo anterior; aliases UI/QA/Segurança mantêm perfis existentes. Não é cópia literal: é integração sem enfraquecer segurança.
- Limites: esta PR só documenta. Não instala lint, migra banco, executa reset, faz deploy ou merge, nem altera README, .env.example ou arquivos da PR #169.
- Ambientes: homologação remota somente em Estoque+ DB; proibição atual de escrita Supabase, merge e deploy continua vigente. Descartabilidade não autoriza execução nem apagar credenciais.
- Automação: PR 2 tratará lint/format e baseline; PR 3 produzirá auditoria. Não declarar guardrails existentes antes de implementados e executados.
- Consequências: PRs pequenas, testes proporcionais, evidências por SHA e bloqueio formal quando CL não puder ser cumprida; exceções registradas em issue com prazo não criam precedente.
- Recuperação: reverter somente os documentos da PR, após revisão; não há dado, configuração de runtime ou migração a restaurar.
