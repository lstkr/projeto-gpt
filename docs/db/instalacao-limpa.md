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

O bootstrap é uma ação separada da instalação do schema e deve ser executado pelo DBA/proprietário em um terminal PowerShell interativo. Não execute o bootstrap antes da instalação do schema estar concluída e confirmada.

No PowerShell, `npm` pode resolver para `npm.ps1`, bloqueado pela política de execução configurada no Windows.
Os comandos abaixo usam `npm.cmd` para chamar o executável do npm sem depender desse script PowerShell.
`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` é uma alternativa de configuração do usuário, não o padrão deste guia.

### Passo 1 — instalar as dependências

Na raiz do repositório, execute este comando sozinho. `npm.cmd ci` instala exatamente as versões registradas no lockfile de `scripts/admin`:

```powershell
npm.cmd ci --prefix scripts/admin
```

Espere o npm terminar com código de saída zero e sem erro de instalação. Depois, verifique a dependência exigida pelo bootstrap:

```powershell
Test-Path scripts\admin\node_modules\bcryptjs
```

O resultado esperado é `True`. Se for `False`, não execute o bootstrap: confira a mensagem do npm e repita somente a instalação das dependências.

### Passo 2 — executar o bootstrap

Só depois da instalação confirmada, execute este comando separadamente. Substitua o marcador pelo ref do projeto já verificado; não acrescente senha, URL ou chave ao comando:

```powershell
node scripts/admin/bootstrap.mjs <ref-confirmado-do-projeto>
```

O script primeiro pede `Database URL (hidden)`: essa URL contém a senha do PostgreSQL, que autentica a conexão com o banco. Em seguida pede `Provisional DBA password (hidden)` e sua confirmação: é a senha provisória escolhida para a conta superadministradora Estoque+, não a senha do banco. As entradas são ocultas: nenhum caractere digitado aparece na tela. Após sucesso, espere `DBA created. First login requires a new password.`; no primeiro login, a senha do DBA deve ser trocada.

Use uma URL copiada em Dashboard → Connect e substitua os marcadores localmente. Estes formatos são apenas modelos:

```text
postgresql://postgres:<SENHA_CODIFICADA>@db.<REF_AUTORIZADO>.supabase.co:5432/postgres
postgresql://postgres.<REF_AUTORIZADO>:<SENHA_CODIFICADA>@<HOST_EXATO_DO_SESSION_POOLER>:5432/postgres
```

Na senha da URL, codifique caracteres reservados como `@`, `:`, `/`, `?`, `#`, `&` e espaços com percent-encoding antes de colar. O bootstrap aceita conexão direta ou Session pooler compartilhado, sempre na porta `5432`; a porta `6543` é recusada. Ele exige TLS com validação de certificado usando os certificados confiáveis do Node.js. Não exige `sslmode`, arquivo CA ou variável de ambiente de senha; parâmetros de query da URL não substituem a configuração TLS do cliente.

Para o instalador limpo, defina `ESTOQUE_SUPABASE_ALLOWED_REF`, `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER` e `PGSSLROOTCERT` na mesma janela PowerShell em que executará o instalador. Variáveis `$env:` pertencem ao processo da janela e não aparecem automaticamente em uma nova janela. O bootstrap não lê essas variáveis: recebe o ref como argumento e a URL no prompt oculto. Não defina `PGPASSWORD` nem salve a URL em arquivo. O DBA/proprietário cria o superadministrador; em seguida o DBA cria o Gestor pela administração da aplicação. MASTER continua apenas uma proposta em `docs/security/master-provisioning-design.md`.

### Erros comuns

| Mensagem ou sintoma | Causa provável | Ação segura |
| --- | --- | --- |
| `npm.ps1 cannot be loaded` ou execução bloqueada por política | O PowerShell selecionou o shim `npm.ps1` e a política local bloqueou scripts. | Use `npm.cmd ci --prefix scripts/admin` conforme o Passo 1. A alternativa `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` é opcional e altera a configuração do usuário. |
| `ERR_MODULE_NOT_FOUND` para `bcryptjs` ou `pg` | As dependências ainda não foram instaladas ou a instalação não terminou. | Rode o Passo 1 separadamente e confirme `Test-Path scripts\admin\node_modules\bcryptjs` como `True` antes do Passo 2. |
| `Ref inválido. Informe o ref confirmado do projeto Estoque+ DB.` | O argumento do comando está ausente ou não contém o formato de ref esperado. | Passe somente o ref confirmado como argumento; não use uma URL nesse lugar. |
| `A URL ainda contém o marcador [YOUR-PASSWORD]. Substitua-o pela senha do banco.` | O marcador de exemplo não foi substituído pela senha do banco. | Copie a URL do Dashboard e substitua o marcador localmente; não envie a URL a ninguém. |
| `Formato de URL inválido. Use uma URL PostgreSQL copiada em Dashboard → Connect.` | A URL está incompleta ou foi alterada de forma inválida. | Copie novamente a URL em Dashboard → Connect. |
| `Protocolo inválido. A URL deve começar com postgres:// ou postgresql://.` | A URL não é PostgreSQL. | Copie a URL PostgreSQL apresentada em Dashboard → Connect. |
| `A senha contém caracteres reservados sem codificação URL. Codifique-os antes de montar a URL.` | Um caractere da senha foi interpretado como separador da URL. | Codifique os caracteres reservados localmente e tente de novo; não compartilhe a URL. |
| `A URL não contém a senha do banco. Copie novamente a conexão PostgreSQL.` | A URL está sem senha ou o conteúdo foi truncado. | Copie a URL novamente e confirme a senha do banco localmente, sem colá-la no chat ou em logs. |
| `A porta 6543 (pooler em modo transação) não é aceita. Use conexão direta ou Session pooler na porta 5432.` | Foi escolhida conexão transaction pooler ou a porta de pooler transacional. | Use conexão direta ou Session pooler, ambos na porta 5432; copie host e usuário pelo Dashboard. |
| `Porta não aceita. Use a conexão direta ou Session pooler na porta 5432.` | A URL usa outra porta não suportada pelo bootstrap. | Copie a URL do Dashboard para conexão direta ou Session pooler na porta 5432. |
| `O banco da URL deve ser postgres.` | A URL aponta para um banco diferente do esperado pelo script. | Copie a URL PostgreSQL padrão exibida em Dashboard → Connect. |
| `O usuário da conexão direta deve ser postgres.` | A conexão direta usa outro usuário. | Copie a URL direta do projeto autorizado. |
| `O usuário da conexão não contém o ref esperado. No Session pooler, use postgres.<ref>.` | O nome de usuário do Session pooler não contém o ref do projeto. | Copie a URL Session pooler completa do projeto autorizado pelo Dashboard. |
| `O host não corresponde ao ref confirmado. Copie a conexão do projeto autorizado.` | O host da URL é de outro projeto ou foi editado manualmente. | Cancele e copie novamente a conexão de Estoque+ DB, conferindo o ref passado no argumento. |
| `O PostgreSQL recusou a autenticação. Confira a senha do banco e a codificação dos caracteres reservados.` | Senha do banco incorreta ou caracteres reservados não codificados. | Confirme a senha no gerenciador do responsável e a codificação da URL; nunca inclua a URL completa em mensagens. |
| `A validação TLS falhou. Confira a data do computador, a rede e os certificados confiáveis do Node.js; não desative a validação.` | O Node não conseguiu validar a cadeia de certificados, ou o relógio/rede do computador está incorreto. | Confira a data do Windows, a conexão e os certificados confiáveis do Node; não desative a verificação TLS. |
| `Não foi possível alcançar o PostgreSQL. Confira a rede, o endereço escolhido no Dashboard e a disponibilidade do destino.` | Rede/DNS indisponível, host incorreto ou destino temporariamente inacessível. | Confirme o modo e o host copiados do Dashboard e tente novamente quando a rede estiver disponível. |
| `A função de bootstrap não foi encontrada. Confirme que a migração de instalação limpa terminou.` | A migração que cria a função ainda não foi aplicada ou o schema esperado está ausente. | Confirme no histórico que as nove migrações foram concluídas; não rode SQL manualmente para contornar o erro. |
| `O usuário do banco não tem permissão para concluir o bootstrap. Confirme o usuário administrativo e as migrações.` | A conta PostgreSQL conectada não tem privilégio para chamar a função privada. | Confirme que copiou a conexão administrativa do projeto e que a migração terminou; peça ao DBA para revisar se continuar. |
| `O bootstrap já foi realizado. Não tente criar outra conta DBA; peça ao responsável para revisar o acesso.` | Já existe uma conta superadministradora ou o bootstrap anterior foi concluído. | Não tente criar outra conta; peça ao responsável para recuperar o acesso pelo fluxo aprovado. |
| `Bootstrap não concluído por uma falha não classificada. Confira o projeto, a conexão e as migrações sem compartilhar credenciais.` | O driver retornou um erro sem classificação segura. | Confira localmente a conexão e as migrações; peça revisão ao DBA sem enviar valores ou logs com credenciais. |
| `O banco não confirmou a proteção dos parâmetros nos logs. Peça ao DBA para revisar a configuração.` | O servidor não confirmou os ajustes que impedem registro de parâmetros sensíveis. | Não continue; peça ao DBA para verificar a configuração de logging do projeto. |
| `A senha provisória do DBA e a confirmação não coincidem ou excedem o limite aceito.` | As duas entradas ocultas divergem ou a senha tem menos de 6 ou mais de 72 bytes. | Reinicie o comando e informe a mesma senha provisória nas duas entradas, respeitando o limite de 6 a 72 bytes. |

## Validação local descartável

A preparação em `tests/sql/disposable-supabase-setup.sql` cria somente roles, schemas e tabelas sintéticas ausentes no container local. Não a aplique num projeto Supabase remoto. Execute os três runners `tests/sql/run-session-tests.py`, `tests/sql/run-fiscal-integrity.py` e `tests/sql/run-tenant-access.py` em bancos locais vazios separados, com `PGHOST=127.0.0.1` e nomes `estoque_rpc_test_*`. A prova de instalação usa a própria trava e depois repete o comando para verificar recusa.

## Checklist pós-instalação

- [ ] Confirmar 12 tabelas privadas e as três views públicas `shared_inventory`, `pending_receipts` e `cash_closings`.
- [ ] Executar `tests/sql/clean-install-checklist.sql`: confirmar RLS habilitado em todas as tabelas privadas, `private_tables_without_rls = none` e nenhuma função de aplicação sem `search_path` explícito.
- [ ] No Dashboard → API Settings, confirmar que o schema `private` não está na lista de schemas expostos ao PostgREST; expor somente schemas necessários.
- [ ] Manter `public` exposto para as chamadas RPC do aplicativo; o código atual não consulta as tabelas/views por acesso direto. A partir de 30/10/2026, novas tabelas públicas não são expostas automaticamente pela Data API; habilite objetos individualmente apenas se uma integração passar a consultá-los diretamente ([changelog oficial](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)).
- [ ] Confirmar também que `supabase_migrations` não está exposto; o banco revoga privilégios dos papéis da API nesse schema e nas suas tabelas.
- [ ] No Supabase Dashboard, executar Security Advisor e revisar cada alerta antes de habilitar usuários.
- [ ] Rodar os testes de acesso entre estabelecimentos do `run-tenant-access.py`; usuário de um tenant não pode ler nem gravar dados do outro.
- [ ] Conferir ledger com `supabase migration list`; nove migrações aplicadas correspondem aos arquivos e timestamps versionados.
- [ ] Só depois, em etapa aprovada separadamente, o responsável realiza o bootstrap e valida login/recuperação.

O checklist local não consulta configuração PostgREST nem executa Security Advisor; ambos exigem uma revisão manual no projeto correto. Esta PR não escreve no Supabase remoto.
