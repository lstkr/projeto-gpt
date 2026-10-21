# Migração multinegócio e recuperação

Estado: implementação submetida a testes PostgreSQL em memória (PGlite); não aplicada remotamente por este trabalho. A aplicação em Supabase e o reset continuam condicionados à homologação e ao backup recuperável.

O ensaio local também executou `db/operations/backup-test-reset.sql`, `reset-test-data.sql` e `restore-test-data.sql` após o cutover: restaurou o estado operacional, preservou credenciais e manteve sessões revogadas. A falha injetada antes do commit da migração reverteu DDL e preservou a credencial sintética. Esses ensaios **não equivalem** a restauração de um dump de produção nem a rollback do cutover após seu commit.

## Modelo e compatibilidade

`supabase/migrations/20261021221435_tenant_access.sql` deve ser aplicada após todas as migrações anteriores e os SQLs de permissões, pendências e caixa. É transacional. Não reaplicar `db/schema.sql` em banco existente. A migração preserva contas, hashes, documentos, produtos, IDs e sessões existentes, vinculando-os à unidade inicial. A autenticação continua própria; `auth.users` não participa.

O estoque, as pendências e o caixa passam ao schema `private`; views atualizáveis em `public` limitam as operações à unidade autenticada. Cada RPC de dados sobrescreve o contexto transacional com a unidade da sessão validada e seu vínculo; DBA não acessa estoque. As tabelas privadas e implementações deixam de ser executáveis pelos papéis API. As funções públicas de encaminhamento executam como proprietário confiável, com `search_path` vazio.

Funcionário possui um vínculo único; gestor possui vários. A escolha de unidade revoga o token anterior e emite outro, impedindo que clientes antigos gravem noutra unidade. Todos os consumidores precisam trocar o token antes de carregar o estoque selecionado. O cadastro é validado no servidor: gestor cria funcionários apenas nas suas unidades; apenas DBA cria gestores e concede novos vínculos a gestores. Nomes de login permanecem globalmente únicos.

Permissões fiscais legadas são globais por usuário. Para não modificar outra unidade indiretamente, o gestor só altera permissões de funcionários vinculados à unidade corrente; alterações em outros gestores são recusadas. O diretório devolve apenas usuários e vínculos visíveis ao solicitante.

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

Somente após comprovar que o alvo é de testes e que backup/restauração funcionam, executar reset em janela sem gravações. Preservar `private.app_users`, hashes e vínculos; revogar sessões explicitamente. Não apagar Supabase Auth nem presumir que reset de estoque implica reset de identidade. A autorização de reset não dispensa a identificação do ambiente e a análise das dependências. Não há SQL destrutivo automatizado nesta entrega.

Os scripts operacionais preparados têm escopo explícito e exigem execução manual pelo proprietário. O backup pós-cutover cria `estoque_recovery_20261021`, recusa sobrescrever backup anterior e copia dados sem imprimi-los. Contém material sensível, deve permanecer fora dos schemas expostos, sem concessões aos papéis API. O reset confere fingerprints das tabelas críticas e recusa drift; limpa apenas estoque, caixa e pendências. O restore foi ensaiado no mesmo schema e não recria identidades nem reativa sessões. Os backups antigos com prefixo `estq_backup_*` não são copiados novamente; permanecem intactos. Cópia no mesmo projeto protege esse reset, não perda do projeto ou da infraestrutura.

Falha durante migração causa rollback transacional. Depois de uso multinegócio, reverter para singleton descarta isolamento; portanto **não existe down migration automática**. Recuperação exige manutenção, backup novo, restauração integral ensaiada no projeto isolado e aplicação conjunta da versão de aplicativo compatível. Não voltar apenas o front-end para versão sem seleção de unidade ou troca obrigatória.

Referências: [funções e privilégios Supabase](https://supabase.com/docs/guides/database/functions), [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).
