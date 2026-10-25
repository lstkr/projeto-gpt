# Desenho: resets do ambiente de desenvolvimento

**Estado:** proposta para revisão; não executa reset e não contém SQL destrutivo.

## Política

Na fase de desenvolvimento, o banco canônico é reconstruído somente a partir de supabase/migrations. Todos os dados, inclusive usuários, senhas e Storage, são descartáveis no reset total. O reset de dados preserva private.app_users, hash MASTER e estabelecimentos/vínculos necessários ao login. O projeto legado é leitura de catálogo; não será exportado ou migrado.

## PR A — reset de dados

Arquivo futuro: scripts/reset-test-data.sql, acompanhado de invocador que valide a ref antes de abrir conexão.

1. Exigir marcador persistido de homologação criado por migration e confirmação local explícita. Marcador ausente/incompatível aborta antes da primeira escrita.
2. Consultar o grafo de FKs do schema do baseline. Falhar se surgir FK não contemplada; usar uma única instrução TRUNCATE TABLE com lista explícita e sem CASCADE.
3. Limpar estoque, notas/pendências, caixas, auditorias de teste, atribuições fiscais, arquivos bytea, sessões, tentativas de login, limites de taxa e substituições de permissão.
4. Preservar contas, tabela MASTER, estabelecimentos e vínculos de tenant necessários ao login. Comparar apenas contagens antes/depois; nunca selecionar ou imprimir IDs, nomes, hashes ou conteúdo.
5. Recriar cada linha de private.tenant_inventory com o estado inicial canônico definido por migration/helper versionado.
6. O app atual armazena arquivos de notas/relatórios em colunas bytea por RPC; não usa supabase.storage.from() nem acessa bucket diretamente. Se existir bucket privado separado no projeto, documentar etapa manual no painel Storage para esvaziar somente a homologação.
7. Testar em PostgreSQL descartável que TRUNCATE não usa cascata implícita, preserva contagens de contas/MASTER/vínculos, limpa tabelas selecionadas, restaura estado inicial e recusa marcador ausente/errado.

## PR B — reconstrução total

Script separado, não reutilizar o reset de dados. Guard de ambiente igual ao PR A; apagar somente objetos/schema privado pertencentes ao app, nunca auth, storage, extensions ou schemas internos Supabase. Como Preview e Production apontam para a mesma homologação durante desenvolvimento, exigir ref verificada e aprovação específica antes da execução. Reaplicar todas as migrations versionadas em ordem, validar login e schema vazio, depois permitir cadastro de contas/MASTER.

O procedimento também precisa reconciliar supabase_migrations.schema_migrations por mecanismo suportado pela CLI. Não usar DROP SCHEMA public CASCADE nem SQL improvisado. Se a CLI não suportar reconstrução remota segura, criar projeto canônico vazio e apontar Vercel para ele, sem exportar o legado.

## Ordem e aprovação

Baseline e CI de instalação limpa primeiro. Depois, validar os scripts em PG15 e PG17 descartáveis, abrir PRs para revisão e executar somente na homologação após aprovação específica do script. CI nunca acessa Supabase.

**Não executado:** sem reset, drop, truncamento, aplicação remota ou teste destrutivo.