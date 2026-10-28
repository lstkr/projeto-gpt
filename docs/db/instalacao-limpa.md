# Instalação limpa do Estoque+ DB

Este roteiro é somente para um projeto Supabase novo, vazio e explicitamente confirmado. Nunca o use num banco com dados: instalações existentes recebem somente migrações incrementais revisadas. Não contém bootstrap de usuário, reset, `DROP TABLE`, `TRUNCATE` ou exclusão em massa.

## Pré-requisitos e destino

Instale localmente Python 3, Node.js 22, `psql` 17 e configure as variáveis abaixo no terminal do responsável. O executável também fixa o projeto `zybnekctgrjmygdkuwyr` (Estoque+ DB), então não aceita o ref de produção mesmo se ele for colocado por engano na variável. A senha do banco é solicitada sem eco; não a coloque em argumentos, arquivos versionados ou logs.

| Nome | Uso |
| --- | --- |
| `ESTOQUE_SUPABASE_ALLOWED_REF` | Ref único que o responsável autorizou para instalação limpa. |
| `PGHOST` | Deve ser exatamente `db.<ref>.supabase.co`; pooler não é aceito neste roteiro. |
| `PGPORT` | Porta direta do PostgreSQL, normalmente 5432. |
| `PGDATABASE` | `postgres`. |
| `PGUSER` | `postgres`. |
| `PGSSLMODE` | O executável força `verify-full`. |

Execute da raiz do repositório, confirmando o mesmo ref como argumento:

```powershell
$env:ESTOQUE_SUPABASE_ALLOWED_REF = '<ref-autorizado>'
$env:PGHOST = "db.$($env:ESTOQUE_SUPABASE_ALLOWED_REF).supabase.co"
$env:PGPORT = '5432'
$env:PGDATABASE = 'postgres'
$env:PGUSER = 'postgres'
python scripts/admin/install-clean-database.py --confirm-ref $env:ESTOQUE_SUPABASE_ALLOWED_REF
```

O executável rejeita ref ausente/divergente, PostgreSQL fora da major 17, host diferente do ref, roles/extensões ausentes, histórico de migrações preenchido, schema `private` existente ou qualquer uma das tabelas/views da aplicação. Ele faz uma pré-verificação antes de aplicar arquivos e pede a senha do banco em entrada oculta. Se interromper após iniciar a aplicação SQL, não repita nem tente corrigir manualmente: preserve o diagnóstico para revisão do DBA; a trava recusará a segunda execução.

## Ordem e dependências

O plano canônico está em `scripts/admin/clean-install-plan.json`; o teste de CI varre exatamente esses arquivos.

1. `db/schema.sql` — extensão `pgcrypto`, estoque legado, usuários, sessões e RPCs; requer roles `anon` e `authenticated` e schema `extensions`.
2. `db/access-permissions.sql` — permissões e auditoria; requer `private.app_users` do passo 1.
3. `db/pending-receipts.sql` — recebimentos fiscais pendentes; requer schema e funções base.
4. `db/cash-closing.sql` — fechamento de caixa; requer as roles e funções base.
5. `20261019201520_inventory_validate_session.sql` — validação de sessão; usa auth/storage e catálogo das roles API.
6. `20261020221500_fiscal_write_integrity.sql` — integridade transacional fiscal; usa RPCs e tabelas base.
7. `20261021143000_external_fiscal_rate_limit.sql` — limite fiscal externo; requer `pgcrypto` e tabelas privadas.
8. `20261021232050_tenant_access.sql` — tenants e isolamento por estabelecimento; requer estoque, caixa, recebimentos e usuários.
9. `20261021233206_count_guard_search_path.sql` — guarda de contagem; requer RPCs do tenant cutover.
10. `20261022020602_cash_closing_integrity.sql` — integridade dos fechamentos; requer tenant cutover.
11. `20261022145500_admin_password_recovery.sql` — recuperação administrativa; requer sessões e memberships.
12. `20261022174354_expose_cancel_audit_columns_on_tenant_pending_view.sql` — campos de auditoria na view; requer tenant pending view.
13. `20261023000500_user_directory_update.sql` — edição auditada do diretório; requer usuários e permissionamento.

O plano fixa a impressão digital SHA-256 do SQL-base e registra arquivos/hash em `supabase_migrations.estoque_installation_baselines`. As nove migrações são registradas com timestamp e nome em `supabase_migrations.schema_migrations`, o ledger consultado pelo Supabase CLI; `statements` fica nulo, como permite o formato da tabela. Assim a baseline fica auditável sem inventar uma versão que a CLI confundiria com um arquivo de migração. Depois, não edite o SQL-base: mantenha uma migração versionada por mudança e confira `supabase migration list`; em banco novo, nunca marque uma migração como aplicada se ela não foi executada.

## Bootstrap do DBA (responsável executa localmente)

O bootstrap é uma ação separada do roteiro e não é executado por agente. Instale as dependências já travadas do script e rode no terminal interativo do DBA:

```powershell
npm ci --prefix scripts/admin
node scripts/admin/bootstrap.mjs <ref-confirmado-do-projeto>
```

O script lê a URL de conexão, senha provisória do DBA e confirmação da senha em prompts ocultos. A URL deve pertencer ao ref passado no argumento; não use variáveis com senha, não compartilhe esses valores e não os envie ao agente. `ESTOQUE_SUPABASE_ALLOWED_REF` é usado pelo instalador limpo; o script de bootstrap existente recebe o ref como argumento. O DBA/proprietário cria o superadministrador; em seguida o DBA cria o Gestor pela administração da aplicação. MASTER continua apenas uma proposta em `docs/security/master-provisioning-design.md`.

## Validação local descartável

A preparação em `tests/sql/disposable-supabase-setup.sql` cria somente roles, schemas e tabelas sintéticas ausentes no container local. Não a aplique num projeto Supabase remoto. Execute os três runners `tests/sql/run-session-tests.py`, `tests/sql/run-fiscal-integrity.py` e `tests/sql/run-tenant-access.py` em bancos locais vazios separados, com `PGHOST=127.0.0.1` e nomes `estoque_rpc_test_*`. A prova de instalação usa a própria trava e depois repete o comando para verificar recusa.

## Checklist pós-instalação

- [ ] Confirmar 12 tabelas privadas e as três views públicas `shared_inventory`, `pending_receipts` e `cash_closings`.
- [ ] Executar `tests/sql/clean-install-checklist.sql`: confirmar RLS habilitado em todas as tabelas privadas, `private_tables_without_rls = none` e nenhuma função de aplicação sem `search_path` explícito.
- [ ] No Dashboard → API Settings, confirmar que o schema `private` não está na lista de schemas expostos ao PostgREST; expor somente schemas necessários.
- [ ] No Supabase Dashboard, executar Security Advisor e revisar cada alerta antes de habilitar usuários.
- [ ] Rodar os testes de acesso entre estabelecimentos do `run-tenant-access.py`; usuário de um tenant não pode ler nem gravar dados do outro.
- [ ] Conferir ledger com `supabase migration list`; nove migrações aplicadas correspondem aos arquivos e timestamps versionados.
- [ ] Só depois, em etapa aprovada separadamente, o responsável realiza o bootstrap e valida login/recuperação.

O checklist local não consulta configuração PostgREST nem executa Security Advisor; ambos exigem uma revisão manual no projeto correto. Esta PR não escreve no Supabase remoto.
