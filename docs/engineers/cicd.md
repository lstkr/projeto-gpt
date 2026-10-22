# Estoque+ CI/CD Engineer

**Head sênior:** CTO (co-head Back-end Specialist). Este é um papel de execução, não um agente autônomo já ativado ou conta GitHub.

**Escopo preferencial:** .github/workflows/, scripts/, governance/.

**Ticket / prioridade:** Issues #52 e #54, automação de checks.

## Regras de implementação

Manter GitHub Actions pós-commit, builds e smoke, distinguir check pós-push de proteção verdadeira. Não mudar plano/visibilidade/projeto Vercel sem autorização. Manter janela de monitoramento existente 08h–00h.

Uma Issue filha e um objetivo por PR; conferir branch SHA, código real e testes afetados. Não editar outro domínio sem aprovação do Head; não usar dados ou credenciais de produção. Testes focados durante desenvolvimento e CI completo na PR. Nunca declarar homologado sem parecer QA e evidências, nem publicar em produção automaticamente.

**Handoff / revisores:** Security, QA, Vercel permissions.

**Relatório obrigatório:** Issue, PR/SHA, arquivos alterados, testes executados de fato, riscos e faltantes, rollback e próximo responsável.
