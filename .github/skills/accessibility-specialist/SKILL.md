---
name: accessibility-specialist
description: Projetar e auditar acessibilidade WCAG 2.2 AA em interfaces React/Next.js do Estoque+, incluindo formulários, tabelas, menus, alertas, navegação por teclado e experiências móveis.
---

# Accessibility Specialist — Estoque+

## Objetivo
Assegurar que o sistema seja utilizável por teclado, toque, tecnologias assistivas e pessoas com baixa visão, sem comprometer a segurança e a integridade fiscal.

## Revisão por componente
1. **Semântica:** use botões para ações, links para navegação, labels de inputs, títulos hierárquicos e tabelas com cabeçalhos compreensíveis.
2. **Teclado e foco:** ordem lógica, estado de foco visível, Escape para fechar popovers/menus, foco restaurado quando pertinente. Evitar armadilhas de teclado.
3. **Feedback:** erros textuais junto do campo; `aria-live` ou `role="status"` para resultados assíncronos; alertas urgentes com `role="alert"` quando adequado, sem anúncios repetitivos.
4. **Avisos fiscais:** nunca comunicar perigo somente por amarelo ou ícone; permitir ver todos os detalhes pelo teclado e pelo toque, sem depender exclusivamente do hover.
5. **Visual:** seguir WCAG 2.2 nível AA, verificar contraste de texto/controles, reflow a 320px, zoom de 200%, tamanho de fonte e espaçamento. Alvos interativos de pelo menos 24×24 CSS px (com espaço equivalente quando aplicável); preferir área tocável de 44×44px em telas móveis.
6. **Dialogs e menus:** indicar `aria-expanded`, `aria-controls` quando relevante; gerenciar foco e fechamento; não deixar conteúdo inacessível atrás de overlay.
7. **Formulários financeiros:** descrever moeda/unidade, erros e relação entre subtotal, desconto e valor líquido; não aceitar alterações silenciosas.

## Como validar
- Revisão manual com Tab, Shift+Tab, Enter, espaço, setas quando pertinente e Escape.
- Teste com leitor de tela (NVDA/VoiceOver) quando acessível.
- Auditoria automatizada com `axe-core`/`@axe-core/playwright` somente se instalado/disponível; ferramenta automática não substitui teste manual.
- Revisar fluxo real: abrir nota, interpretar alerta, marcar item conferido, verificar total, confirmar entrada no estoque, voltar ao menu e sair.
- Reportar conformidades, violações, severidade e limites da validação. Nunca declarar certificação WCAG apenas por usar componentes semânticos.

## Referências
- https://www.w3.org/TR/WCAG22/
- https://www.w3.org/WAI/ARIA/apg/
- https://github.com/dequelabs/axe-core
