# Bootstrap do DBA e primeiro Gestor — Windows PowerShell

Roteiro para o responsável executar localmente no **Estoque+ DB**, ref
`zybnekctgrjmygdkuwyr`, após a instalação já concluída. Não reinstale a base.
O agente não recebe credenciais nem executa o bootstrap.

## 1. Versão e pré-requisitos

Use a branch da **PR #177**, `codex/docs-bootstrap-windows-hardening`, com a
iniciador nativo (`scripts/admin/bootstrap-windows.ps1`). Não precisa
esperar merge para executar esse script local: ele não depende de deploy da UI.
Confirme que a revisão corrigida foi disponibilizada nessa branch antes de
atualizar outro computador. Não use o SHA antigo `43712f3`, que pode travar em
falhas anteriores à conexão. Merge e deploy continuam decisões separadas.

Abra PowerShell interativo, sem gravação/transcrição do terminal. Tenha Git,
Node.js **22**, npm e acesso ao Dashboard do projeto. Python/psql não são
necessários para este bootstrap; as verificações SQL podem usar o SQL Editor.

```powershell
Set-Location C:\Dev\projeto-gpt
git status --short --branch
# Se houver mudanças próprias, preserve-as antes de trocar de branch.
git switch codex/docs-bootstrap-windows-hardening
# Em outro computador, depois da publicação da revisão corrigida:
# git pull --ff-only
node --version
Test-Path scripts\admin\bootstrap-windows.ps1
npm.cmd ci --prefix scripts/admin
if ($LASTEXITCODE -ne 0) { throw 'Dependências não instaladas; pare aqui.' }
Test-Path scripts\admin\node_modules\bcryptjs
Test-Path scripts\admin\node_modules\pg
node --test tests/bootstrap-input.test.cjs tests/bootstrap-connection.test.cjs tests/bootstrap-transaction.test.cjs
if ($LASTEXITCODE -ne 0) { throw 'Testes falharam; pare antes do bootstrap.' }
```

Espere Node `v22.x`, três resultados `True`, instalação sem erro e testes
aprovados. `npm.cmd` evita o bloqueio de `npm.ps1` pela política do PowerShell.

## 2. Conexão e certificado

Abra [Estoque+ DB no Supabase](https://supabase.com/dashboard/project/zybnekctgrjmygdkuwyr).
Confira o nome/ref. Em **Connect**, selecione **Session pooler** se sua rede
não tiver IPv6; copie a URI PostgreSQL e confira porta **5432** e usuário
`postgres.zybnekctgrjmygdkuwyr`. Use o host exato do Dashboard, sem inventar região.
Conexão direta também é aceita: host `db.zybnekctgrjmygdkuwyr.supabase.co`,
usuário `postgres`, porta `5432`. Não use Transaction pooler/porta `6543`.

Substitua `[YOUR-PASSWORD]` localmente pela **senha do banco PostgreSQL** do
projeto. Não é a senha do login Supabase, chave API nem a senha futura do DBA.
Se necessário recuperar essa senha, use os controles do Dashboard do projeto.
Na parte da senha da URI, caracteres reservados precisam de percent-encoding:
`@` → `%40`, `#` → `%23`, `:` → `%3A`, `/` → `%2F`, `%` → `%25`.
Não codifique a URI inteira nem codifique a mesma senha duas vezes.
Monte-a em ferramenta local privada; não a coloque em comando, arquivo Git ou chat.

Em **Database Settings → SSL**, baixe o certificado CA apresentado pelo
Dashboard. O arquivo local `db/prod-ca-2021.crt` pode ser usado **se for esse CA
confiável e estiver válido**; o nome `prod` não seleciona o banco. O arquivo é
público, mas não precisa ser commitado. Antes de iniciar Node, execute:

```powershell
$bootstrapCaPath = (Resolve-Path -LiteralPath '.\db\prod-ca-2021.crt').Path
# Ajuste o caminho acima se o CA foi baixado com outro nome/local.
# Confirme no Windows o emissor/validade e a origem do download:
certutil -dump $bootstrapCaPath
$previousBootstrapCa = $env:NODE_EXTRA_CA_CERTS
$env:NODE_EXTRA_CA_CERTS = $bootstrapCaPath
```

`NODE_EXTRA_CA_CERTS` acrescenta esse PEM à confiança do Node ao iniciar o
processo. **`PGSSLROOTCERT` configura o instalador/psql, mas não este script JS.**
O bootstrap exige `rejectUnauthorized: true`; não desative TLS. Parâmetros
`sslmode`/`sslrootcert` da URI não substituem a configuração do cliente.

## 3. Verifique o estado antes de criar a conta

No **SQL Editor desse projeto**, execute somente estas consultas:

```sql
select count(*) as migrations_aplicadas
from supabase_migrations.schema_migrations;
select to_regprocedure('private.bootstrap_superadmin(text,text)') is not null
  as bootstrap_disponivel;
select role, active, must_change_password, count(*) as quantidade
from private.app_users group by role, active, must_change_password;
```

Para o estado verificado em 01/11/2026: nove migrações, `true` e nenhuma linha
de usuário. Se já existir `superadmin`, pare e revise o acesso; não apague conta
nem repita bootstrap para recuperar senha. Quantidade sozinha não comprova a
instalação: o histórico deve corresponder ao plano de instalação limpo.

## 4. Execute uma vez

### Proteção dos logs no Supabase

O iniciador verifica os valores efetivos `log_parameter_max_length=0`,
`log_parameter_max_length_on_error=0` e `pgaudit.log_parameter=off`, sem executar
`SET LOCAL` de parâmetros restritos. Nunca remova essa verificação para prosseguir.
No Estoque+ DB, a consulta de 01/11 encontrou `-1`, `0`, `off`, respectivamente.

O responsável deve revisar/autorizar este ajuste de configuração antes de
executá-lo no SQL Editor **somente do Estoque+ DB** (não é criação de conta):

```sql
alter role postgres set log_parameter_max_length = '0';
select rolconfig from pg_roles where rolname = 'postgres';
```

O Supabase permite esse parâmetro no nível do papel via `supautils`. A alteração
oculta parâmetros nos logs de novas conexões desse papel; não concede privilégios,
não altera tabelas, senhas, saldos ou usuários da aplicação. A configuração anterior
consultada não tinha esse override. Se uma reversão for posteriormente autorizada,
`alter role postgres reset log_parameter_max_length` remove apenas esse override.
O bootstrap exige uma **nova conexão** e verifica os valores realmente recebidos,
inclusive através do Session pooler; alterar `rolconfig` sozinho não prova que
uma sessão já aberta ou reutilizada incorporou a configuração.
Se o ALTER for negado ou a verificação continuar falhando, pare e revise com o DBA;
não amplie permissões nem desative a proteção. Este ajuste não foi executado pelo
agente e não autoriza mudanças em produção.

Na mesma janela PowerShell, depois de conferir ref/CA/dependências:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\admin\bootstrap-windows.ps1 -ProjectRef zybnekctgrjmygdkuwyr
```

Cole somente esse comando, sem outra linha junto. O `Bypass` vale somente para
esse processo que executa o arquivo local revisado; não altera a política do
Windows. O iniciador usa `Read-Host -AsSecureString`, evitando o leitor raw do
Node que falhou no console Windows. Os dados seguem ao Node por pipe UTF-8 em
memória, nunca por argumentos, arquivo ou variável de ambiente.

O terminal apresenta, nesta ordem:

```text
URL PostgreSQL (entrada protegida):
Senha provisoria do DBA:
Repita a senha provisoria:
DBA created. First login requires a new password.
```

No primeiro prompt cole a URI privada e pressione Enter. Nos outros dois,
digite a mesma **senha provisória nova do DBA Estoque+**, diferente da senha do
banco. O console protege a entrada, sem exibir o conteúdo. Escolha de 12 a 72 bytes para evitar
incompatibilidade com a troca obrigatória; caracteres acentuados podem ocupar
mais de um byte. O sucesso exige mensagem final e código de saída zero.

## 5. Primeiro login e criação do Gestor

Abra [a homologação](https://estoque-homologacao-ashy.vercel.app/), entre como
**`admin.master`** usando a senha provisória e conclua **Defina sua nova senha**.
Depois, em **Administração DBA → Novo usuário**, preencha nome/login/senha
provisória, escolha **Gestor** e vincule ao estabelecimento existente.
Não crie outra unidade por engano. Saia do DBA, entre com o Gestor e troque a
senha provisória. O Gestor poderá criar Funcionários da unidade autorizada.

Execute no SQL Editor as verificações agregadas, sem retornar nomes ou hashes:

```sql
select role, active, must_change_password, count(*) as quantidade
from private.app_users group by role, active, must_change_password;
select role, count(*) as vinculos
from private.tenant_memberships group by role;
select count(*) as sessoes_ativas from private.app_sessions
where revoked_at is null and expires_at > now();
```

Logo após bootstrap deve existir um `superadmin` ativo com troca pendente.
Após os dois primeiros logins/trocas, espere um `superadmin` e um `admin` ativos
com `must_change_password=false`, e vínculo `admin` para a unidade.
O número de sessões varia com login/logout; não exige um total fixo.
As consultas não substituem teste funcional de permissões.

## Diagnóstico rápido

| Erro/sintoma | Solução |
| --- | --- |
| `npm.ps1` bloqueado | Use `npm.cmd`, conforme o roteiro. |
| URI correta chega vazia/inválida no prompt `Database URL (hidden)` | Atualize a branch e use o iniciador `bootstrap-windows.ps1` acima; não repita o leitor raw do Node. |
| `ERR_MODULE_NOT_FOUND` (`pg`/`bcryptjs`) | Execute `npm.cmd ci --prefix scripts/admin` e confira ambos os diretórios. |
| CA não encontrado ou warning ao carregar certificados | Confira caminho absoluto, origem e formato PEM; abra outro Node após ajustar a variável. |
| Marcador `[YOUR-PASSWORD]`, senha ausente ou URL inválida | Refaça a URI localmente, substitua o marcador e codifique só a senha. |
| Porta 6543 ou ref/usuário incorreto | Copie Session pooler 5432 do projeto correto, incluindo `postgres.<ref>`. |
| Autenticação PostgreSQL recusada | Confira senha do banco e percent-encoding; não troque a senha do DBA para resolver a conexão. |
| Falha TLS | Confira relógio, CA e rede. Nunca use `NODE_TLS_REJECT_UNAUTHORIZED=0`. |
| DNS, rede ou timeout | Confira disponibilidade do projeto/host; em rede só IPv4 use Session pooler. |
| Senhas provisórias divergentes | Repita o script corrigido; use a mesma senha nos dois prompts. A validação ocorre antes de conectar. |
| Função/schema ausente | Confira projeto e nove migrações; não reinstale nem execute SQL avulso para contornar. |
| Privilégio ou proteção dos parâmetros nos logs | Pare e encaminhe só a mensagem segura ao DBA; não remova a proteção de logs. |
| Bootstrap já realizado | Não recrie a conta; use o fluxo de acesso/recuperação revisado. |
| Resposta perdida/falha no COMMIT ou rollback | Consulte os agregados antes de tentar outra vez; a mensagem de falha não comprova ausência da conta. |
| Login não funciona após sucesso | Confira URL da homologação, login `admin.master`, senha provisória e troca obrigatória. Verifique se o build aponta ao mesmo banco. |

Ao terminar, restaure a configuração anterior da janela:

```powershell
if ($null -eq $previousBootstrapCa) {
  Remove-Item Env:NODE_EXTRA_CA_CERTS -ErrorAction SilentlyContinue
} else {
  $env:NODE_EXTRA_CA_CERTS = $previousBootstrapCa
}
```

Não compartilhe URI, senha,
hash ou prints dos prompts. Bootstrap/TLS/login reais são validados pelo
responsável; testes offline não comprovam essa execução.

Referências: [conexões Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres),
[CA adicional do Node](https://nodejs.org/api/cli.html#node_extra_ca_certsfile).
