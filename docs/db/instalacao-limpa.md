# Instalação limpa do Estoque+ DB

Este roteiro é somente para um projeto Supabase novo, vazio e explicitamente confirmado. **Não execute a instalação antes de esta PR ser mesclada e o CI ficar verde. Na execução real, rode o `--preflight` antes da instalação.** Nunca o use num banco com dados: instalações existentes recebem somente migrações incrementais revisadas. Não contém bootstrap de usuário, reset, `DROP TABLE`, `TRUNCATE` ou exclusão em massa.

## Pré-requisitos e destino

Instale localmente Python 3, Node.js 22 e `psql` 17. O executável fixa no plano o ref do Estoque+ DB e não aceita outro destino. A senha do banco é solicitada sem eco; não a coloque em argumentos, arquivos versionados ou logs.

| Nome | Uso |
| --- | --- |
| `ESTOQUE_SUPABASE_ALLOWED_REF` | Ref único que o responsável autorizou para instalação limpa. |
| `PGHOST` | Host direto do ref autorizado ou host copiado do Session pooler no Dashboard. |
| `PGPORT` | `5432`; a porta `6543` do transaction pooler é recusada. |
| `PGDATABASE` | `postgres`. |
| `PGUSER` | `postgres` na conexão direta ou `postgres.<ref>` no Session pooler. |
| `PGSSLROOTCERT` | Caminho local do certificado CA do Supabase. O executável força `verify-full`. |

Prefira conexão PostgreSQL direta quando a rede tiver IPv6 ou o add-on IPv4. Para uma rede somente IPv4, o executável também aceita o **shared Session pooler**: use exatamente o host exibido em Dashboard → Connect, porta 5432 e usuário `postgres.<ref>`. Em ambos os modos, `PGSSLROOTCERT` aponta para o CA baixado em Database Settings e o cliente valida certificado e hostname com `verify-full`; o executável também confere que o usuário do pooler, `ESTOQUE_SUPABASE_ALLOWED_REF` e `--confirm-ref` identificam o mesmo projeto. Transaction pooler e porta 6543 são recusados.

## Guia de execução PowerShell para o Lucas

Execute da raiz do repositório somente depois da mesclagem desta PR e CI verde. O ref é informado no terminal e repetido como confirmação explícita. Copie o host do Session pooler do Dashboard se a rede for IPv4-only; para conexão direta, o host será derivado do ref. A senha será solicitada em entrada oculta tanto no preflight quanto na instalação; não defina variável de senha nem salve connection string:

```powershell
$env:ESTOQUE_SUPABASE_ALLOWED_REF = Read-Host 'Ref do projeto Estoque+ DB'
$env:PGHOST = "db.$($env:ESTOQUE_SUPABASE_ALLOWED_REF).supabase.co"
$env:PGPORT = '5432'
$env:PGDATABASE = 'postgres'
$env:PGUSER = 'postgres'
$env:PGSSLROOTCERT = Read-Host 'Caminho local do certificado CA do Supabase'
# Para rede IPv4-only, substitua PGHOST e PGUSER pelos valores abaixo:
# $env:PGHOST = Read-Host 'Host do Session pooler copiado do Dashboard'
# $env:PGUSER = "postgres.$($env:ESTOQUE_SUPABASE_ALLOWED_REF)"
python scripts/admin/install-clean-database.py --confirm-ref $env:ESTOQUE_SUPABASE_ALLOWED_REF --preflight
if ($LASTEXITCODE -ne 0) { throw 'Preflight falhou; instalação não iniciada.' }
python scripts/admin/install-clean-database.py --confirm-ref $env:ESTOQUE_SUPABASE_ALLOWED_REF
```

O `--preflight` valida conexão TLS, ref confirmado, PostgreSQL 17, roles/extensões, ausência do schema `private`, objetos da aplicação e ledger vazio. Ele só consulta o banco, imprime o plano e encerra sem aplicar SQL. Se falhar, não rode a instalação: confira o projeto/ref, modo de conexão, certificado local e mensagem de erro, sem copiar senha ou connection string para logs.

Durante a instalação, cada arquivo SQL é executado em uma transação PostgreSQL; o registro da migração (ou fingerprint da base) é gravado na mesma transação. Se um arquivo falhar, esse arquivo e seu registro são revertidos, enquanto arquivos anteriores já concluídos permanecem instalados. Corrija a causa externa e retome somente com `--resume`: o executável exige fingerprint exato e ledger que seja prefixo coerente do plano, depois aplica apenas migrações pendentes. Se fingerprint, ledger ou SQL-base estiverem ausentes/divergentes — por exemplo, falha antes do último arquivo-base criar o marcador — pare, preserve o banco e acione o DBA; não repita instalação limpa nem repare manualmente.

Para retomar após corrigir a causa externa, use o mesmo ref, host, usuário, CA e senha, e rode:

```powershell
python scripts/admin/install-clean-database.py --confirm-ref $env:ESTOQUE_SUPABASE_ALLOWED_REF --resume
```

O modo `--resume` repete a validação de conexão, TLS, ref e PostgreSQL, confere o fingerprint e o ledger antes de qualquer escrita e aplica somente as migrações ainda pendentes.

Depois de concluir, execute o checklist abaixo. No Dashboard → API Settings confirme que `private` e `supabase_migrations` não estão entre os schemas expostos; o instalador também revoga privilégios de `PUBLIC`, `anon`, `authenticated` e `service_role` no schema do ledger e suas tabelas. Execute Security Advisor e revise os alertas antes de habilitar usuários. Se qualquer verificação falhar, suspenda o uso e encaminhe o diagnóstico ao DBA.

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

O fingerprint SHA-256 do SQL-base fica em `supabase_migrations.estoque_installation_baselines`. Essa tabela e `schema_migrations` ficam no schema `supabase_migrations`, com privilégios revogados para os papéis da API; não ficam acessíveis pela Data API. As nove migrações são registradas com timestamp e nome em `supabase_migrations.schema_migrations`, o ledger consultado pelo Supabase CLI; `statements` fica nulo. Assim a baseline fica auditável sem inventar uma versão que a CLI confundiria com um arquivo de migração. Depois, não edite o SQL-base: mantenha uma migração versionada por mudança e confira `supabase migration list`; em banco novo, nunca marque uma migração como aplicada se ela não foi executada.

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
- [ ] Confirmar também que `supabase_migrations` não está exposto; o banco revoga privilégios dos papéis da API nesse schema e nas suas tabelas.
- [ ] No Supabase Dashboard, executar Security Advisor e revisar cada alerta antes de habilitar usuários.
- [ ] Rodar os testes de acesso entre estabelecimentos do `run-tenant-access.py`; usuário de um tenant não pode ler nem gravar dados do outro.
- [ ] Conferir ledger com `supabase migration list`; nove migrações aplicadas correspondem aos arquivos e timestamps versionados.
- [ ] Só depois, em etapa aprovada separadamente, o responsável realiza o bootstrap e valida login/recuperação.

O checklist local não consulta configuração PostgREST nem executa Security Advisor; ambos exigem uma revisão manual no projeto correto. Esta PR não escreve no Supabase remoto.
