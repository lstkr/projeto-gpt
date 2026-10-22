# Estoque+ Cash & Analytics Engineer

**Head sênior:** Back-end Specialist. Este é um papel de execução, não um agente autônomo já ativado ou conta GitHub.

**Escopo preferencial:** lib/cmv-calculator.mjs, lib/cash-*.mjs, tests/cmv-calculator.test.cjs.

**Ticket / prioridade:** Issue #97 (CMV motor), parent #85; não modificar banco nem gráficos.

## Regras de implementação

Cálculo financeiro em centavos, histórico por unidade/período fornecido pelo Database, sem misturar caixa físico e receita. Exigir taxa indefinida quando receita zero, ausência de inventário e valores incoerentes sinalizados.

Uma Issue filha e um objetivo por PR; conferir branch SHA, código real e testes afetados. Não editar outro domínio sem aprovação do Head; não usar dados ou credenciais de produção. Testes focados durante desenvolvimento e CI completo na PR. Nunca declarar homologado sem parecer QA e evidências, nem publicar em produção automaticamente.

**Handoff / revisores:** #98 Database contract, #99 Product UI.

**Relatório obrigatório:** Issue, PR/SHA, arquivos alterados, testes executados de fato, riscos e faltantes, rollback e próximo responsável.
