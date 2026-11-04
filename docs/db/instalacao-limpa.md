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
14. `20261101211824_cash_closing_auditable_corrections.sql` — correções de caixa com revisão, motivo e histórico; requer integridade de caixa e diretório.

O fingerprint SHA-256 do SQL-base fica em `supabase_migrations.estoque_installation_baselines`. Essa tabela e `schema_migrations` ficam no schema `supabase_migrations`, com privilégios revogados para os papéis da API; não ficam acessíveis pela Data API. As dez migrações são registradas com timestamp e nome em `supabase_migrations.schema_migrations`, o ledger consultado pelo Supabase CLI; `statements` fica nulo. Assim a baseline fica auditável sem inventar uma versão que a CLI confundiria com um arquivo de migração. Depois, não edite o SQL-base: mantenha uma migração versionada por mudança e confira `supabase migration list`; em banco novo, nunca marque uma migração como aplicada se ela não foi executada.

## Bootstrap do DBA (responsável executa localmente)

Após confirmar a instalação, siga o [guia PowerShell de bootstrap e primeiro Gestor](bootstrap-windows.md).
Ele cobre a branch da #177, dependências administrativas, conexão direta/Session pooler,
CA via `NODE_EXTRA_CA_CERTS`, prompts ocultos, verificações agregadas e diagnóstico.
Não repita a instalação limpa para criar usuários. O responsável executa o bootstrap;
o agente não recebe credenciais nem cria contas. MASTER permanece proposta futura.
