# Estoque+ — Estado e retomada

Atualizado: 2026-10-21. Verificar GitHub e SHA antes de editar: a cópia local antiga de integração não representa mais main.

## Integração concluída
- PR #40 integrado; PR #41 integrado em `3586a1015b2139a6132f165daee9da28dc80d190`, com rate limiting distribuído.
- PRs #20/#33 integrados. PRs antigos #7/#13/#17/#18/#22/#24/#26/#29/#37/#38 encerrados como supersedidos; não reaplicar as branches antigas.
- Issues operacionais #23/#25/#27/#28/#30/#31/#32 encerradas conforme registro da #30.
- Build check e Receipt regression tests aprovados na main 3586a10; status Vercel success. SQL fiscal e sessão PG15/17 aprovados no HEAD do PR #41 (22cb145).
- Migrações no banco existente registradas na #30/#40/#41; preservação das contas e senhas registrada pelo responsável. Esta verificação não executou novas migrações.
- O gestor autorizou a integração sem homologação manual completa. CI/deploy aprovados não significam que os cenários de navegador já foram homologados.

## Pendências atuais
- #35: leitor de código de barras e códigos configuráveis de balança — roadmap P2.
- #36: impressão A4/térmica — roadmap P2.
- Ambas foram explicitamente reservadas para uma rodada futura; não fechar como concluídas sem implementar.
- Executar os cenários manuais em governance/HOMOLOGATION_CHECKLIST.md e registrar problemas concretos.
- Antes de futuro supabase db push, reconciliar histórico das migrações aplicadas via MCP conforme #30; não reaplicar bundles indiscriminadamente.

## Publicação
A aplicação usa Vercel. O workflow legado Pages tentava criar um site ausente e falhava por permissão da integração (run 39618843513). Pages passa a ser execução manual explícita, para site previamente configurado; somente docs/index.html compõe seu artefato, sem publicar perfis/auditorias.

## Continuidade
Antes de retomar: conferir main, issue alvo e checks. Preservar trabalho local antigo sem sobrescrever a main com snapshots obsoletos.
Para cada alteração: registrar PR, SHA, resultados efetivos, riscos e próximo passo.
Preservar credenciais e estoque. Não descrever testes manuais não executados como aprovados.
