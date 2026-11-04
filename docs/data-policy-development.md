# Política de dados — fase de desenvolvimento

Esta política vale até o primeiro uso comercial do Estoque+.

## Dados e ambientes

- Não há uso comercial nesta fase. Dados do banco, contas de teste, senhas de teste e arquivos do Storage são descartáveis.
- O projeto de homologação **Estoque+ DB** é o único banco canônico. O projeto legado é somente leitura de catálogo e não será salvo, exportado nem migrado.
- O schema/DDL deve ser construído exclusivamente pelos arquivos versionados no repositório.
- Previews devem apontar exclusivamente à homologação; qualquer ref não permitida deve falhar no build.

## Mudanças e resets

- Toda mudança de banco deve entrar por arquivo versionado em PR e ter CI verde.
- SQL manual fora do Git é proibido, exceto por scripts de reset versionados, revisados e aprovados.
- Reset completo é permitido na fase de desenvolvimento. Nunca registrar identificadores fiscais reais, dados pessoais ou credenciais em código, fixtures, logs de CI, PRs ou issues.
- Não executar reset nem migração na homologação até que o script/PR correspondente esteja revisado e aprovado.
- Não fazer merge sem aprovação explícita do responsável pelo projeto.

## Segredos

Nunca solicitar, imprimir, registrar ou commitar senha MASTER, senhas de banco ou chaves secret/service_role. Valores usados em fixtures devem ser fictícios e gerados no CI.

## Expiração

No primeiro uso comercial, esta política expira. Antes de operações comerciais, tornam-se obrigatórios backup restaurável, ambiente isolado e plano de rollback. Todo PR que altera banco deve lembrar explicitamente essa condição.