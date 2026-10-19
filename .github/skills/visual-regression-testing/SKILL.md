---
name: visual-regression-testing
description: Planejar, executar e analisar regressões visuais de telas React/Next.js do Estoque+, especialmente em notebooks, celulares, tabelas e popovers. Usar em mudanças de CSS, layout, responsividade ou componentes visuais.
---

# Visual Regression Testing — Estoque+

## Objetivo
Detectar cortes, sobreposições, mudanças inesperadas, botões inacessíveis e regressões de layout antes de publicação.

## Procedimento obrigatório
1. Mapear telas atingidas: Estoque, Notas fiscais, Conferência de NF, Fechamento de caixa, Contagem de estoque, Lista de compras e navegação/usuário.
2. Definir a matriz mínima de viewports: 320×700, 375×812, 768×1024, 1024×768, 1280×800 e 1920×1080. Incluir 1366×768 se a tarefa envolver notebooks.
3. Testar menu expandido/recolhido, tabela com vários itens, texto longo de fornecedor, campos de valores, tooltip/popover aberto, carregamento, erro e estado vazio.
4. Usar Playwright para capturar screenshots e comparar baselines **quando estiver disponível**. Se a ferramenta não estiver instalada no projeto, propor uma implantação incremental em PR próprio; não afirmar cobertura inexistente.
5. Preparar fixtures sintéticas, estáveis e sem dados pessoais/credenciais. Congelar dados, horário, animações e fontes quando necessário para reprodutibilidade.
6. Avaliar diffs com critérios de legibilidade e usabilidade, não só porcentagem de pixels. Atualizar baseline apenas depois de revisão consciente da alteração esperada.
7. Executar `npm test` e `npm run build` além de qualquer validação visual aplicável; reportar resultados e limitações de ferramentas.

## Invariantes e critérios de regressão
- `document.documentElement.scrollWidth <= window.innerWidth` em telas sem tabelas transbordando a página.
- Tabelas longas rolam *dentro* de `.table-wrap`, sem cortar botões importantes nem ocultar campos de confirmação.
- Ações primárias, rótulos, inputs e diálogos permanecem visíveis e operáveis nos viewports analisados.
- Popovers de avisos fiscais não são cortados pelo contêiner de scroll e não ocultam ações essenciais.
- Conteúdo não é encoberto por sidebar, drawer ou topbar.
- Layout deve suportar zoom 200% e aumento de texto; falhas devem ser informadas com evidência.

## Saída esperada do teste
Registrar viewport, navegador, commit, tela/estado, evidência (screenshot ou observação verificável), problema reproduzido, decisão e estado após correção. Separar claramente **teste executado**, **teste sugerido** e **não testado**.

## Referências
- https://playwright.dev/docs/test-snapshots
- https://playwright.dev/docs/visual-comparisons
- https://web.dev/learn/design/
