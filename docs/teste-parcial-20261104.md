# Apontamentos do teste parcial de 04/11/2026

O responsável não concluiu o roteiro completo. Os anexos são evidências privadas de
problemas, não aprovação de homologação. Nenhum original ou dado fiscal foi copiado
para fixtures. Testes sintéticos não comprovam OCR dos pixels das fotos anexadas.

| Comentário | Tratamento | Situação |
|---|---|---|
| 1 | Remover aviso local duplicado; preservar aviso de privacidade final | Implementado; reteste humano pendente |
| 2–4 | Compactar cabeçalhos/colunas, mostrar Entrada/saída e manter ações no viewport | Navegador sintético 1254/1024/390 aprovado; falta aceite humano |
| 5 | Mensagem de QR ausente dentro de Origem da identificação | Implementado; reteste humano pendente |
| 6 | Explicar limite da chave: identificação não comprova consulta/itens | Implementado; divergências continuam visíveis |
| 7 | Metadados no card fornecedor/nota; preencher número vazio e preservar divergência | Teste sintético e browser aprovados; reteste real pendente |
| 8 | Listas mês/ano, dez anos anteriores, duplo clique e roda no campo focado | Teste unitário e roda real aprovados; falta Safari/Firefox |
| 9 | Fonte, borda e foco do motivo iguais aos campos do formulário | Implementado; reteste humano pendente |
| 10 | Exibir suprimentos/sangrias e descrições, sem misturar com vendas | Browser sintético aprovado; cálculo e persistência inalterados |
| 11 | Entrada sem documento na tela Estoque, com o mesmo handler | Browser sintético aprovado; não lançado no banco |
| 12 | Reconhecer pedido separadamente do número fiscal e preservar descrição | Implementado com teste sintético; OCR das fotos reais não homologado |
| 13–14 | Abreviar cabeçalhos/opções e descrição editável em várias linhas | Implementado; reteste humano pendente |
| 15 | Remover aviso final redundante; manter conferência final e validações | Implementado; não lança automaticamente |
| 16 | Leitura local da DANFE por regiões, acionada e conferida pelo usuário | Releitura opcional por títulos da imagem, cancelável; teste real pendente |

Validação inicial: npm test 333/333; build aprovado com placeholders públicos;
catálogo/teclado/conferência/CNPJ e relatórios testados em navegador isolado.
Sem banco, API, permissões ou cálculos financeiros alterados. Sem merge autorizado.
CL-04/05/07/11/13/15/16 conferidas no diff; dívida de tamanho da página legada
continua fora do escopo. Reverter o commit reverte interface/preenchimento, sem migração.

Rodada OCR: pedido comercial tem referência própria, sem virar número fiscal;
a descrição anterior à linha numérica é preservada, sem transformar embalagem em
unidade/conversão. Reinterpretação do texto salvo exige confirmação e nova revisão.
DANFE regional localiza título e rodapé, limita a três reconhecimentos no mesmo
worker e encerra recursos em falha/cancelamento/timeout. Sem título único, mantém
o rascunho. Resultado só é aplicado após confirmação; não altera estoque.
Não foi executado OCR dos pixels dos originais anexados nesta rodada; ganho de
qualidade das fotos reais continua pendente de teste humano privado.

Validação da rodada OCR: npm test 343/343 e build aprovados; navegador isolado
aprovou pedido salvo, CNPJ, conferência, caixa e impressão em seis larguras.
Visibilidade de aba oculta não foi reproduzida; teste humano continua pendente.
