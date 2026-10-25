# Casos manuais de documentos de teste

Usar somente dados sintéticos ou artefatos cuja anonimização tenha sido revisada. Os links anteriores para fotografias fiscais de terceiros foram retirados: disponibilidade pública não comprova anonimização nem autorização de reutilização.

| ID neutro | Cenário | O que conferir |
|---|---|---|
| DOC-01 | Produto por peso | Quantidade, unidade e preço; texto parcialmente oculto não deve causar lançamento automático. |
| DOC-02 | Cupom com QR | Identificar a UF correta; códigos reais não devem ser usados em serviços externos. |
| DOC-03 | Duas notas lado a lado | Documentos independentes, sem fusão nem duplicação de itens. |
| DOC-04 | Código repetido | Preservar três linhas distintas mesmo com o mesmo código de produto. |
| DOC-05 | Cupom antigo/curvado | Resultado inconclusivo deve permitir conferência manual. |

1. Usar ambiente isolado com banco descartável e sem envio a provedores externos.
2. Comparar documento, linhas, códigos, unidade, quantidade, preço, desconto e total com a imagem revisada.
3. Registrar ausências, duplicações, unidades/valores incorretos e latência por ID neutro.
4. Não confirmar documentos de teste em estoque real. Consulta indisponível deve permitir conferência manual.

## Pacote recebido nesta rodada

A revisão do pacote de 25/10/2026 recusou sua inclusão no Git: há identificadores fiscais e comerciais legíveis e códigos de consulta. Veja `fixtures/anonymized-package-review-20261025.json`. Nenhum byte dos anexos foi aprovado para CI ou artefatos públicos. O nome do pacote não comprova anonimização.

A cobertura acima é uma matriz de aceite; não representa execução de OCR. O golden textual existente continua cobrindo regras de parser, sem provar reconhecimento sobre pixels.
