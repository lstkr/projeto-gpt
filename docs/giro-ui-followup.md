# Complemento UI do Giro
Base: codex/giro-layout em 74d3e64 (#197 ainda aberta); PR empilhada, sem merge.
1. Contado tem o mesmo estilo em tabela e cartões, sem limite de largura da regra.
2. Ano identifica o mês corrente como parcial; somente o mínimo exclui esse mês. Relógio injetado no cálculo.
3. Todos os dias do mês é o padrão; dia específico e Sem data registrada continuam disponíveis.
4. IDs locais nascem no cadastro manual, importação/arquivamento e restauração; não se infere igualdade de notas por arrays.
O identificador local continua fora dos payloads persistidos; teste é de comportamento, sem ler pages/index.js.
5. WebKit desktop real via Playwright confirmou reserva de 190px e controles imóveis ao alternar mês/ano.
Safari desktop real não está disponível no Windows; WebKit não comprova o seletor nativo desse Safari.
Firefox instalado, mas não iniciou em duas tentativas: browserType.launch: spawn UNKNOWN. Confirmação Firefox pendente.
6. Gerador versionado scripts/preview/overflow-report.cjs usa dimensões de cada contêiner, documento e console.
Geradores locais de captura foram ligados ao helper; antes/PROBLEMAS.md foi regenerado das medições existentes.
Testes: 8 afetados passaram; suíte única 307/310, com 3 timeouts durante build; dois arquivos repetidos isoladamente: 13/13.
Build validado; revisão independente única registrada na PR. Sem SQL, regras fiscais, auth ou dependências alteradas.
CL-01/04/05/09/10/13/15/16 conferidas. Reversão: revert do commit desta PR; sem transformação de dados.
