# Validação leve de sessão — issue #27 / PR #26

Base analisada: PR #26, commit `f22f848a1c8fb4263c5267b317d4b8a5ae678af8`.
O PR usa `inventory_get` para proteger as consultas fiscais; a leitura e serialização
do snapshot de estoque são desnecessárias para essa autorização.

## Contrato alinhado com o Back-end

`inventory_validate_session(p_session_token text)` retorna JSONB:

```json
{"valid":true,"user":{"id":"UUID","role":"admin"}}
```

`role` pode ser `admin` ou `employee`. O ID vem da conta própria do aplicativo.
Não há dependência de Supabase Auth, JWT, `auth.uid()` ou `auth.users`.
As permissões por módulo não existem no esquema desta base: não são inventadas nem
inferidas do cliente. Esta RPC autentica; cada operação sensível continua responsável
por verificar sua autorização no servidor, dentro da própria transação.

Token inválido, expirado, revogado ou usuário inativo: mesma mensagem genérica e
SQLSTATE `28000`. O helper converte para HTTP 401. Erro técnico, retorno fora do
contrato ou RPC ausente: HTTP 503, sem fallback, sem cache e sem logar credenciais.
O token é encaminhado somente ao banco e nunca aos serviços fiscais externos.

## Segurança e desempenho

- Função pública `SECURITY INVOKER` e implementação privada `SECURITY DEFINER`,
  ambas com `search_path` vazio e nomes de objetos qualificados.
- A elevação permite a consulta às tabelas privadas sob o mesmo modelo existente.
  Nenhuma política usa Supabase Auth. `PUBLIC` perde EXECUTE; somente os papéis API
  `anon` e `authenticated` recebem EXECUTE explícito. Ambos precisam do token próprio.
- Aplicar com o papel proprietário confiável usado pelo esquema existente; não
  conceder CREATE/ownership das funções ou do schema privado a papéis API.
- Preflight aborta se RLS estiver desabilitada ou existirem permissões diretas nas
  tabelas/colunas de usuários, sessões ou estoque. A migração não muda esses ACLs.
- A consulta usa as PKs existentes de `token_hash` e `app_users.id`. Nenhum índice,
  leitura de estoque, renovação de sessão, escrita ou bloqueio de linha é adicionado.
- A saída é uma lista explícita de campos, sem token, hash, nome, senha ou estoque.
- DDL e privilégios são publicados atomicamente. Não usar `CREATE OR REPLACE` para
  sobrescrever uma função desconhecida: colisões exigem revisão.

## Concorrência

A validade corresponde ao snapshot da instrução PostgreSQL. Revogação/desativação
confirmada antes da próxima instrução em READ COMMITTED bloqueia essa instrução.
Uma alteração ainda sem commit não é lida; validações em andamento podem ter sido
autorizadas antes do commit. A RPC não promete cancelar trabalho externo já iniciado.
Transações REPEATABLE READ podem conservar um snapshot anterior: não reutilizar uma
transação longa como sessão HTTP. A expiração usa `statement_timestamp()`, inclusive
quando a transação começou antes da expiração. As operações de estoque mantêm seus
próprios guards transacionais; o resultado desta RPC não é uma autorização reutilizável.

## Homologação e aplicação

Nenhum banco de produção foi alterado por esta implementação.

1. Em PostgreSQL descartável e vazio, criar `estoque_rpc_test` e executar:
   `PGHOST=127.0.0.1 PGDATABASE=estoque_rpc_test PGUSER=postgres python3 tests/sql/run-session-tests.py`.
   Fornecer senha local por `PGPASSWORD`, se necessário. O runner recusa hosts remotos.
   O CI executa PostgreSQL 15 e 17, cenários SQL, concorrência e reversão/reaplicação.
2. Em homologação existente, aplicar somente
   `supabase/migrations/20261019201520_inventory_validate_session.sql` com `ON_ERROR_STOP`.
   Não executar `db/schema.sql`: ele é exclusivamente bootstrap de banco novo.
   Registrar a versão aplicada conforme o processo de migração do ambiente.
3. Conferir owner, ACLs, RLS, schemas expostos (somente público, não `private`) e advisors
   do Supabase. Testar a RPC pelo PostgREST com a chave pública e sessão de teste;
   validar respostas 401/503 e ambos endpoints fiscais com o Back-end.
4. Após homologação e autorização de produção: aplicar migração primeiro, confirmar
   schema cache do PostgREST e só então publicar o helper novo. Não fazer merge/deploy
   automático deste PR antes de confirmar a migração no ambiente de destino.

## Reversão

1. Restaurar o helper do PR #26 que usa `inventory_get`, mantendo os guards fiscais.
2. Aguardar instâncias/requisições com o helper novo encerrarem.
3. Executar `db/rollback/inventory_validate_session.sql` e registrar a reversão da
   versão no processo de migração. O script remove só as duas funções, sem CASCADE,
   sem alterar usuários, sessões, estoque, RLS ou permissões preexistentes.
4. Confirmar autenticação e consultas fiscais. Se precisar reaplicar, executar a mesma
   migração após reconciliar seu registro de versão. O runner testa esse ciclo.

Referências: [funções e privilégios Supabase](https://supabase.com/docs/guides/database/functions)
e [isolamento PostgreSQL](https://www.postgresql.org/docs/current/transaction-iso.html).
