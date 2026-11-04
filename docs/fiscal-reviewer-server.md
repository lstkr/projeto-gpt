# Autoria fiscal no servidor

Proposta em PR; migração remota ainda não aplicada.

## Contrato e aceite
O RPC inventory_save mantém assinatura e formato de retorno. Após sessão, unidade,
revisão e permissão fiscal, a mesma transação define checkedBy, checkedByUserId e
checkedAt nas notas novas. Nos movimentos fiscais novos, define by, byUserId e checkedAt.
O nome e o ID vêm de private.require_actor; o horário vem do PostgreSQL.
Campos fornecidos pelo navegador não determinam autoria. A tela já mostra a conta
conectada; esse texto passa a ser confirmado pelo banco depois da migração.

Notas e movimentos antigos preservam seus campos originais, inclusive ausências.
Não atribuir autoria retroativa nem modificar quantidade, valor, vínculos ou IDs.
Revisão obsoleta, token inválido/revogado, conta inativa e permissão negada continuam
bloqueados. O helper é privado, sem EXECUTE para PUBLIC, anon ou authenticated;
executa com os privilégios do RPC existente e search_path vazio.

## Validação e dependências
Testes SQL sintéticos no runner de tenants verificam adulteração de nome/ID/horário,
replay, imutabilidade do legado, isolamento e negação de acesso. A suíte existente
continua cobrindo concorrência de notas, estorno e duplicidade em PostgreSQL 15/17.
A migração compara o hash da função E1 esperada e aborta se o banco tiver divergido.
Revisão independente de Database/Back-end/Segurança permanece necessária; execução
em agente único não equivale a aprovação independente. Nenhuma migração remota é
implícita na abertura desta PR.

## Implantação e reversão
Aplicar somente em homologação, depois de autorização explícita e validação SQL.
Antes de reverter, suspender novos lançamentos e aplicar o script em
`db/rollback/fiscal_reviewer_from_session.sql`. Ele remove apenas a chamada ao helper,
sem apagar autoria ou dados já gravados. Reverter enfraquece a garantia de autoria;
por isso manter lançamentos suspensos até correção. Produção fica fora do escopo.
