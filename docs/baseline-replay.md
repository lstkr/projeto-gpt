# Baseline histórica e replay isolado

A migração `20261019000000_legacy_baseline.sql` precede a primeira migração
incremental (`20261019201520_inventory_validate_session.sql`). Seu conteúdo é
gerado exclusivamente por `git show`, nesta ordem, dos quatro arquivos no
commit imutável `93b444e8dea5c6dd17db713003b5349506df41cd`:
`db/schema.sql`, `db/access-permissions.sql`, `db/pending-receipts.sql` e
`db/cash-closing.sql`. Não é um dump nem uma captura do banco remoto.

`node scripts/build-sql-baseline.cjs --check` confere conteúdo e hashes SHA256
normalizados para LF. O gerador não lê SQL do working tree. O checkout CI usa
histórico completo para disponibilizar o commit de origem. Para regenerar,
execute o gerador sem `--check` e revise o SQL resultante. `db/schema.sql`
passa a ser somente ponteiro documental para as migrações; o SQL original
permanece recuperável no commit de origem e integralmente na baseline. Os
runners de banco usam a baseline versionada; o caminho novo aplica **somente**
`supabase/migrations/*.sql`, em ordem lexical. As suítes históricas de sessão e
fiscal param deliberadamente na migração sob teste para validar seu rollback.

O workflow `baseline-replay.yml` usa PostgreSQL 15 e 17 descartáveis, sem secrets
de aplicação ou conexão remota. `tests/sql/run-baseline-replay.py` recusa host
fora de loopback, nome de banco fora do prefixo de teste e banco não vazio.
Os únicos elementos de plataforma simulados são os papéis `anon` e
`authenticated` e o schema `extensions`; tabelas de aplicação vêm das migrações.

Após replay, verifica catálogo RPC contra consumidores, `SECURITY DEFINER`,
`search_path` vazio, revogação de `EXECUTE` de `PUBLIC`, ausência de execução
de funções privadas pelos papéis da API, RLS e recusas reais de leitura direta,
RPC privada e token inválido. Também executa as suítes existentes de acesso
por unidade e alteração de usuários. Isso não substitui PostgREST, advisors do
Supabase, homologação no ambiente publicado ou verificação de dados reais.

As concessões `EXECUTE` para `anon` e `authenticated` nas RPCs públicas são
intencionais: a autenticação é própria e cada operação exige token de sessão
Estoque+ válido. O papel de API não confere identidade nem acesso à unidade.
As funções privadas ficam sem execução para esses papéis após o cutover.
O catálogo testa também privilégios herdados de `PUBLIC`, além dos grants
diretos. Não se altera `ALTER DEFAULT PRIVILEGES` nesta PR: cada RPC versionada
revoga explicitamente o padrão `PUBLIC EXECUTE`; mudanças futuras inseguras
falham na auditoria após replay.

## Limite operacional e recuperação

Esta baseline se destina a bancos novos e vazios. **Não executar `db push`,
`migration up`, SQL desta baseline ou reparo do histórico em um projeto
existente sem um plano separado aprovado**, backup verificável e comparação
do schema real. Inserir uma migração anterior às já aplicadas exige decisão
explícita sobre o histórico do ambiente; o CI local não autoriza isso.

Nenhuma instrução aqui altera usuários, hashes ou sessões de ambiente real.
Rollback da PR é retirar os arquivos novos; a validação destrói apenas seu
serviço PostgreSQL descartável ao término do job. Não há migração de rollback
para apagar objetos ou contas em banco existente.
