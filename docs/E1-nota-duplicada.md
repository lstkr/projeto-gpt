# E1 — Proteção contra nota duplicada

Uma nota nova com chave fiscal preenchida deve ter 44 dígitos em texto e não pode repetir outra nota ativa da mesma unidade. A validação ocorre no banco, após sessão/permissão/revisão e sob o bloqueio já existente. Notas antigas não são apagadas nem mescladas; notas sem chave continuam exigindo conferência manual. Após estorno legítimo, a chave pode ser reutilizada.

A migração `20261101224158_fiscal_access_key_uniqueness.sql` interrompe sem mudanças se a função instalada divergir da versão esperada. Preserva permissões, cálculos e transações. Erros manuais de conflito usam PT409 para evitar a repetição infinita observada na B1. A tela limita chamadas a 15 segundos; após timeout, confira a versão salva antes de tentar novamente, pois cancelar a espera não garante cancelar uma gravação já iniciada.

## Aplicação e recuperação

Somente após novo OK: conferir Estoque+ DB, comparar agregados antes/depois, aplicar migração e validar instalação limpa. Não altera dados existentes. Para conter problema, executar `db/rollback/fiscal_access_key_uniqueness.sql`: suspende apenas notas novas, mantendo dados, consultas, estornos e gravações comuns. Não remove histórico nem restaura o erro 40001. Reativação exige decisão autorizada.

## Teste no computador após publicação

1. Lance uma nota com chave fiscal e anote o estoque salvo.
2. Tente lançar novamente a mesma chave: deve avisar duplicidade; atualize a página e confira uma única nota e o mesmo saldo.
3. Em duas abas abertas antes do lançamento, tente a mesma chave: a segunda deve recusar por conflito ou duplicidade e sair da espera; após atualizar, deve existir apenas uma nota.
4. Confira que outra nota com chave diferente funciona normalmente. Não use documentos reais em arquivos de teste do repositório.

Limite: a tela ainda pode mostrar alterações locais recusadas até atualizar. A mensagem distingue recusa de confirmação; não há promessa de recuperação de um rascunho manual após recarregar.
