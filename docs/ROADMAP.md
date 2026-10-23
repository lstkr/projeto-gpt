# Roadmap Estoque+

## Reposição e cadastro fiscal — entrega em validação

- Identificação do fornecedor por CNPJ (#62): preservar o nome informado, sinalizar CNPJ inválido e impedir equivalência entre CNPJs diferentes.
- Nome padrão do produto (#63): associação por código do fornecedor e unidade, sem mesclar cadastros ou destruir descrição/código fiscal original; edição manual explícita do nome de exibição.
- Impressão da lista de compras: reposição por categoria, fornecedor, saldo/mínimo, quantidade a comprar e orçamento parcial quando faltar preço. É um relatório de compra, separado da folha de contagem física (#36).
- Leitor de código de barras: adiado conforme priorização do gestor.

## Calculadora de CMV — planejada

Antes de implementar, validar com o gestor período de fechamento, inventário inicial/final, compras líquidas, devoluções, transferências, perdas e receita líquida. Fórmula inicial: CMV = estoque inicial + compras líquidas − estoque final; percentual de CMV = CMV / receita líquida, apenas quando a receita for positiva. Transferências entre unidades exigem contrapartida rastreável, sem duplicar compras no consolidado.

Critérios de aceite: custos e unidades coerentes, fontes identificadas, reprocessamento auditável, períodos fechados protegidos, alertas de dados faltantes e testes de arredondamento. Não apresentar estimativa incompleta como fechamento contábil aprovado.

## Multinegócio e administração — bloqueio de segurança para publicação

- Gestor pode ter vínculo com várias cafeterias/restaurantes e selecionar uma unidade ativa; funcionário pertence a uma única unidade.
- Cada estoque, documento, movimento, contagem e fechamento de caixa pertence a uma unidade. O identificador é validado na sessão/operação no servidor e no banco, com RLS/RPC e acesso negado a unidades sem vínculo.
- Superadministrador DBA possui área exclusiva para cadastrar gestores, estabelecimentos e funcionários. O gestor só cadastra estabelecimentos e funcionários dentro de sua autorização.
- Bootstrap protegido, hash seguro de senha fora de código/logs, troca obrigatória no primeiro acesso, proteção contra força bruta e revogação de sessões. Não registrar credenciais no roadmap ou em tickets.
- Versionar migrações, atribuir dados existentes à unidade correta e testar acesso direto, troca de unidade, sessão antiga, concorrência e negação de acesso cruzado antes de expor a interface.
- Reset de testes depende de escopo verificado, backup recuperável e rollback ensaiado. Preservar usuários e hashes existentes; revogar sessões explicitamente. Autenticação própria não é Supabase Auth.

Nenhuma interface administrativa ou seleção de unidade deve ser publicada com autorização apenas no navegador ou antes de concluir isolamento e homologação de todas as RPCs existentes.

## CTO — revisão de 22/10/2026: sete solicitações e continuidade

Fonte: conversa “Relatório do projeto”, cinco screenshots recuperados e examinados nesta execução, arquivos reais da branch principal e inventário GitHub de 21 issues / 1 PR abertos antes desta rodada. Estado é fotografia da consulta, não certificado de produção. Screenshots não foram publicados por conterem informações fiscais/operacionais.

### Encaminhamento das sete solicitações

| Item | Issue / prioridade | DRI e execução | Dependências e aceite principal |
| --- | --- | --- | --- |
| 1. Privacidade QR no banner | [#116](https://github.com/lstkr/projeto-gpt/issues/116) — P2, aberta nova | UI/UX; Frontend executa; Backend revisa aviso; QA | Aviso visível antes do upload, junto a “Da nota fiscal para o estoque”; preservar transmissão automática a terceiros e risco de dados; #28 fechada não cobre novo posicionamento. |
| 2. Painel compacto | [#68](https://github.com/lstkr/projeto-gpt/issues/68) — P2 residual, reaberta | UI/UX; Frontend; Backend valida progresso; QA | Não duplicar #68. main já unifica OCR/contador e ordena pendências; reduzir altura/espaços do cartão mantendo leitura e simultaneidade #58. Título P1 original preservado como histórico. |
| 3. Arquivo inline + salvar | [#117](https://github.com/lstkr/projeto-gpt/issues/117) — P2, aberta nova | UI/UX; Frontend; Backend/DBA validam RPC; QA | main viewPendingOriginal força anchor.download. Visualizar PDF/imagem em navegador e manter baixar; tipos inseguros não executam; sessão/tenant, popup/erro e limpeza de recursos. |
| 4. Checkbox de totais | [#118](https://github.com/lstkr/projeto-gpt/issues/118) — P1, aberta nova | Backend; Frontend após contrato; UI/UX e DBA revisam; QA | totalsReviewed participa de readyForFinalReview/confirmDocument. Retirar redundância sem autoaprovar; preservar divergências, arredondamento, invalidação e confirmação final auditável. |
| 5. Quem conferiu | [#119](https://github.com/lstkr/projeto-gpt/issues/119) — P1, aberta nova | Backend DRI; DBA contrato; Frontend após contrato; UI/UX; QA | ID/nome snapshot/unidade/data pelo servidor na transação. Rejeitar autoria forjada; legado não vira autoria autenticada retroativa. |
| 6a. Legados de fornecedores | [#62](https://github.com/lstkr/projeto-gpt/issues/62) — P1 plano, ampliada existente | DBA DRI; Backend; UI/UX/Frontend revisão humana; QA | Diagnóstico/dry-run, CNPJ e vínculos, backup verificável, restauração/testes e aprovação separada antes de executar. |
| 6b. Legados de produtos | [#63](https://github.com/lstkr/projeto-gpt/issues/63) — P1 plano, ampliada existente | Backend DRI; DBA lidera persistência; UI/UX/Frontend; QA | Separar nome de exibição de mescla física; códigos/unidades/embalagem e IDs/estornos preservados; sem consolidação por OCR. |
| 6c. Histórico e filtros | [#120](https://github.com/lstkr/projeto-gpt/issues/120) — P2, aberta nova | UI/UX; Frontend; Backend/DBA contrato; QA | #62/#63 + #119 → #120. Fornecedor/CNPJ, total, número, data/hora e autoria; sem arquivo no resumo, filtros combináveis por data/fornecedor/autor. Legados desconhecidos explícitos. |
| 7. Naming e UX leve | [#121](https://github.com/lstkr/projeto-gpt/issues/121) — P2, aberta nova | CTO naming; UI/UX diretrizes; Frontend; QA | Avaliar Estoque.Leve/Estoque+Leve com gestor; nenhuma troca automática. Paleta neutra, linguagem direta, WCAG 2.2 AA, fontes/alertas acessíveis e metas de cliques. Disponibilidade de nome/domínio/marca ainda não pesquisada. |

Atribuições acima são responsabilidades funcionais por equipe; não são assignees GitHub fictícios nem significam que agentes foram executados. CTO responde por priorização, dependências e aprovação de entrega; QA valida de forma independente. UI/UX lidera experiência, Frontend implementa componentes, Backend lidera API/regras/autoria e DBA lidera migração/RPC/RLS. Se uma camada precisar mudar, revisar contrato antes e manter PRs próprias por camada.

### Sequência e bloqueios

1. P1: #119 (autoria) e contrato de #118 (confirmação/validações), em paralelo ao diagnóstico somente leitura e planos #62/#63. Revisores Backend/DBA devem concordar antes de mudanças persistentes. QA acompanha #50/#58/#90/#94/#104 e pendências anteriores.
2. P2 independentes de migração: #116, ajuste residual #68 e #117; PRs pequenas de Frontend, com revisão Backend quando consumir APIs.
3. #62/#63: executar normalização somente após plano versionado, backup recuperável, dry-run/testes em banco descartável, restauração ensaiada e autorização explícita de produção. Não bloquear mock/layout de #120, mas entrega funcional depende de identidade/autoria validadas.
4. #120 depois dos contratos #62/#63/#119; #121 pode elaborar diretrizes agora, sem bloquear integridade fiscal. Rebranding depende de decisão do gestor.

Não executar reset, mescla automática, SQL destrutivo ou alteração de usuários/senhas. Preservar saldos, notas, movimentos, stockEntries, contagens, catalogMerges, IDs e códigos originais. Não deduzir identidade por semelhança OCR. Operações persistentes devem tratar revisão obsoleta, repetição/concorrência, isolamento por unidade e recuperação.

### Todas as demandas anteriores ainda abertas na consulta

| Issue | Prioridade desta triagem | Responsável principal / apoio | Estado e dependências |
| --- | --- | --- | --- |
| [#113](https://github.com/lstkr/projeto-gpt/issues/113) | P1 | QA | Aberta — Impressão física A4/58/80 pendente; depende de evidências em papel; parent #36. |
| [#104](https://github.com/lstkr/projeto-gpt/issues/104) | **P0** | Backend / QA-OCR | Aberta — corrigir leitura real dos casos DANFE e contingência privados; PR #125 em draft, pixels aguardam executor privado. |
| [#103](https://github.com/lstkr/projeto-gpt/issues/103) | P2 | UI/UX / Frontend | Aberta — PR #115 draft; depende da RPC #102/#114 aplicada e homologada, depois QA. |
| [#102](https://github.com/lstkr/projeto-gpt/issues/102) | P2 | DBA / Backend | Aberta — Contrato de edição de usuários; código #114 integrado segundo PR #115, implantação/homologação pendente. |
| [#99](https://github.com/lstkr/projeto-gpt/issues/99) | P2 | UI/UX / Frontend | Aberta — CMV visual depende de #98 e motor #97 (fechado); parent #85. |
| [#98](https://github.com/lstkr/projeto-gpt/issues/98) | P2 | DBA / Backend | Aberta — Contrato histórico valorizado por unidade/período antes de #99. |
| [#94](https://github.com/lstkr/projeto-gpt/issues/94) | P1 | QA | Aberta — Parent de fotos privadas/OCR; execução residual em #104, sem publicar imagens fiscais. |
| [#90](https://github.com/lstkr/projeto-gpt/issues/90) | P1 | QA / Frontend | Aberta — Gate visual de colisões/cortes; evidência requerida nas entregas de UI. |
| [#87](https://github.com/lstkr/projeto-gpt/issues/87) | P1 | CTO | Aberta — Auditoria anterior; esta matriz atualiza os estados antigos sem duplicar tickets. |
| [#85](https://github.com/lstkr/projeto-gpt/issues/85) | P2 | Backend | Aberta — CMV parent; #97 fechado, #98 → #99 pendentes. |
| [#77](https://github.com/lstkr/projeto-gpt/issues/77) | P2 | Backend | Aberta — Edição de usuários parent; #102 → #103/PR #115. |
| [#70](https://github.com/lstkr/projeto-gpt/issues/70) | P1 | Backend / DBA | Aberta — Integridade/autoria de caixa: homologar implantação e aceite; autoria fiscal nova em #119 é outro fluxo. |
| [#69](https://github.com/lstkr/projeto-gpt/issues/69) | P2 | UI/UX / Frontend | Aberta — agora inclui nome Faturamento, referências máximo/mínimo, rótulo por barra e modal compacto, além do escopo original; QA #50/#90. |
| [#63](https://github.com/lstkr/projeto-gpt/issues/63) | P1 plano; P2 evolução | Backend / DBA | Aberta — Identidade/nome e produtos legados; plano/dry-run/backup/testes antes de execução; #62. |
| [#62](https://github.com/lstkr/projeto-gpt/issues/62) | P1 plano; P2 evolução | DBA / Backend | Aberta — CNPJ/fornecedores legados; diagnóstico e migração reversível sujeitos a aprovação. |
| [#58](https://github.com/lstkr/projeto-gpt/issues/58) | P1 | Backend / UI/UX | Aberta — Conferência durante OCR/lotes; implementação anterior não substitui testes de concorrência em #50/#104. |
| [#54](https://github.com/lstkr/projeto-gpt/issues/54) | P1 | CTO / DevOps | Aberta — Permissão administrativa Vercel pendente no ticket; não alterar variáveis nem credenciais por esta rodada. |
| [#52](https://github.com/lstkr/projeto-gpt/issues/52) | P1 | CTO / DevOps | Aberta — Proteção main depende de plano/permissões do provedor conforme ticket; não equivale a bloqueio real atual. |
| [#50](https://github.com/lstkr/projeto-gpt/issues/50) | P1 | QA | Aberta — Homologação assistida: login, autorização, fiscal, caixa e concorrência; não marcar aprovado pelo build. |
| [#36](https://github.com/lstkr/projeto-gpt/issues/36) | P2; QA P1 | UI/UX / QA | Aberta — Impressão implementada segundo #113; parent continua aberto até homologação física #113. |
| [#35](https://github.com/lstkr/projeto-gpt/issues/35) | P2 adiado | Backend / UI/UX | Aberta — Scanner/balança segue adiado por priorização do gestor. |

PR aberto anterior: [#115](https://github.com/lstkr/projeto-gpt/pull/115), **draft**, edição de usuários (#103/#77). A própria descrição bloqueia merge para disponibilidade operacional antes de aplicar/homologar RPC do [#114](https://github.com/lstkr/projeto-gpt/pull/114) em ambiente autorizado. Não afirmar implantação ou QA concluídos. Nenhum outro PR aberto retornou na consulta inicial.

Pedidos anteriores de navegação: #75 (Configurações) e #82 (Permissões no perfil) estão fechados; paridade de funções/permissões segue regressão #50, sem reabrir ou duplicar sem falha observada. Fechamento em colunas segue #69. #28 privacidade e #68 processamento têm escopos prévios distintos; só #68 foi reaberta para residual demonstrado. #25 está fechada e seu contrato de identidade estável deve ser preservado. iFood #71 permanece fechado/fora do roadmap; scanner #35 segue adiado.

### Evidências e limites da rodada

- Inspeção de pages/index.js remoto: document-banner + aviso separado; fiscal-upload-progress com maxWidth 860/padding 18px 20px; viewPendingOriginal com download; totalsReviewed em gates; checkedBy digitado; history-panel com documents.map sem filtros.
- Leitura de README, perfis Backend/DBA/UI/UX e governança. package.json atual usa npm test separado de npm run build; não presumir que build executa testes.
- Alteração desta PR: somente docs/ROADMAP.md. Nenhum código de aplicação, schema, credencial, dado ou ambiente de produção alterado.
- Testes funcionais, npm test, npm run build, OCR, SQL e testes visuais **não executados nesta triagem documental**. Homologações e CI de implementação continuam gates nas issues; CI desta PR deve ser consultada no SHA final.
- Risco: fotografia de status envelhece; conferir GitHub antes de implementar. Conflitos em pages/index.js exigem integração sequencial de PRs de UI.
- Deploy: sem ação de deploy nesta rodada; não confundir merge documental com implantação funcional. Rollback documental: reverter o commit desta PR; futuros planos de dados exigem rollback próprio validado.
- Regra de continuidade CTO: a cada nova ToDoList/Roadmap, confrontar código + tickets/PRs existentes, reaproveitar issues quando houver sobreposição, definir um DRI, revisores, prioridade, dependências e critérios de aceite antes de integrar.


## CTO — faturamento, gráfico e nova rodada de implementação (22/10/2026)

O gestor relatou avanço na inserção de notas, ainda sob testes manuais. Isso é sinal de progresso, não homologação encerrada. O teste manual do gestor e o aceite independente do QA permanecem separados.

| Pedido | Issue | Prioridade | Distribuição e dependências |
| --- | --- | --- | --- |
| Inserção de notas, testes ainda em curso | [#50](https://github.com/lstkr/projeto-gpt/issues/50) | P1 homologação | QA/Integração acompanha; Frontend/Backend/DBA corrigem falhas atribuídas; usar #58/#68/#118/#119 e dados sintéticos. |
| Gráfico: máximo/mínimo mensal, valor da barra por hover e acessibilidade | [#69](https://github.com/lstkr/projeto-gpt/issues/69) | P2 | UI/UX DRI, Revenue Dashboard Frontend Engineer executor, Backend revisa cálculo e QA visual; hover equivalente por teclado/toque; dias com lançamentos definidos como base. |
| Renomear “Fechamento de caixa” para “Faturamento” | [#69](https://github.com/lstkr/projeto-gpt/issues/69) | P2 | Mesma mudança coesa de navegação/cabeçalho/mensagens; preservar contratos e permissões. |
| Upload de vários PDFs e fotos, processamento e rascunhos por arquivo | [#123](https://github.com/lstkr/projeto-gpt/issues/123) | P1 | Backend DRI, Revenue Ingestion Engineer; DBA para contrato de persistência; QA concorrência, limites e idempotência. Referências fechadas #55/#56 e concorrência #58. |
| Fila “Faturamentos pendentes”, conferência simultânea e retomada | [#124](https://github.com/lstkr/projeto-gpt/issues/124) | P1 | UI/UX DRI, Revenue Workflow Frontend Engineer; integra após contrato #123. QA teclado/mobile, falhas parciais e preservação do rascunho ativo. |
| Enxugar detalhamento financeiro | [#69](https://github.com/lstkr/projeto-gpt/issues/69) | P2 | UI/UX + Frontend organiza modal com menos rolagem, responsivo; Backend revisa reconciliação dos valores. |

A sequência para entrega do lote é #123 contrato/processamento → #124 interface integrada; exploração de protótipo pode ocorrer antes, mas não lançar nem combinar automaticamente documentos de faturamento. Cada documento tem revisão própria, totais extraídos com confiança explícita e confirmação humana. Se dois arquivos corresponderem ao mesmo período/caixa, é necessária reconciliação explícita antes de somar.

A issue #69 preserva os critérios anteriores de histórico e navegação de gráfico e agora inclui novos pontos desta rodada. Issues #55/#56 estão concluídas para arquivo individual; não serão duplicadas/reabertas.

### Estado do portfólio após a atualização

A consulta anterior encontrou 21 issues e 1 PR abertos. Foram criadas #116–#121, #68 foi reaberta por ajuste residual, e agora foram abertas #123/#124. Total esperado na rodada atual: **30 issues abertas e 2 PRs abertos** (#115 e #122); confirmar ao começar cada execução. #115 continua draft e bloqueado pela implantação/homologação descrita no próprio PR. O PR documental #122 agrega as issues e este adendo; suas verificações precisam rodar novamente no SHA atualizado.

Atribuições neste roadmap são responsabilidades funcionais e nomes de engenharia por especialidade, não contas de usuários inventadas no GitHub. Criar PR separada por issue/camada quando houver mudança concreta; associar PR ao número da issue e passar evidência ao QA. Resolver todos em paralelo quando contratos permitirem; serializar mudanças concorrentes em pages/index.js e a integração de #123/#124.


## CTO — prioridade máxima para OCR das notas anexadas (22/10/2026)
Os dois anexos se alinham aos exemplos privados fiscal-04 (DANFE) e fiscal-06 (cupom em contingência) da #94/#104. A #104 existente foi promovida a **P0**; nenhuma cópia das imagens, dados fiscais, nomes ou chaves foi enviada a issues/PR/CI.
- **Backend Specialist / Receipt OCR Engineer:** DRI da correção do pré-processamento/segunda leitura; avaliar efeito por campo e manter parser/fallback.
- **QA Specialist / OCR Validation Engineer:** co-DRI para OCR real nos pixels e golden humano anonimizado em executor/acervo privado.
- **UI/UX:** garantir revisão explícita de incertezas. DBA entra somente se persistência/RPC mudar. CTO mantém o gate de lançamento.
- [PR #125](https://github.com/lstkr/projeto-gpt/pull/125) contém uma primeira tentativa: segunda leitura adaptativa em casos que já pedem retry, com teste sintético. Está **draft** até confirmar melhora nos dois originais em ambiente privado.
- Testes de texto validam parser, não OCR por imagem. Os anexos reais não foram reconhecidos aqui porque o modelo de português precisaria ser baixado e a rede bloqueou a requisição; as fotos não foram transmitidas.
- Prioridade P0 não autoriza ignorar conferência humana. Qualquer item/código/unidade/quantidade/valor incerto permanece revisável; erro de totais não pode ser aprovado silenciosamente.

CI da PR #125 ainda está em execução. Testes locais: 152 aprovados; build local concluiu em Node 24 (projeto pede 22). O roteiro completo de campos, comparação antes/depois, golden anonimizado e homologação pixel-a-pixel seguem pendentes sob #104.


## CTO — estado atualizado dos PRs e implementação (#116–#124, 23/10/2026)

Esta fotografia substitui as contagens e os estados anteriores deste documento. Consultada a branch main e os PRs remotos; issues continuam abertas até o aceite integral de cada camada.

| PR | Issue(s) | Estado observado | Gate / limite |
| --- | --- | --- | --- |
| [#125](https://github.com/lstkr/projeto-gpt/pull/125) | #104 P0 | Aberto, draft | Testes sintéticos/build local relatados no próprio PR; validação privada por pixels dos dois documentos e CI observável ainda pendentes. |
| [#126](https://github.com/lstkr/projeto-gpt/pull/126) | #116/#117 | Aberto, draft | UI de privacidade e visualização; QA manual de tipos, permissão, teclado e viewport ainda pendente. |
| [#127](https://github.com/lstkr/projeto-gpt/pull/127) | #68/#69 | Aberto, draft | UI de faturamento; QA visual/manual ainda pendente. |
| [#128](https://github.com/lstkr/projeto-gpt/pull/128) | #119 backend | Aberto, draft | Migração server-side proposta; PG15/17 e revisão Backend/DBA ainda são gates; não aplicada. |
| [#129](https://github.com/lstkr/projeto-gpt/pull/129) | #121 | Aberto, draft | Avaliação de naming/diretrizes somente documental; parcialmente atende #121, sem decisão de marca/domínio e sem encerrar a issue. |
| [#130](https://github.com/lstkr/projeto-gpt/pull/130) | #118 | Aberto, draft | UI remove checkbox redundante; contrato fiscal e QA de regressão ainda precisam de aceite. |
| [#131](https://github.com/lstkr/projeto-gpt/pull/131) | #119 frontend | Aberto, draft | Depende de #128. Após revisão, autoria só é marcada verificada depois de leitura `inventory_get` e correspondência com sessão/usuário; falha de leitura deixa autoria pendente. Não altera banco/API. Teste focalizado 5/5 passou e há build local bem-sucedido no snapshot isolado; CI do SHA atual mostra Actions falhando sem steps/logs (404 BlobNotFound) e status Vercel por limite de builds. Isto não comprova falha de código nem CI verde. |
| [#134](https://github.com/lstkr/projeto-gpt/pull/134) | #123 backend | Aberto, draft | RPC/armazenamento de relatórios pendentes de faturamento; testes PostgreSQL 15/17 não executados localmente e CI/homologação são gates. #124 continua separado e dependente deste contrato. |
| [#136](https://github.com/lstkr/projeto-gpt/pull/136) | #120 frontend | Aberto, draft; baseado na branch #131 | Filtros locais por data fiscal disponível, texto fornecedor/CNPJ e autoria/situação. Não inventa data de lançamento, identidade canônica ou legado. Testes focados 7/7 e build Next no snapshot isolado passaram; suíte ampla da cópia mista falha em fixtures de #126/#127 ausentes, e os workflows remotos estão sem steps/logs (404 BlobNotFound) com Vercel limitado. |
| [#133](https://github.com/lstkr/projeto-gpt/pull/133) | #132 | Aberto | Mudança de segurança de sessões; revisar sequência com as migrações #114 antes de qualquer implantação. |
| [#115](https://github.com/lstkr/projeto-gpt/pull/115) | #103/#77 | Aberto, draft | Condicionado à aplicação autorizada e homologação da RPC #114. |

### Pendências que não podem ser declaradas concluídas

- #120 permanece parcial: o histórico não recebe timestamp real de lançamento do servidor; `importedAt` é texto local sem ano e `date` indica data do documento. A interface chama o campo pelo significado disponível. É necessário contrato Backend/DBA para data/hora server-side antes de satisfazer integralmente esse critério.
- Fornecedor/CNPJ em #120 usa somente os valores já presentes no JSON do documento. #62/#63 seguem abertas; não há vínculo canônico validado nem migração de dados. Não alterar ou consolidar cadastros por esta interface.
- #121 continua aberta: PR #129 é avaliação documental parcial, sem decisão do gestor ou pesquisa legal/domínio.
- #119 não está concluída até #128 passar validações e revisão Backend/DBA, #131 integrar com base compatível e QA confirmar a autoria em sessão real.
- #104 continua P0. Não promover #125 por testes sintéticos ou build sem OCR privado por pixel e conferência humana.
- #123/#124 continuam separados: #124 pode começar sobre o contrato proposto em #134, mas não muda API/schema e não libera publicação antes dos checks, revisão e homologação.

Nenhuma PR desta lista foi mergeada por esta atualização; nenhuma migration ou deploy foi executado. Em #131 e #136, o status de CI foi inspecionado: Actions reportam failure com jobs sem steps e os logs não estão disponíveis (404 BlobNotFound); o status Vercel reporta rate limit de builds por 24h. Não classificar esses resultados como testes de aplicação reprovados ou CI aprovada.


### Adendo CTO — sessão revogada em voo (#132/#133/#135)

Em resposta à revisão P0, [PR #135](https://github.com/lstkr/projeto-gpt/pull/135) foi convertido para **draft** em 23/10/2026; permanece aberto, sem merge/deploy. O navegador marca `sessionRevokedRef` antes de alterar estado, cancela novas gravações enfileiradas de `inventory_save` e bloqueia chamadas por `invokeAdministration` após detectar revogação. A verificação de saúde ocorre periodicamente e não classifica falha transitória de rede como revogação.

A proteção de concorrência é também server-side na proposta #133: `private.require_actor` tornou-se VOLATILE e adquire `FOR SHARE OF s` na sessão. A inativação precisa alterar/revogar a linha correspondente, esperando operações que já possuam o lock; ao retornar/confirmar a inativação, as sessões anteriores terminaram, e novos RPCs falham pela sessão revogada/inativa. Assim, operação já autorizada e iniciada antes do commit da inativação pode terminar primeiro; a garantia é que nenhuma operação protegida começa com sucesso depois do commit. O frontend reduz a janela visual, e o banco é a autoridade.

Ainda é necessário validar operacionalmente o interleaving concorrente em PostgreSQL 15/17, prova de lock/revogação em #133, teste Playwright de #135 no head e o comportamento das demais RPCs/mutações. Não liberar publicação com checks sem etapas/logs ou apenas unit tests.

Na consulta atual, o SHA de #135 é `6ba702e47a6c4ed6d275614df9931c23a469c4d8` e os workflows registrados estão reportados como `sem resultados`; não usar status sem logs como prova de teste concluído.

## CTO — atualização de #124 e validação de CI no SHA atual do roadmap (23/10/2026)

- [PR #138](https://github.com/lstkr/projeto-gpt/pull/138), **draft**, implementa a camada Frontend da #124 sobre a branch contratual #134. A interface recebe até cinco PDFs/fotos por lote, conserva rascunhos independentes, mostra estados/retentativa/cancelamento, exige conferência individual e oferece prévia e download protegidos por assinatura/MIME. HTML/SVG não são aceitos. A PR não altera API, schema ou banco e não conclui a issue; revisão Backend/DBA/UI/UX, CI observável, integração no SHA final e QA manual ainda são gates.
- Validação focal disponível para o helper de MIME, bytes/base64 e nome seguro: 2 testes aprovados. O teste de integração da tela, suíte completa e build não foram executados nesta execução. Continuam pendentes homologação com lote real de até cinco arquivos, erro/retry, revisão parcial, autorização de cancelamento, sessão expirada, prevenção de duplicidade, teclado e viewport móvel.
- No head documental `59085ceda832ccd30c028e2c9bb10ec4b9593cfe`, os seis workflows GitHub retornaram failure sem logs úteis para confirmar execução; o status combinado também indicou rate limit do Vercel. No head documental mais recente observado, `160a56e1fc07808a7607de12e3ce227b5a8dc740`, o status combinado continua com rate limit Vercel e a consulta ainda não retornou execuções de Actions. Esses estados não demonstram testes de aplicação reprovados nem aprovação de CI. Um status verde de SHA anterior não cobre os heads atuais. PR #122 permanece aberta sem merge até haver evidência de checks executáveis no head vigente.
- Nenhuma PR foi mergeada, nenhuma migration executada e nenhum deploy foi feito por esta atualização. #104 permanece P0; a implementação de #124 depende de #134 e não deve ser publicada antes dos gates contratuais e de homologação.
