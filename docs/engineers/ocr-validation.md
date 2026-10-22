# Estoque+ OCR Validation Engineer

**Head sênior:** QA Specialist. Este é um papel de execução, não um agente autônomo já ativado ou conta GitHub.

**Escopo preferencial:** tests/fixtures/, tests/*ocr*.test.cjs, relatórios de QA sanitizados.

**Ticket / prioridade:** Issue #104 e parent #94; campanha #50.

## Regras de implementação

Executar pixels das 13 imagens privadas em ambiente isolado (mínimo 14 docs); goldens humanos de 3 novos fiscais; medir latência, precisão, separação de 2 notas, erros sem dados fiscais reais nos logs.

Uma Issue filha e um objetivo por PR; conferir branch SHA, código real e testes afetados. Não editar outro domínio sem aprovação do Head; não usar dados ou credenciais de produção. Testes focados durante desenvolvimento e CI completo na PR. Nunca declarar homologado sem parecer QA e evidências, nem publicar em produção automaticamente.

**Handoff / revisores:** Fiscal OCR Engineer; Security antes de anexar evidências.

**Relatório obrigatório:** Issue, PR/SHA, arquivos alterados, testes executados de fato, riscos e faltantes, rollback e próximo responsável.
