## O que muda
Campos Contado usam borda #afbec4, radius 8px e altura mínima 42px também na tabela. Relatórios/Ano marca o mês corrente como parcial e o exclui somente de Menor mês registrado. Histórico fiscal inicia em Todos os dias do mês, mantendo dia específico e Sem data registrada.

IDs locais são atribuídos no cadastro manual, importação/arquivamento e restauração; não há inferência por identidade de arrays. Edições, renomeação e pendingId preservam o ID. Ele permanece fora dos payloads persistidos. O teste agora verifica comportamento sem ler pages/index.js.

O gerador versionado de PROBLEMAS usa scrollWidth/clientWidth de cada contêiner, além de documento e console. Os dois scripts locais de captura foram ligados ao helper e antes/PROBLEMAS.md foi regenerado a partir de capturas.json.

## Base e escopo
A #197 ainda está aberta; esta PR pequena se baseia em codex/giro-layout, commit 74d3e64. Incremento 27bda10: 12 arquivos, 84 adições e 27 remoções. Nenhuma mudança fiscal, SQL, B1, autenticação ou dependências do projeto. Sem merge.

## Evidências
- 8 testes afetados passaram, 0 falharam.
- Suíte completa executada uma vez: 307 passaram/3 falharam por timeout ao executar iniciador Windows/Python junto ao build. Repetidos apenas os dois arquivos envolvidos após o build: 13 passaram/0 falharam; não se omitiu nem afrouxou os testes. Logs locais em review-claude/followup-tests.log e followup-retry.log.
- Build final passou. CI consultado uma vez: 22 checks aprovados e 1 pendente (detalhes no GitHub); sem merge.
- Revisão independente única: sem impeditivos no recorte; nenhuma edição ou teste extra pelo revisor.
- WebKit desktop via Playwright: medição do aplicativo real em 1440x900 confirmou input/select com reserva de 190px e grupo Mês/Ano sem deslocamento. Artefato local review-claude/followup-browsers.json.
- Firefox: instalado, mas spawn UNKNOWN em duas tentativas de início; validação não concluída. Safari desktop real não está disponível neste Windows. WebKit não comprova o seletor nativo do Safari.
- Gerador possui regressão para documento sem overflow e tabela com 1036 > 606: não retorna Nenhum.

## Limitações e decisões
O ponto 5 está parcialmente verificado: WebKit confirmado, Firefox e Safari real pendentes. Não se presume equivalência entre WebKit e o navegador Safari de macOS. Reserva fixa de largura/altura já existe no CSS e não foi relaxada.
Apenas apresentação; mês parcial continua incluído nas vendas e no gráfico, mas não no mínimo anual. today é injetado no cálculo puro.

## Rollback
Revert 27bda10; nenhum dado precisa ser transformado. CL-01/04/05/09/10/13/15/16 verificadas. Nenhum merge nem deploy manual autorizado.

## Reaplicação sobre main autorizada
Mantido da #199: somente 27bda10 reaplicado em 9d7719d, com localReceiptId explícito e fora dos payloads; diff idêntico: 12 arquivos, +84/-27.
Mantido da main: toda a base 6df3df9 (#197), sem alterar back-end/fiscal/SQL/autenticação; 35 testes afetados e build aprovados, teste de confirmação preservado.
