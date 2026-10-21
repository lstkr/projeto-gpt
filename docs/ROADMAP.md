# Roadmap Estoque+

## Reposição e cadastro fiscal — entrega em validação

- Identificação do fornecedor por CNPJ (#62): preservar o nome informado, sinalizar CNPJ inválido e impedir equivalência entre CNPJs diferentes.
- Nome padrão do produto (#63): associação por código do fornecedor e unidade, sem mesclar cadastros ou destruir descrição/código fiscal original; edição manual explícita do nome de exibição.
- Impressão da lista de compras: reposição por categoria, fornecedor, saldo/mínimo, quantidade a comprar e orçamento parcial quando faltar preço. É um relatório de compra, separado da folha de contagem física (#36).
- Leitor de código de barras: adiado conforme priorização do gestor.

## Calculadora de CMV — planejada

Antes de implementar, validar com o gestor período de fechamento, inventário inicial/final, compras líquidas, devoluções, transferências, perdas e receita líquida. Fórmula inicial: CMV = estoque inicial + compras líquidas − estoque final; percentual de CMV = CMV / receita líquida, apenas quando a receita for positiva. Transferências entre unidades exigem contrapartida rastreável, sem duplicar compras no consolidado.

Critérios de aceite: custos e unidades coerentes, fontes identificadas, reprocessamento auditável, períodos fechados protegidos, alertas de dados faltantes e testes de arredondamento. Não apresentar estimativa incompleta como fechamento contábil aprovado.

## Multinegócio e administração — bloqueio de segurança para publicação

- Gestor pode ter vínculo com várias cafeterias/restaurantes e selecionar uma unidade ativa; funcionário pertence a uma única unidade.
- Cada estoque, documento, movimento, contagem e fechamento de caixa pertence a uma unidade. O identificador é validado na sessão/operação no servidor e no banco, com RLS/RPC e acesso negado a unidades sem vínculo.
- Superadministrador DBA possui área exclusiva para cadastrar gestores, estabelecimentos e funcionários. O gestor só cadastra estabelecimentos e funcionários dentro de sua autorização.
- Bootstrap protegido, hash seguro de senha fora de código/logs, troca obrigatória no primeiro acesso, proteção contra força bruta e revogação de sessões. Não registrar credenciais no roadmap ou em tickets.
- Versionar migrações, atribuir dados existentes à unidade correta e testar acesso direto, troca de unidade, sessão antiga, concorrência e negação de acesso cruzado antes de expor a interface.
- Reset de testes depende de escopo verificado, backup recuperável e rollback ensaiado. Preservar usuários e hashes existentes; revogar sessões explicitamente. Autenticação própria não é Supabase Auth.

Nenhuma interface administrativa ou seleção de unidade deve ser publicada com autorização apenas no navegador ou antes de concluir isolamento e homologação de todas as RPCs existentes.
