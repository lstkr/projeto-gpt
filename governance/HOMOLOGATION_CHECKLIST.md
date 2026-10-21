# Estoque+ — Checklist de homologação / release candidate

Atualizado: 2026-10-21. PRs #40, #47, #48 e #49 **integrados**. A aplicação já está publicada para testes de homologação; **não declarar uso comercial homologado** enquanto a verificação manual permanecer incompleta.

## Banco existente autorizado para testes manuais (decisão do gestor)
- **Autorização 20/10/2026:** reutilizar o Supabase atual `dpauqdihvhbbaellwjav`, SEM alterar contas existentes. Não criar novo banco agora.
- **Regra de preservação:** manter `private.app_users`, `password_hash`, `private.app_sessions` e os dados atuais. Não resetar senhas, reexecutar `db/schema.sql` no banco existente, truncar tabelas, semear usuários de teste por cima dos existentes ou executar SQL destrutivo.
- **Atualização autorizada e executada em 21/10/2026:** migrações remotas `20261021131407` (cópias privadas de recuperação) e `20261021131601` (ACL fiscal + notas + sessão RPC + integridade transacional). Scripts SQL de origem foram conferidos com o PR #40; **não** executado `db/schema.sql` nem SQL para alterar usuários/senhas.
- Resultado verificado: 2 usuários e 16 sessões **idênticos** aos registros originais; 1 estoque e 5 notas com dados históricos idênticos. `public.inventory_validate_session`, `public.pending_receipt_cancel`, `private.has_permission` e `public.inventory_permissions_list` agora **instaladas**; chamadas RPC com token inválido foram rejeitadas pelo papel `anon`.
- As cópias são **internas ao próprio projeto Free**, não equivalem a backup externo nem a PITR. Exportação off-site continua recomendada. Não excluir cópias sem plano de retenção e recuperação.
- Histórico CLI: versões locais de SQL `20261019201520` e `20261020221500` foram aplicadas no bundle remoto `20261021131601` e precisam de reconciliação no fluxo `supabase migration repair` antes de futuros `db push`; nunca reaplicar cegamente.
- **Banco atualizado não significa homologação concluída**. Ainda faltam o login via interface com contas existentes, testes HTTP/PostgREST e conferência fiscal manual.
- Ações de conferência/lançamento/cancelamento alteram o estoque compartilhado; usar notas anonimizadas e procedimentos de recuperação. Evitar testes destrutivos com documentos reais.

### Opt-in de Vercel Preview no banco existente
- Por padrão Preview permanece bloqueada. Somente a branch `integration/homologacao-clean-main-20261020` pode usar o banco atual, e apenas com `ESTOQUE_ALLOW_SHARED_DB_PREVIEW=true`.
- Na Vercel, definir **apenas para Preview dessa branch**: `NEXT_PUBLIC_SUPABASE_URL` (URL HTTPS do projeto atual), `NEXT_PUBLIC_SUPABASE_ANON_KEY` (chave publishable/anon, **nunca** service_role) e `ESTOQUE_ALLOW_SHARED_DB_PREVIEW=true`.
- `VERCEL_GIT_COMMIT_REF` é fornecido pela Vercel; o código verifica a branch no servidor e no navegador. Se não for informado, a Preview falha fechada. Não criar login/senha nos arquivos de configuração.
- Não ativar o opt-in para outras branches ou ambientes Production. A proteção não substitui login por sessão própria e permissões PostgreSQL.
- Em 21/10/2026 a reconexão da Vercel permitiu verificar por HTTP a página pública e o worker PDF.js 6.4.299 (200). A consulta de variáveis de ambiente e logs por escopo do time `lstkr` continua 403. **Não presumir** quais variáveis estão configuradas nem permitir compartilhamento de dados do Preview sem checar esse escopo.

## Gates automatizados
- [x] CI SHA de produção `dce41d4` decorrente de PRs #47/#48/#49: `npm ci`, `npm audit --audit-level=high`, `npm test`, testes PDF/worker e SQL de sessão/fiscal PostgreSQL 15 e 17 aprovados nos HEADs finais dos PRs. O lockfile foi integrado.
- [ ] Rodar cenários HTTP reais para 401 com sessão expirada, 403 permissão negada, 429 limite de chamadas (limite distribuído já implementado na #41), 503 RPC indisponível, 502/504 terceiro, payload inválido e máximo. A etapa automatizada `Production read-only smoke` valida 401 sem sessão, 405 método inválido, homepage e worker público sem utilizar contas reais; só marcar como aprovada após workflow verde.
- [ ] SQL com 2 conexões: cancelamento × lançamento, lançamento × lançamento, revisão nula/obsoleta, retry e falha parcial. Sem duplicar saldo, nota ou movimento.
- [x] Consultar Supabase Advisors após migração: existem alertas de SECURITY DEFINER públicos com sessão própria (requer auditoria) e `private.count_guard` sem search_path fixo; FKs sem índice. Não suprimir ou alterar as RPCs sem testar o modelo de autenticação.

## Casos manuais obrigatórios (evidência por SHA)
| Cenário | Resultado | Evidência |
| --- | --- | --- |
| Login/logout, sessão inválida e revogação | pendente | |
| Funcionário importa nota e salva conferência pendente | pendente | |
| Gestor configura permissões fiscais do funcionário | pendente | |
| Cancelar NF: funcionário negado pelo banco, gestor permitido | pendente | |
| OCR JPG/PNG, PDF térmico e lote de cupons (inclusive foto desfocada) | pendente | |
| QR local, fallback externo e aviso de privacidade (dados anonimizados) | pendente | |
| Consulta pública SVRS e falha/timeout sem travar OCR | pendente | |
| Divergências código com zeros, unidade, desconto, totais | pendente | |
| Conferência linha a linha obrigatória e persistência após reload | pendente | |
| Lançar uma vez, reabrir e impedir lançamento/cancelamento duplicado | pendente | |
| Contagem física, ajuste, fornecedor, caixa com PDF e preço de custo | pendente | |
| Mobile 375px, teclado e mensagens de erro de sessão | pendente | |

## Condições de bloqueio
- PR #40 já foi integrado, e a publicação ocorreu com autorização do gestor para iniciar testes manuais. A homologação real e a confirmação de variáveis de Preview continuam **pendentes**. As RPCs foram instaladas em 21/10/2026.
- PRs dependentes **não são equivalentes** a PR integrado: seus checks isolados não comprovam o candidato.
- Repo privado não significa docs no GitHub Pages privados; notas operacionais ficam em governance/.
- Vercel Git integration pode criar preview automaticamente ao fazer push; **não confiar no preview sem verificar o banco ao qual está conectado**.
- Exposição fiscal de terceiros: fallback envia automaticamente um recorte do QR; dados próximos ao rodapé podem incluir informações sensíveis.
- O cancelamento existente apaga file_bytes; rollback SQL NÃO restaura o original. Definir retenção e backup antes de produção.
- O `package-lock.json` está versionado desde o PR #47, e os checks usam `npm ci` desde então.

## Retomada em uma única execução
1. Ler esta checklist, consultar os checks da `main` atual e a issue de homologação #50; não tratar o PR #40 como pendente.
2. Identificar **um** bloqueador reprodutível, corrigir com teste direcionado.
3. Atualizar issue com branch/SHA, comandos, resultado, pendências e próximo passo.
