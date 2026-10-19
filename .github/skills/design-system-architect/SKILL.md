---
name: design-system-architect
description: Padronizar componentes, design tokens, estilos, comportamento e arquitetura visual do Estoque+; usar em mudanças de layouts, formulários, tabelas, navegação ou criação de componentes reutilizáveis.
---

# Design System Architect — Estoque+

## Objetivo
Construir consistência visual e funcional de forma incremental, mantendo interface prática para funcionários e gestores da cafeteria.

## Ao receber uma tarefa
1. Localize padrões existentes em `styles/globals.css` e componentes em `pages/index.js` antes de introduzir novos. Evite criar estilos duplicados.
2. Identifique elementos compartilháveis: botões, campos, rótulos, cartões, tabelas, alertas de revisão, popovers, diálogos, menus, status e loading.
3. Use tokens semânticos para cores (fundo, texto, borda, sucesso, aviso, erro), tipografia, espaçamentos, raio, sombras e estados; mantenha contraste suficiente. Preserve aparência atual quando mudanças drásticas não foram pedidas.
4. Prefira variantes explícitas e interfaces previsíveis a seletores globais que afetem outras telas. Componentes reutilizáveis podem ser extraídos gradualmente sem migração ampla.
5. Garanta cinco estados quando aplicáveis: padrão, foco, hover, desabilitado, erro, além de loading/vazio/sucesso quando forem parte do fluxo.
6. As tabelas de notas e estoque podem ter rolagem interna, mas os campos críticos e botões de ação devem continuar encontráveis.
7. Escolha tamanhos e espaçamentos legíveis em notebook e celular, priorizando digitação de quantidade, custo, data e busca de produtos.

## Padrões
- Botões: ação primária visualmente inequívoca; ações destrutivas separadas e confirmadas.
- Formulários: rótulo visível e unidade correta; explicação perto do campo; erros adjacentes; evitar cálculos manuais quando deriváveis com segurança.
- Alertas fiscais: ícone + texto acessível, contexto e forma de correção, nunca apenas cor.
- Componentes: sem lógica de autorização exclusivamente no front-end; os controles do banco continuam soberanos.
- Valores: moeda BRL legível; não alterar dados ao apenas formatar.

## Checklist de aceite
- Sem CSS conflitante ou duplicado evidente.
- Componente se comporta de modo consistente em pelo menos uma tela desktop e uma móvel.
- Estados de foco, erro e desabilitado estão definidos.
- Refatoração incremental, de baixa regressão.
- Evidência de teste ou ressalva explícita sobre testes pendentes.

## Referências
- https://www.w3.org/WAI/ARIA/apg/
- https://m3.material.io/foundations/design-tokens/overview
- https://react.dev/learn/thinking-in-react
