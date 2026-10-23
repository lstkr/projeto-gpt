# Migração multinegócio e recuperação

Estado: migração aplicada e reset concluído no Supabase de testes confirmado pelo usuário. As tabelas próprias do app estão vazias e `auth.users` continua vazio. O bootstrap do DBA `admin.master` ainda depende da URL PostgreSQL protegida, que não está disponível no ambiente local. A produção Vercel continua na versão anterior. O usuário autorizou o reset deste banco de testes sem backup externo nesta rodada.

O ensaio local também executou `db/operations/backup-test-reset.sql`, `reset-test-data.sql` e `restore-test-data.sql` após o cutover: restaurou o estado operacional, preservou credenciais e manteve sessões revogadas. A falha injetada antes do commit da migração reverteu DDL e preservou a credencial sintética. Esses ensaios **não equivalem** a restauração de um dump de produção nem a rollback do cutover após seu commit.

## Modelo e compatibilidade

`supabase/migrations/20261021232050_tenant_access.sql` deve ser aplicada após todas as migrações anteriores e os SQLs de permissões, pendências e caixa. É transacional. Não reaplicar `db/schema.sql` em banco existente. A migração preserva contas, hashes, documentos, produtos, IDs e sessões existentes, vinculando-os à unidade inicial. A autenticação continua própria; `auth.users` não participa. A migração posterior `20261022020602_cash_closing_integrity.sql` acrescenta autoria e validações nos fechamentos e deve ser aplicada em seguida, sem resetar dados.

O estoque, as pendências e o caixa passam ao schema `private`; views atualizáveis em `public` limitam as operações à unidade autenticada. Cada RPC de dados sobrescreve o contexto transacional com a unidade da sessão validada e seu vínculo; DBA não acessa estoque. As tabelas privadas e implementações deixam de ser executáveis pelos papéis API. As funções públicas de encaminhamento executam como proprietário confiável, com `search_path` vazio.

Funcionário possui um vínculo único; gestor possui vários. A escolha de unidade revoga o token anterior e emite outro, impedindo que clientes antigos gravem noutra unidade. Todos os consumidores precisam trocar o token antes de carregar o estoque selecionado. O cadastro é validado no servidor: gestor cria funcionários apenas nas suas unidades; apenas DBA cria gestores e concede novos vínculos a gestores. Nomes de login permanecem globalmente únicos.

Permissões fiscais legadas são globais por usuário. Para não modificar outra unidade indiretamente, o gestor só altera permissões de funcionários vinculados à unidade corrente; alterações em outros gestores são recusadas. O diretório devolve apenas usuários e vínculos visíveis ao solicitante.

## Revisão dos advisors Supabase

Após o cutover, o advisor de segurança sinaliza 27 funções RPC `SECURITY DEFINER` públicas como executáveis por `anon` e `authenticated`. Isso acompanha a autenticação própria do app: o cliente chama as RPCs com a chave pública e fornece um token de sessão aleatório, validado no servidor em cada operação. As funções privadas de implementação e as tabelas privadas não concedem leitura ou execução aos papéis API; o bootstrap também é negado a `anon`. Os testes PostgreSQL verificam negação de leitura direta e isolamento por token. Não remover `SECURITY DEFINER` dessas fachadas sem migrar a arquitetura de autenticação e grants.

O advisor também apontou `private.count_guard()` com `search_path` mutável. A migração `20261021233206_count_guard_search_path.sql` corrigiu o caminho para vazio quando a função existe. As quatro tabelas privadas marcadas como RLS sem policy não são expostas diretamente à Data API; o acesso ocorre pelas fachadas verificadas. Esses avisos devem ser reavaliados se a aplicação passar a usar Supabase Auth ou se o schema `private` for exposto.

A política de Preview limita a autorização compartilhada à branch `codex/homologacao-completa-20261023`. O acesso continua fechado enquanto `ESTOQUE_ALLOW_SHARED_DB_PREVIEW=true` não estiver configurada no ambiente Preview dessa branch; a produção não usa essa variável. A configuração Vercel deve permanecer restrita a essa branch.

## Bootstrap protegido

Não há senha nem hash provisionado na migração. `private.bootstrap_superadmin(username, password_hash)` é função privada sem privilégio API, destinada exclusivamente ao proprietário do banco em conexão TLS parametrizada. Aceita apenas o login solicitado e hash bcrypt com custo 12–15. Recusa sobrescrever qualquer conta existente ou criar um segundo DBA. O hash deve ser calculado fora de logs a partir de entrada protegida; não usar SQL Editor, comandos com argumentos contendo segredos, PR, issue ou logs como transporte. Confirmar configuração de registro de parâmetros antes de executar. A senha provisória serve apenas para entrar e trocar a senha: todas as demais operações são bloqueadas até a troca por 12–72 caracteres. Bcrypt limita senhas a 72 bytes; o cliente deve respeitar esse limite.

O login serializa tentativas por usuário com bloqueio transacional e limita oito falhas em quinze minutos. A troca de senha aplica o mesmo limite e revoga outras sessões. Proteção de infraestrutura por origem/IP é uma camada adicional a homologar na Vercel; não substituir o limite de conta.

## Aceite antes de produção

1. Rodar as migrações na mesma versão PostgreSQL do destino em ambiente isolado e conferir dados/IDs/hashes preservados sem imprimir seu conteúdo.
2. Executar `tests/sql/tenant-access-runner.mjs` com `PGLITE_MODULE_PATH` apontando à instalação de `@electric-sql/pglite`. O runner usa apenas usuários sintéticos, nunca banco remoto.
3. Conferir grants, RLS, owners e schema exposto no Supabase; `private` não deve estar exposto à Data API.
4. Homologar API PostgREST e UI com gestor de duas unidades, funcionário de uma, DBA antes/depois da troca, sessões inválidas/revogadas e ações concorrentes. Testar estoque, NF/estorno, contagem, consolidação, pendências, caixa e permissões.
5. Confirmar que todas as RPCs adicionais existentes no destino constam do inventário. Migração não pode presumir que uma RPC desconhecida respeita unidade.

## Backup, reset e rollback

O nome de uma tabela `estq_backup_*` não prova recuperação. Registrar referência do projeto, ambiente, horário, escopo, tamanho/contagens, permissões, mecanismo de criptografia e responsável pela restauração. Exportar esquema e dados de todos os objetos afetados, inclusive contas, sessões, ACLs, pendências/anexos e caixa para armazenamento protegido; ensaiar a restauração em ambiente isolado e comparar contagens e integridade. Não enviar esse material ao Git.

O dono confirmou em 2026-10-21 que o projeto Supabase vinculado contém somente testes e autorizou reset no banco atual sem backup externo nesta rodada. `db/operations/reset-test-environment.sql` limpou as contas customizadas, vínculos, unidades, sessões, tentativas, limites fiscais, permissões, pendências, caixa e estoque. As contagens remotas confirmaram zero linhas depois do reset. A operação deixou `auth.*` e `storage.*` intocados; `auth.users`, buckets e objetos estavam vazios. Os snapshots antigos no mesmo banco, que continham dados e hashes de teste e não eram um backup externo, foram removidos. Não executar esse reset em produção.

O procedimento geral para produção continua exigindo dump completo protegido e restauração ensaiada. O reset autorizado no banco de testes não substitui essa etapa para uma futura publicação em produção.

Os scripts operacionais de backup e restauração continuam disponíveis para uma eventual recuperação futura. Os snapshots antigos `estq_backup_*` foram removidos pelo reset integral autorizado. Cópias dentro do mesmo projeto não protegem contra perda do projeto ou da infraestrutura.

Falha durante migração causa rollback transacional. Depois de uso multinegócio, reverter para singleton descarta isolamento; portanto **não existe down migration automática**. Recuperação exige manutenção, backup novo, restauração integral ensaiada no projeto isolado e aplicação conjunta da versão de aplicativo compatível. Não voltar apenas o front-end para versão sem seleção de unidade ou troca obrigatória.

Referências: [funções e privilégios Supabase](https://supabase.com/docs/guides/database/functions), [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).
