# Estoque+ — Preparo de merge na main

Atualizado em 21/10/2026. PR integrador: #40 (`integration/homologacao-clean-main-20261020`).
Fonte da verdade: o SHA atual, verificações do GitHub e o estado real do banco. Este arquivo registra pré-condições; **não autoriza merge, migração ou deploy por si só**.

## Git e reconciliação
- #40 foi criado a partir da `main`; comparar novamente `main...integration/homologacao-clean-main-20261020` imediatamente antes do merge. Esperado: `behind_by=0`, `mergeable=true`.
- Escopo fiscal incorporado/reconciliado: #7, #13, #17 → #18 → #38, #26 → #29, #37, mais a interface já integrada na `main`.
- Inclusões adicionais nesta revisão: #24 (teclado, foco, semântica, legibilidade móvel; o modal de NF não pode fechar durante exclusão), #22 (ordenação compartilhada de duplicatas com teste). **Não** sobrescrever API de PDF.js/guard de sessão com as implementações legadas de #22.
- PRs independentes #20 e #33 (perfis/documentação dos agentes), e demais partes documentais/refatorações do #22, permanecem entregas separadas; não fechar, mesclar à força ou descartar mudanças desses PRs apenas porque #40 está integrável.
- Jamais fazer merge isolado das branches encadeadas #17/#18/#38 ou #26/#29 após #40, sob risco de reaplicar alterações antigas. Verificar diffs de cada PR antes de marcar como supersedido.
- Validar `npm test`, `npm run build`, workflow `Native session RPC tests` (PG 15/17), `Fiscal integrity SQL tests` (PG 15/17), `Receipt regression tests`, status Vercel **no SHA final**, sem usar resultado de SHA anterior.

## Banco existente — migração autorizada e executada (21/10/2026)
- Gestor autorizou **atualizar o Supabase compartilhado** e preservar logins/senhas. Inspeção e execução conduzidas conforme `docs/agents/database-architect.md` (PR #20), com preflight RLS/ACL e testes.
- O projeto utiliza o plano Free. A plataforma **não oferece backup automático diário neste plano**; houve criação de cópias privadas **dentro do mesmo banco**, portanto **não são backup externo nem proteção contra perda do projeto**. Exportação off-site com `supabase db dump` continua recomendada antes da homologação intensiva.
- Migração Supabase `20261021131407_estq_premerge_protected_snapshots_20261021`: preservou registros atuais em `private.estq_backup_app_users_20261021`, `private.estq_backup_app_sessions_20261021`, `private.estq_backup_shared_inventory_20261021`, `private.estq_backup_pending_receipts_20261021` e 8 definições de função em `private.estq_backup_function_defs_20261021`. Todas com RLS e sem acesso de leitura `anon/authenticated`. **Não publicar conteúdo, hashes ou tokens.**
- Migração Supabase `20261021131601_estq_homologation_acl_session_fiscal_20261021` aplicada em transação: fontes `db/access-permissions.sql`, `db/pending-receipts.sql`, `supabase/migrations/20261019201520_inventory_validate_session.sql` e `supabase/migrations/20261020221500_fiscal_write_integrity.sql`. **Não** executado `db/schema.sql` de instalação limpa. Funções/constraints/RLS transacionais, sem UPDATE/DELETE de contas, sessões ou estoque.
- **Verificação pós-migração, sem revelar dados pessoais:** 2 contas e seus registros completos (incluindo hashes de senha) **idênticos** ao backup, 16 sessões idênticas, 1 snapshot de estoque idêntico, 5 notas com conteúdo histórico idêntico (3 pendentes, 2 lançadas). Novas colunas de cancelamento permanecem vazias; nenhum cancelamento realizado.
- RPCs `inventory_validate_session`, `pending_receipt_cancel`, `private.has_permission`, `inventory_permissions_list` e `inventory_permission_set` presentes. Papel `anon` não possui acesso direto às tabelas privadas/fiscais. Testes de token inválido confirmaram erro de autenticação e rejeição de cancelar/alterar permissões. Nenhum funcionário recebe permissão de cancelar NF.
- Supabase Advisors: avisos `SECURITY DEFINER` para RPCs públicas com **token de sessão próprio** exigem revisão de cada função antes de tornar o serviço público; outras observações incluem `private.count_guard` com `search_path` não fixo, índices de FKs e tabelas de backup sem PK (cópias imutáveis). Referência: https://supabase.com/docs/guides/database/database-linter.
- **Migrações CLI/ledger:** as duas versões SQL do repositório (`20261019201520` e `20261020221500`) foram instaladas **dentro do bundle `20261021131601`**, não registradas individualmente na tabela remota de versões. Um futuro `supabase db push` precisa reconciliar o histórico com `supabase migration repair` após verificação (não reaplicar SQL sobre a base atual). Este detalhe não altera o funcionamento do aplicativo, mas é dívida operacional antes da automação de migrações.
- Rollback operacional: versões anteriores das funções estão guardadas na tabela privada; scripts `db/rollback/` servem apenas para emergência com escrita fiscal suspensa, pois restaurar uma função antiga reabre falhas P0. Preferir correção aditiva após teste. Restaurar backups de tabela **substituiria dados novos**; não executar sem plano explícito.
- Ainda pendente: confirmar HTTP/PostgREST real, login/logout como gestor/funcionário, interfaces e permissões usando as contas existentes, sem solicitar ou divulgar senhas. O banco atualizado **não comprova**, isoladamente, que a Preview está configurada.

## Portão de homologação funcional
- Ambiente Preview com banco compartilhado requer opt-in **restrito à branch** e variáveis explícitas na Vercel; não configurar `service_role` como chave pública.
- Conferir login/logout e renovação da sessão própria; 401/403/503 sem vazamento, rejeição de permissão por usuário, 429 distribuído ainda pendente (#23).
- Importação OCR local, QR automático com aviso de envio a terceiro, consulta oficial, conferência por `lineId` e gravação; cancelar × lançar concorrente; não duplicar saldo/nota. Conferir contagem, caixa e campos em celular/teclado.
- PR #40 permanece **draft** até critérios de ambiente e testes reais atendidos. Não fechar #30/#31/#32 nem publicar em Production apenas por `mergeable=true`.
- Se o gestor desejar apenas revisão/merge de código, planejar um mecanismo de deploy controlado para não publicar o candidato antes das RPCs.

## Registro de conclusão por SHA
- Database: pré/pós verificações aprovadas em 21/10/2026; nenhuma conta, sessão, nota ou quantidade alterada.
- Branch + SHA final:
- Git behind/mergeable:
- Workflows e Vercel:
- Revisão de permissões/RPCs:
- Evidências de homologação:
- Plano de rollout/rollback:
- Autorização do gestor para merge e migrações:
