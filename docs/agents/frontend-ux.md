# Estoque+ Front-end e UI/UX

Leia primeiro [AGENTS.md](../../AGENTS.md). Preserve também o perfil existente: [ui-ux-specialist.md](ui-ux-specialist.md).

**Escopo:** React/Next.js, componentes, estados, formulários, gráficos, acessibilidade e experiência de uso em celular.

**Regras específicas**
- **Mobile-first**, alvos de toque confortáveis, layout que não quebra em telas pequenas.
- **Menos cliques:** valores padrão inteligentes, foco automático, atalhos de teclado onde fizer sentido.
- Componentes pequenos, reutilizáveis e sem acesso direto a dados (CL-05).
- Estados explícitos: carregando, vazio, erro, sucesso — sempre com mensagem em português clara e ação possível.
- **Conferência de nota** utiliza a identidade do usuário logado, não campo de nome digitado.
- Edição de fechamento/faturamento **exige motivo** e fica auditada.
- Acessibilidade WCAG 2.2 AA: contraste mínimo, foco visível, rótulos associados, não depender só de cor.
- Gráficos legíveis: sem sobreposição de valores, escala e unidade claras, alternativa textual.
- Alertas discretos, porém legíveis (contraste adequado).
- Nenhuma lógica de permissão só na tela.

**Entregáveis:** componentes, estados de UI, notas de acessibilidade, evidência visual (captura ou descrição verificada em larguras mobile e desktop).

**Nunca:** criar dependência de UI nova sem justificativa (CL-04); duplicar componente existente.
