# Giro — layout e primeira visão gerencial

Decisão de Lucas em 02/11/2026: adotar o layout Giro, paleta petróleo e conferência
lado a lado. Ícone 3 é direção provisória; refinamento da marca ainda não encerrado.
Foco atual confirmado: vendas, comparação de períodos, compras e estoque.

## Escopo implementado localmente

- Marca/cores/legibilidade em componentes existentes, sem trocar Next.js ou adicionar dependências.
- Unidade ativa real no cabeçalho e cadastro manual do caixa acessível diretamente, sem caixa presumido.
- Original XML/imagem/PDF junto à conferência. XML é texto escapado; PDF vira canvas local.
- Arquivo usa RPC já existente, limite de 4 MB, MIME/assinatura, descarte de respostas antigas e revogação de blobs.
- Importação/fila recolhidas durante a revisão; erros de salvamento continuam visíveis.
- Estoque sem soma de unidades incompatíveis; contador de reposição filtra produtos e atividade fica sob demanda.
- Painel do Gestor em Relatórios; Caixa mantém cadastro, histórico e correção auditada B1.
- Nenhum nome de tabela, sessão, pacote ou contrato foi renomeado por causa da marca.

## Definições dos indicadores

Fonte: dados da unidade já autorizados e carregados pelos RPCs atuais; sem nova consulta SQL.
O painel exclusivo do Gestor é apresentação; não altera a política do RPC de caixa existente.

| Indicador | Definição e limite |
| --- | --- |
| Vendas registradas | Soma das seis rubricas de vendas; sangria/suprimento excluídos. Rubrica omitida segue zero do contrato B1; null/vazio explícitos são inválidos. |
| Comparação | Mês anterior ou ano anterior; período em andamento até dia equivalente, ajustado ao calendário. Datas explícitas; sem variação se base zero, inexistente ou inválida. Não estabelece causalidade. |
| Média diária | Vendas / dias distintos com fechamento válido, incluindo zero explícito. Arredonda metade para cima em centavos; não é ticket médio. |
| Faltas e sobras | Contado − (dinheiro de vendas + suprimentos − sangrias operacionais), por registro. Somadas separadamente; retirada de encerramento excluída. Legado sem contado mantém vendas e não entra na conciliação. |
| Compras | Total explícito das notas registradas pela emissão, inclusive despesas nelas presentes; não é desembolso nem CMV. Sem data/total confiável, sinaliza parcialidade. |
| Estoque | Retrato atual a custo cadastrado: quantidade com escala 3, custo unitário até escala 6 e total arredondado em centavos. Não substitui inventário histórico ou custo médio persistido. |
| Reposição | Produtos cujo saldo está no mínimo ou abaixo, sem somar unidades distintas. |

Dinheiro agregado usa inteiros BigInt, reutilizando `exactCashDecimal` de B1.
Ausência de registro não comprova venda zero. Dias completos podem ter durações distintas;
a comparação mostra o calendário e depende da cobertura dos fechamentos, não presume dias abertos.
Leitura falha não vira zero; parcialidade e cobertura ficam indicadas. Não há previsão ou meta inventada.

## Próxima etapa: CMV e margem por item do cardápio

Pedido de Lucas: funcionário informará itens vendidos no dia; gestão avaliará receitas e processos.
Antes de implementar, Back-end/DBA devem definir e revisar:

1. Cardápio e ficha técnica versionada: insumos, unidades, conversões, rendimento e perdas previstas.
2. Venda diária por unidade/item: quantidade, preço líquido/receita reconhecida e cancelamentos.
3. Identificador idempotente por origem/lote; retry não pode baixar estoque duas vezes.
4. Baixa transacional com custo médio histórico aplicável, registrado no evento, sem recalcular pelo preço atual.
5. Separação de venda, perdas, consumo interno, devolução e ajuste da contagem física.
6. Conciliação entre consumo por receita, movimentos e inventários; contagem não repete baixas de vendas.
7. Autoria por sessão, revisão concorrente e custos restritos ao Gestor no servidor.
8. Custo e receita históricos por item para margem bruta; despesas, tributos e taxas precisam de regra
   própria antes de chamar o resultado de lucro líquido.

`lib/cmv-calculator.mjs` já oferece um núcleo por período (abertura + compras − encerramento).
Ele não possui as fichas técnicas/vendas/custos históricos necessários à análise por item.
Não foi conectado a custos atuais para simular lucro. Nenhum schema, baixa ou migração foi criado.

## Validação e publicação

Retomada em 02/11/2026: instalação isolada pelo lockfile, sem alteração de dependências.
Node 22.11 do PATH era inferior ao mínimo do PDF; validação usou Node 22.23.4 temporário.
Suíte: 297/297; PDF/worker: 3/3; build e integração PDF compilada passaram.
A API fictícia recebeu UUID/token compatíveis com a sessão existente, sem mudar autenticação.
Preview responde em 4174, API fictícia em 4175. Avisos existentes: múltiplos lockfiles e CSS `end`.
Navegador indisponível nesta retomada por configuração do Work: móvel e perfil Funcionário
continuam pendentes de nova conferência visual. Revisão independente anterior foi limitada aos módulos.

Roteiro de prévia e comandos em `scripts/preview/README.md`. Testes novos cobrem dinheiro,
períodos, dados incompletos, múltiplos caixas, fontes e arquivos. B1 continua no teste de regressão.
Navegador usa API local fictícia; sem dados reais ou gravação remota. Isso não comprova homologação.
Sem merge/deploy: manter conferes de Lucas antes de aplicar à main. Rollback local: voltar ao
aplicativo atual e parar os servidores da prévia; nenhuma transformação de dados precisa ser desfeita.

## Ajustes dos oito comentários de Lucas

- Menu fecha por clique/foco externo e Escape; aviso redundante de estoque compartilhado removido.
- Relatórios exclusivos do Gestor, com filtros, indicadores e gráfico em blocos separados; Caixa operacional.
- Lista de compras usa carrinho, distinto da nota fiscal; contagem tem ação principal e opções recolhidas.
- Seletores de periodicidade usam altura/borda padronizadas; formulário de contagem e persistência preservados.
- Nome digitado foi substituído pela conta conectada. Troca de nota/conta exige nova confirmação.
- Contrato canônico inventory_get não inclui id: usa username existente; autenticação não foi alterada.
- O banco atual persiste checkedBy enviado; autoria obrigatória pelo servidor continua pendente de outra etapa.
- Modal de dia com 700px e seis modalidades em três colunas no desktop; Revisar abre o fluxo B1 com motivo.
- Revisão independente detectou/corrigiu recarga após conflito e identidade sem id; reconferência sem impeditivos.
- 302/302 testes passaram; após separar os blocos, 17/17 testes afetados e build final passaram.
- Navegador: clique fora fecha menu; modal abre correção com motivo; seletor 42px; nome automático e PDF renderizados.
- Tela 390x844: tabela contida e contagem utilizável; Funcionário sem Relatórios, custos e revisão gerencial.
- Preview somente com dados fictícios; nenhuma gravação, migração, CI remoto, merge ou deploy foi validado/executado.
- Capturas locais em tests/browser/artifacts/giro-caixa-v2.jpg e giro-contagem-v2.jpg (fora do Git).

## Incremento de UI — PR #197

Base anterior registrada primeiro em 6cf62cd, antes de abrir o rascunho, a pedido de Lucas.
A PR contém a base acumulada e um commit separado para este incremento; o total não é uma PR pequena.
- Conferência: original/dados no topo; itens em largura total, sem overflow:hidden; linhas se reorganizam no tablet.
- Original limitado a 40vh até 1100px; Expandir/Recolher libera a altura sem mudar o arquivo.
- Contagem até 620px: cartões com Sistema/Contado/Diferença; resumo e ações quebram linha.
- Caixa: filtro mês/ano separado do período do relatório; documento mostra um dia por vez pela emissão.
- Legado sem data mantém acesso explícito; ausência de registros possui estado vazio próprio.
- Relatórios: Período, seletor com espaço fixo, Faltas/Sobras separados e seções expansíveis legíveis.
- Gráfico: eixo em reais iniciado em zero, linhas de referência, extremos entre registros, ano com 12 meses.
- Mês mantém todos os dias e distingue ausência de zero registrado; clique no mês abre os dias, no dia abre caixas.
- Rolagem móvel tem dica e último registro visível; índices/alturas não alteram valores persistidos.
Referências: [eixos e linhas ONS](https://service-manual.ons.gov.uk/data-visualisation/guidance/axes-and-gridlines)
e [colunas temporais ONS](https://service-manual.ons.gov.uk/data-visualisation/chart-types/column-chart).
Validação: 15 testes afetados passaram; suíte completa final uma vez: 306 passaram, 0 falharam; build passou.
Playwright: seis larguras; seletor imóvel, ano com 12 meses, clique abre revisão, filtro e último registro verificados.
Capturas de produção: 15 antes + 15 depois, JPEG80, em 1440x900, 768x1024 e 390x844, só fixtures.
Medições incluem documento, .table-wrap e .giro-review-fields: nota/contagem sem overflow após o ajuste.
Histórico do Caixa mantém rolagem interna deliberada em 768/390; não é corte do documento.
Diagnóstico solicitado, sem correção: (a) sim; (b) sim; (c) sim. Effect do revisor, editor B1 e PDF não alterados.
Sem SQL, regras fiscais, endpoints, login/permissões, dependências ou gravações remotas neste incremento.
CL-01/02/04/05/09/10/13/15/16 verificadas; sem autoaprovação da revisão independente.
Revisão independente única: apontou fallback da emissão para importação; corrigido no mesmo ciclo.
O filtro usa somente emissão; notas sem data permanecem no grupo próprio; 7 testes afetados passaram após a correção.
A suíte de 306 foi executada uma vez antes dessa correção localizada; CI final verifica o commit publicado.
