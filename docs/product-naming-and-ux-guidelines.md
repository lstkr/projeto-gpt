# Recomendação de naming e diretrizes de UX leve

Este documento atende à [issue #121](https://github.com/lstkr/projeto-gpt/issues/121). Ele registra uma recomendação de produto e critérios de interface para cafeterias, pequenas lancherias e food trucks. Não autoriza rebranding, registro de domínio, alteração de marca, IDs ou integrações.

## Decisão recomendada

Manter **Estoque+** como identidade principal até uma decisão explícita do gestor. Usar “leve e acessível no dia a dia” como posicionamento descritivo, sem alterar nome de produto, telas, domínio ou integrações neste trabalho.

Essa escolha preserva reconhecimento e reduz custo de transição enquanto o sistema ainda está evoluindo. A promessa de simplicidade pode ser testada nas tarefas reais antes de ser incorporada à marca.

| Opção | Clareza, fala e memorização | Acessibilidade e público | Avaliação |
| --- | --- | --- | --- |
| **Estoque+** | Curto e familiar para quem já conhece o produto. O sinal “+” pode ser pronunciado de modos diferentes e não explica por si só o benefício. | Fácil de ler; manter uma forma escrita oficial e um nome acessível consistente em interfaces e materiais. Serve aos três segmentos sem restringir o produto a cafeteria. | Melhor para continuidade enquanto a marca atual já está em uso. |
| **Estoque.Leve** | “Leve” comunica simplicidade, mas o ponto pode parecer parte de um endereço web e gerar variação ao falar ou pesquisar. | Pontuação pode ser anunciada por tecnologias assistivas; verificar como o nome será pronunciado em leitores de tela e em busca por voz. | Mais distintivo visualmente, com maior risco de leitura como domínio. |
| **Estoque+Leve** | Une a marca atual à ideia de leveza, mas a escrita concatenada pode parecer uma expressão ou recurso, e não um nome. | “+” e a ausência de espaço podem dificultar leitura rápida, fala, busca e escrita consistente. | Comunica continuidade e benefício, mas exige uma forma falada e escrita padronizada. |

A tabela é uma avaliação linguística e de produto, não pesquisa de usuários nem parecer jurídico. Não foi verificada disponibilidade de marca, nome empresarial, domínio, redes sociais ou conflitos de terceiros. Essas verificações devem ser feitas em fontes próprias por responsável designado antes de qualquer decisão de registro ou publicação. Fazer uma rodada curta de teste com funcionários/gestores de cafeterias, lancherias e food trucks antes de aprovar um nome novo.

## Diretrizes de interface versionadas

Aplicar estas diretrizes incrementalmente nas telas existentes. UI/UX lidera o desenho; Frontend implementa após aceite; Backend e DBA validam impactos apenas quando houver mudança de contrato ou persistência; QA mede o resultado.

### Linguagem e fluxo

- Usar frases curtas, palavras comuns e verbos que indiquem a ação: “Abrir arquivo”, “Conferir nota”, “Lançar no estoque”.
- Manter uma ação principal por contexto e agrupar detalhes relacionados. Reduzir passos redundantes, sem remover confirmação humana, autorização, validação fiscal ou proteção contra ações destrutivas.
- Dar nomes consistentes a telas e ações. Não usar abreviações sem explicação.
- Informar o que está acontecendo e o próximo passo em estados de carregamento, sucesso, erro, indisponibilidade ou dados incompletos.
- Mostrar origem e confiança dos dados fiscais (documento oficial, QR, OCR ou edição manual) e manter divergências visíveis até revisão.

### Acessibilidade e apresentação

- Usar uma paleta neutra como base, reservando cores semânticas a estados. Texto, ícone ou rótulo devem explicar o estado; nunca depender só da cor.
- Verificar contraste de texto, controles, foco e estados visuais segundo WCAG 2.2 nível AA.
- Usar fontes legíveis, permitir zoom do navegador sem perda de conteúdo ou função e evitar informação essencial em texto minúsculo.
- Garantir rótulos associados, ordem de leitura coerente, navegação por teclado, foco visível e mensagens de erro anunciáveis.
- Dimensionar controles para toque confortável; buscar 44 × 44 CSS px quando o layout permitir e, nos demais casos, validar o mínimo aplicável e as exceções de WCAG 2.2 AA.
- Alertas fiscais, falhas e pendências críticas permanecem visíveis sem hover e são compreensíveis em tela sensível ao toque.

### Estados e tamanhos de tela

Para cada fluxo, revisar carregamento, sucesso, vazio, erro recuperável, indisponibilidade externa e dados parciais. Validar em 320, 375, 768 e 1366 px, incluindo teclado, toque, zoom de 200% e leitura por tecnologia assistiva. Em telas estreitas, priorizar conteúdo e ações, sem ocultar alertas críticos nem criar rolagem horizontal da página.

Checklist manual para cada tela revista:

- [ ] Layout utilizável em 320, 375, 768 e 1366 px.
- [ ] Fluxo operável por teclado, com foco visível e sequência lógica.
- [ ] Zoom de 200% preserva conteúdo, controles e mensagens.
- [ ] Contraste e estados atendem WCAG 2.2 AA; informação não depende apenas de cor.
- [ ] Alertas críticos continuam disponíveis sem hover.
- [ ] Carregamento, vazio, sucesso, erro e indisponibilidade têm mensagem e próximo passo claros.
- [ ] Ações fiscais e destrutivas continuam protegidas e auditáveis.

## Medição de usabilidade

Não há baseline de cliques ou tempo observado anexado a esta recomendação; portanto, nenhum número atual ou meta de redução é declarado. Depois que as telas estiverem acessíveis para teste, QA e UI/UX devem observar pessoas representativas do público completando, sem orientação, estes fluxos:

1. Importar, conferir e lançar uma nota.
2. Abrir um arquivo pendente e acessar o original.
3. Encontrar um registro no histórico usando os filtros disponíveis.

Para cada tentativa, registrar conclusão, cliques/interações, duração, erros e recuperação, viewport/dispositivo e necessidade de ajuda. Reportar quantidade de participantes, método e mediana/faixa observada. Só então propor metas com o gestor. Não otimizar uma métrica à custa de conferência fiscal, autorização, rastreabilidade ou confirmação segura.

## Próximos passos e dependências

- Gestor: decidir se mantém Estoque+ ou solicita estudo de rebranding; aprovar a linguagem de posicionamento.
- CTO: solicitar pesquisa de disponibilidade legal/digital antes de qualquer registro ou troca pública.
- UI/UX: validar esta recomendação com usuários e preparar protótipo/checklist visual numa entrega própria.
- QA: estabelecer baseline observada dos fluxos acima e validar responsividade/acessibilidade.
- Frontend: implementar padrões aprovados em PRs específicos, sem mudança de marca antes da decisão.
- Backend/DBA: nenhuma alteração necessária para este documento; avaliar somente se futuras mudanças aprovadas afetarem APIs, identidade persistida ou integrações.

Este documento não fecha a decisão de naming nem declara os critérios visuais implementados no produto.