# Desenho: resets do ambiente de desenvolvimento

**Estado:** proposta para revisão; não executa reset e não contém SQL destrutivo.

## Política

Na fase de desenvolvimento, instalação nova usa somente `supabase/migrations/`. Reset de dados preserva `private.app_users`, hashes de senha, MASTER, estabelecimentos, memberships e permissões necessárias ao login. Nunca tocar usuários reais nem hashes em limpeza de estoque ou teste. Reconstrução total exige ambiente vazio separado ou escopo específico aprovado; não é atalho para apagar contas existentes. O legado permanece somente leitura de catálogo.

## PR A — reset de dados

Arquivo futuro: `db/operations/reset-test-data.sql`, acompanhado de invocador que valide a ref antes de abrir conexão. Scripts de backup/reset/restore ficam em `db/operations/`, **nunca em `supabase/migrations/`**, pois replay de instalação não deve limpar dados. Nenhum SQL destrutivo novo é entregue neste desenho.

1. Exigir trava dupla e confirmação explícita: ref exata `zybnekctgrjmygdkuwyr`, conferida pelo invocador antes de abrir conexão, e linha de homologação em tabela **privada**, por exemplo `private.environment_marker`, com ambiente/ref compatíveis, criada no setup autorizado. A tabela pode ter definição versionada, mas a linha habilitadora não pode vir automaticamente do replay genérico. Sem grants de escrita/EXECUTE para PUBLIC/anon/authenticated. Marcador/ref ausente, errado ou ligado a outro projeto aborta antes de qualquer escrita, inclusive revogação de sessão. Lock/transação evita corrida entre preflight e limpeza.
2. Preflight lê `pg_constraint`, `pg_class` e `pg_namespace`, fecha a lista de objetos a partir da baseline e classifica cada FK, inclusive referências de fora do conjunto. FK nova, tabela preservada dependente ou objeto inesperado bloqueia a operação. Nunca ampliar a lista automaticamente. Uma única instrução `TRUNCATE TABLE` usa lista explícita e **sem CASCADE**; não desabilitar triggers/constraints nem usar `session_replication_role` para contornar integridade.
3. **TRUNCATE não dispara triggers de DELETE/UPDATE de imutabilidade.** Triggers `ON TRUNCATE`, quando existirem, são outra categoria e precisam de preflight. Permissão de truncar auditorias de teste exige decisão explícita e lista fechada; não tratar ausência de erro como aprovação. Limpar somente estoque, documentos/pendências, caixas, auditorias de teste aprovadas, atribuições fiscais, arquivos bytea, tentativas e limites transitórios definidos nessa lista.
4. Preservar contas, hashes, tabela MASTER, estabelecimentos, memberships e permissões de login; comparar contagens antes/depois sem imprimir IDs/nomes/hashes/conteúdo. Testes sintéticos também comparam fingerprints internos para detectar alterações sem mudar contagens, sem registrar esses fingerprints em logs. Revogar sessões antigas **explicitamente**, de forma auditável e na mesma transação; preservar os logins/senhas. A validação pós-reset exige login novo com as mesmas credenciais. Não apagar permissões por conveniência.
5. Recriar cada linha de private.tenant_inventory com o estado inicial canônico definido por migration/helper versionado.
6. O app atual armazena arquivos de notas/relatórios em colunas bytea por RPC; não usa supabase.storage.from() nem acessa bucket diretamente. Se existir bucket privado separado no projeto, documentar etapa manual no painel Storage para esvaziar somente a homologação.
7. Testar em PG15/17 descartáveis: marcador ausente/errado, ref divergente, FK inesperada, referência de tabela preservada, rollback de falha parcial, contas/hashes/MASTER/memberships/permissões intactos, sessões antigas recusadas, novas sessões válidas, estado inicial e revisão monotônica de `tenant_inventory`. Demonstrar separadamente que trigger de imutabilidade de linha não impede TRUNCATE; o guard operacional é obrigatório. Backup e restauração verificáveis antecedem qualquer execução remota.

## PR B — reconstrução total

Script futuro separado em `db/operations/`, não reutilizar reset de dados nem inserir limpeza em migrations. Preferir projeto vazio novo. Se houver aprovação específica para reconstruir um ambiente descartável existente, usar o mesmo guard duplo e inventário fechado de objetos da aplicação; nunca apagar `auth`, `storage`, `extensions` ou schemas internos Supabase. Não executar `DROP SCHEMA public CASCADE` genérico. Como Preview/Production podem apontar à mesma homologação, o nome do ambiente Vercel não é prova de isolamento. Aprovação de desenho não autoriza execução nem mudança de contas reais.

O procedimento também precisa reconciliar supabase_migrations.schema_migrations por mecanismo suportado pela CLI. Não usar DROP SCHEMA public CASCADE nem SQL improvisado. Se a CLI não suportar reconstrução remota segura, criar projeto canônico vazio e apontar Vercel para ele, sem exportar o legado.

## Ordem e aprovação

Baseline e CI de instalação limpa primeiro. Depois, validar os scripts em PG15 e PG17 descartáveis, abrir PRs para revisão e executar somente na homologação após aprovação específica do script. CI nunca acessa Supabase.

**Não executado:** sem reset, drop, truncamento, aplicação remota ou teste destrutivo.
