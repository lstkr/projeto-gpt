# AGENTS.md — Diretrizes dos Agentes do Estoque+

Este arquivo é a referência **global e obrigatória** para qualquer agente que altere este repositório. Antes de trabalhar, leia o `README.md`, o código relevante e o perfil da sua especialidade em `docs/agents/`. As regras específicas complementam este documento; em caso de conflito, prevalecem **segurança, integridade dos dados e preservação das funcionalidades existentes**.

Versão de adoção: 26/10/2026. Responsável humano: Lucas. Assuma um agente por vez; o CTO coordena trabalhos entre especialidades. Comece cada resposta com `Agente: <nome>` e `Escopo desta entrega: <1 linha>`.

## Regra inegociável

> **Nenhuma alteração pode comprometer a integridade do estoque, a segurança dos usuários ou funcionalidades existentes.**

Não considerar uma implementação concluída sem validação proporcional ao risco. Não afirmar que um teste, deploy, migração ou integração funcionou sem evidência de execução.

## Contexto técnico atual (verifique novamente antes de alterar)

- Aplicação Next.js com **Pages Router** (`pages/index.js`, `pages/api/`), React e JavaScript (`.js`/`.mjs`).
- Lógica reutilizável em `lib/`, estilos atuais em `styles/globals.css` e testes Node em `tests/*.test.cjs`.
- Banco PostgreSQL no Supabase; referência SQL em `db/schema.sql` e arquivos complementares em `db/`.
- Estado compartilhado do estoque em `public.shared_inventory.state` (JSONB), com controle de revisão, RPCs e regras de acesso no banco.
- Autenticação **própria**, com `private.app_users`, `private.app_sessions` e papéis `admin` (Gestor) e `employee`. **Não presumir Supabase Auth** nem uma estrutura relacional de estoque que ainda não exista.
- Integrações com OCR, QR Code e serviços fiscais são **assistivas**; exigem conferência humana antes de efetivar lançamentos.
- TypeScript e Tailwind CSS podem orientar evolução futura do front-end, mas **não são pressupostos nem dependências já instaladas**. Não migrar o projeto ou adicionar bibliotecas sem justificativa.

Se qualquer informação acima estiver diferente na branch de trabalho, o **código verificado** é a fonte da verdade: atualize a documentação quando necessário.

## 6. Agentes e responsabilidades

| Agente | Perfil obrigatório | Responsabilidade principal |
| --- | --- | --- |
| **CTO / Tech Lead** | [CTO](docs/agents/cto.md) | Plano, ADR, risco, dependências, evidências e decisão humana de merge. |
| **Guardião de Código Limpo** | [Guardião](docs/agents/guardiao-codigo-limpo.md) | Revisão CL-01…CL-16 com veto; não aprova própria autoria. |
| **OCR/Fiscal** | [OCR/Fiscal](docs/agents/ocr-fiscal.md) | Extração, validação, qualidade e fixtures anonimizadas. |
| **DevOps/Release** | [DevOps](docs/agents/devops-release.md) | CI, ambientes, observabilidade, homologação e rollback autorizado. |
| **Estoque+ Back-end Specialist** | [docs/agents/backend-specialist.md](docs/agents/backend-specialist.md) | APIs, autenticação e autorização no servidor, regras de negócio, integrações fiscais, concorrência, testes de contrato, desempenho, CI/CD. |
| **Estoque+ Database Architect** | [docs/agents/database-architect.md](docs/agents/database-architect.md) | PostgreSQL/Supabase, schema, migrações, RLS/RPC, transações, integridade fiscal, auditoria, recuperação. |
| **Estoque+ UI/UX Specialist** | [docs/agents/frontend-ux.md](docs/agents/frontend-ux.md) | Interface, arquitetura da informação, acessibilidade, responsividade, formulários, estados, desempenho e testes visuais. |
| **Estoque+ Security Specialist** | [docs/agents/seguranca.md](docs/agents/seguranca.md) | Auditoria ofensiva/defensiva, gatilho de segurança em cada push, análise de vulnerabilidades, autorização, persistência e triagem de achados. |
| **Estoque+ QA Specialist** | [docs/agents/qa.md](docs/agents/qa.md) | Validação independente, regressões, evidências por SHA e parecer antes da homologação; rotina diária econômica existente. |

Segurança automatizada: workflow `.github/workflows/security-redteam.yml` roda após cada push de commit para qualquer branch e nos PRs; auditoria contextual de alto risco continua com o Security Specialist. Falha no check não bloqueia pushes diretos sem regras de proteção de branch (#52).

Consulte também [docs/agents/README.md](docs/agents/README.md). **Arquivos de perfil não criam agentes autônomos automaticamente**: orientam o agente convocado no chat ou na ferramenta de desenvolvimento.

### 6.8 Segurança — Criação de contas

O fluxo atual exige bootstrap do DBA/proprietário com [scripts/admin/bootstrap.mjs](scripts/admin/bootstrap.mjs), que cria o superadministrador, seguido da criação do Gestor pelo DBA na administração da aplicação. O Gestor cria Funcionários no estabelecimento autorizado; não cria outros Gestores. O bootstrap exige autorização separada e nunca deve ser executado pelo agente com credenciais do responsável.

A senha MASTER é uma [proposta futura](docs/security/master-provisioning-design.md), não um mecanismo implementado nem uma variável obrigatória do fluxo atual. Consulte o [perfil de Segurança](docs/agents/seguranca.md).

### Coordenação obrigatória

- Alterar **endpoint ou contrato de API**: Back-end lidera; UI/UX valida consumidores; Database Architect valida impactos persistentes.
- Alterar **schema, RPC, RLS ou migração**: Database Architect lidera; Back-end valida chamadas existentes, compatibilidade e autorização.
- Alterar **interface ou fluxo**: UI/UX lidera; Back-end valida APIs, permissões e regras de negócio.
- Alterar **entrada/estorno de NF, saldo, contagem, exclusão ou consolidação de produtos**: Back-end e Database Architect avaliam em conjunto atomicidade, concorrência, rastreabilidade e impacto fiscal; UI/UX mantém a conferência clara.
- Nenhum agente redefine unilateralmente os contratos ou regras de outro. Se não houver como consultar outro agente na mesma execução, documente a dependência, limite o escopo e não altere silenciosamente a outra camada.

## Segurança e autorização

1. **Nunca** usar apenas botões ocultos, rotas de interface ou estado do navegador como autorização. Validar identidade, sessão válida, papel e permissão por operação/recurso no servidor e, onde aplicável, no banco.
2. Aplicar **menor privilégio**, proteção contra acessos diretos indevidos, validação de entradas e saída mínima de dados. Não expor custo e informações administrativas a perfis sem permissão.
3. Não expor senhas, tokens, service role/secret keys, documentos fiscais pessoais ou dados de produção no repositório, logs, respostas de API, testes ou telas.
4. Revisar funções `SECURITY DEFINER`, privilégios `EXECUTE`, `search_path`, RLS e schemas expostos ao modificar SQL. Não presumir que a existência de RLS, isoladamente, restringe uma RPC privilegiada.
5. Nunca apagar, recriar ou modificar `private.app_users`, usuários reais ou hashes de senha em resets de estoque ou testes. Quando um reset legítimo exigir **revogação das sessões antigas**, fazê-lo explicitamente e preservar os logins e senhas existentes.

## Integridade operacional e fiscal

1. Tratar estoque como dado crítico: lançamento, estorno, cancelamento, contagem e consolidação não podem gerar saldos incoerentes ou histórico desconectado.
2. Prevenir **duplo lançamento e condições de corrida**, inclusive múltiplos cliques, retry de requisição, duas sessões concorrentes e leituras obsoletas. Usar revisão de estado, idempotência e transações/RPCs apropriadas ao modelo real.
3. **Não excluir ou mesclar produtos automaticamente** por código, descrição ou OCR. Verificar fornecedor, código, unidade/embalagem e os vínculos de movimentações e notas. Preservar os IDs necessários a estornos.
4. Preservar identificadores/códigos originais **como texto**, inclusive zeros à esquerda. Normalizações podem auxiliar a detectar equivalências, nunca destruir o valor original nem presumir igualdade fiscal irrestrita.
5. Conciliar **valor unitário, quantidade, descontos, acréscimos e totais oficiais** com precisão decimal, política explícita de arredondamento e registro de divergências. Não usar igualdade aproximada indiscriminada para aprovar uma nota.
6. Distinguir origem e confiança de **XML oficial, consulta SEFAZ, QR Code, OCR e edição manual**. Informação extraída da imagem não é automaticamente dado oficial.
7. Marcar divergências e alterações que exijam conferência do **Gestor/encarregado**, sem lançar automaticamente algo incerto. A confirmação deve ser auditável.
8. Consultas fiscais automáticas devem ter **limite de até 10 segundos por tentativa**, cancelamento/limpeza de recursos e fallback claro para conferência manual, respeitando limites e condições dos serviços externos.
9. Não executar SQL destrutivo, reset, alteração de permissões em produção, migração incompatível ou restauração de dados sem aprovação explícita, backup verificável, análise de impacto e plano de recuperação.

## Qualidade, UX e desempenho

- Código simples, legível, modular, tipado quando a base permitir, sem dependências desnecessárias; reutilizar padrões existentes em vez de reescrever módulos inteiros.
- Manter contratos de API, payloads, formatos de erro, nomes e estados estáveis ou migrá-los com compatibilidade explícita.
- Não introduzir renderizações custosas, vazamentos de memória, chamadas repetidas desnecessárias ou dependências externas sem limite de tempo.
- UI deve funcionar com teclado e em telas menores, fornecer feedback de carregamento/erro/sucesso e manter alertas críticos acessíveis (não apenas em hover).
- Fluxos de operação frequente devem ser rápidos e evitar confirmação acidental de ações destrutivas.

## Fluxo de trabalho obrigatório

**Antes de editar**
1. Inspecionar arquivos reais, documentação, testes e fluxos afetados. Delimitar responsabilidades e possíveis regressões.
2. Definir critérios de aceite e casos de falha: concorrência, duplicidade, permissão negada, indisponibilidade externa, dados incompletos e divergências fiscais, conforme o escopo.
3. Para mudanças em banco, planejar migração versionada, compatibilidade, validação em ambiente seguro e recuperação antes de alterar produção.

**Durante**
1. Fazer mudanças pequenas e revisáveis, preferencialmente em branch e PR.
2. Acrescentar ou atualizar testes adequados à alteração, incluindo casos negativos.
3. Manter dados de produção intactos e não usar notas fiscais reais identificáveis nos fixtures públicos.

**Depois**
1. Executar `npm test` e `npm run build` quando o ambiente permitir. Na configuração atual, `npm run build` não executa a suíte: rodar `npm test` separadamente.
2. Em mudanças de SQL, revisar privilégios/RLS, testar migração e consultas representativas em ambiente não produtivo; não assumir que testes Node substituem testes de banco.
3. Verificar os diffs, contratos e comportamento das telas/rotas impactadas; usar revisão e CI antes de merge/deploy.
4. Relatar **arquivos alterados, motivo, testes efetivamente executados e respectivos resultados, riscos, pendências, efeitos de deploy e rollback**. Diferenciar claramente “não executado” de “aprovado”.

## Comandos existentes

```bash
npm install
npm run dev
npm test
npm run build
```

CI existente em `.github/workflows/`. Respeitar o fluxo do repositório; **nenhum teste ou workflow deve ser descrito como concluído se não foi executado**.

## 2. Precedência

**Segurança e integridade > Diretriz Inviolável de Código Limpo > regras globais > pedido atual > preferências.** Dentro das decisões de implementação, preservar compatibilidade, rastreabilidade, testes e confiabilidade antes de desempenho e aparência.

Melhor bloquear uma operação duvidosa e permitir revisão segura do que registrar um lançamento incorreto.

## 1. Diretriz Inviolável — CL-01 a CL-16

Base: Clean Code, SOLID, DRY, KISS, YAGNI e regra do escoteiro. Nenhum agente se autoisenta; urgência não suspende a diretriz.

| ID | Regra | Critério verificável |
|----|-------|----------------------|
| CL-01 | **Nomes revelam intenção.** Nada de `data`, `tmp`, `x`, `handle2`. | Um colega entende o papel sem ler o corpo. Respeitar o idioma já usado no módulo; termos fiscais (CNPJ, NCM, CFOP, NFC-e, DANFE) ficam como no domínio. |
| CL-02 | **Responsabilidade única.** Uma função faz uma coisa; um módulo tem um motivo para mudar. | Função ≤ 30 linhas (máx. 50 com justificativa em comentário); ≤ 4 parâmetros (acima disso, usar objeto); complexidade ciclomática ≤ 10; arquivo ≤ 300 linhas. |
| CL-03 | **Sem duplicação (DRY).** Cada regra de negócio existe em um único lugar. | Busca por lógica equivalente antes de criar; abstrair a partir da 3ª repetição, não antes. |
| CL-04 | **KISS e YAGNI.** Só o necessário para a tarefa. | Sem código "para o futuro", sem flags não usadas, sem dependência nova sem justificativa escrita (necessidade, alternativa nativa, tamanho, manutenção, licença). |
| CL-05 | **Módulos coesos e baixo acoplamento.** Separar interface, serviço/caso de uso, acesso a dados e regras de domínio. | Componente de UI não acessa banco; rota de API é fina e delega para serviço; regra de domínio não importa framework. Respeitar a estrutura de pastas existente. |
| CL-06 | **Comentários explicam o porquê.** Funções públicas com JSDoc/TSDoc. Comentários em português. | Sem código morto comentado. `TODO` só com número de issue (`TODO(#139): ...`). Regras fiscais e decisões não óbvias sempre comentadas. |
| CL-07 | **Erros explícitos.** | Nenhum `catch` vazio ou que engole erro. Erros com código estável e mensagem clara ao usuário em português. Logs sem dados sensíveis. |
| CL-08 | **Sem números ou textos mágicos.** | Constantes nomeadas (ex.: `TEMPO_LIMITE_CONSULTA_FISCAL_MS = 10_000`). |
| CL-09 | **Cálculo puro, efeito nas bordas.** Custo médio, CMV, conversão de unidades e totais são funções puras. | Testáveis sem banco, rede ou relógio. Data/hora e aleatoriedade injetadas. |
| CL-10 | **Dinheiro e quantidade nunca em ponto flutuante binário.** | Valores em centavos (inteiro) ou decimal exato; escala de quantidade definida; arredondamento explícito, documentado e testado. |
| CL-11 | **Identificadores fiscais são texto.** | CNPJ, chave de acesso (44 dígitos), EAN, NCM, CFOP nunca viram `number`; zeros à esquerda preservados. |
| CL-12 | **Sem mutação de estado compartilhado sem controle.** | Atualizações do estado compartilhado (JSONB) com controle de concorrência (versão/lock otimista) e idempotência. |
| CL-13 | **Teste acompanha a mudança.** | Todo comportamento novo ou corrigido tem teste que falha sem a mudança. Nomes de teste descrevem comportamento. Sem teste frágil ou dependente de ordem. |
| CL-14 | **Formatação e lint automáticos.** | Zero erros e zero *warnings novos* de lint/format/tipos. Nada de `eslint-disable` sem comentário com motivo. |
| CL-15 | **Regra do escoteiro, sem escopo oculto.** | Deixar o trecho tocado melhor do que estava, mas refatoração ampla vai em **PR separada**. |
| CL-16 | **Nenhum segredo fora do cofre.** | Sem chaves, tokens, senhas ou dados reais em código, logs, fixtures, issues ou PRs. |

Autoverifique e cite IDs CL na entrega. O Guardião pode vetar; veto só cai com correção. Automatize lint, formatação, tipos quando aplicáveis, testes e cobertura. Não entregue código sujo para depois, não apague nem afrouxe checks para passar, não esconda violações em PR grande nem declare conformidade sem verificar.

Se a tarefa exigir violar CL, pare e emita o Relatório de Bloqueio (8.4). Apresente alternativas limpas e aguarde decisão humana; eventual exceção exige issue, prazo e não cria precedente.

## 3–5. Referências e regras complementares

| Área | Referência | Aplicação resumida |
|------|-----------|--------------------|
| Código | Clean Code, SOLID, DRY, KISS, YAGNI | Seção 1 |
| Revisão | Google Engineering Practices (code review) | PRs pequenas, uma intenção por PR, revisão sobre saúde do código |
| Fluxo | Entrega em pequenos lotes (DORA/Accelerate), CI/CD | Mudanças incrementais, deploy frequente, rollback simples |
| Commits | Conventional Commits | `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`, `perf:` |
| Testes | Pirâmide de testes | Muitos unitários, alguns de integração, poucos E2E críticos |
| Segurança | OWASP Top 10 e ASVS | Autenticação, autorização, validação, logs, dependências |
| Privacidade | LGPD | Minimização, finalidade, anonimização de dados reais |
| Banco | ACID, migrações versionadas, *expand/contract* | Alterações compatíveis com a versão anterior do código |
| Operação | Twelve-Factor App | Configuração por ambiente, logs como fluxo, paridade dev/homologação/produção |
| Acessibilidade | WCAG 2.2 nível AA | Contraste, foco, alvos de toque, rótulos |
| Decisões | ADR (registro de decisão de arquitetura) | Decisões relevantes registradas em `docs/adr/` |

- Estado declarado: desenvolvimento e homologação, sem uso comercial; conferir código/configs antes de presumir stack. Uso frequente em celular por equipe pequena. Frentes: notas, estoque, produtos, fornecedores, financeiro, usuários e dashboard.
- Uma PR = um objetivo; até aproximadamente 400 linhas, dividindo se necessário. Branch `tipo/numero-issue-descricao-curta`; commits Conventional Commits em português no imperativo. Sem force-push protegido, desligamento de proteção ou ampliação silenciosa de escopo. Merge só por decisão humana.
- Sessões de contas inativadas devem ser revogadas imediatamente. Idempotência fiscal por chave de acesso; rastreabilidade de quem/quando/o quê/motivo em lançamentos, estornos, edição de caixa e mudança de papel.
- Homologação usa projetos Supabase e Vercel separados da produção; local/preview/produção não compartilham banco. Nesta fase, Estoque+ DB é o destino remoto autorizado de homologação; encontrar configuração de produção exige parar e relatar. Documentação não comprova configuração nem autoriza migração, SQL ou deploy.
- Nesta fase, Supabase conectado é somente leitura; agentes não fazem merge nem deploy. Este documento não amplia autorizações operacionais.
- Dados descartáveis de homologação antes do uso comercial não autorizam reset automático: qualquer operação continua dependendo de escopo explícito e revisão. Preservar usuários reais, hashes e logins conforme a regra anterior. No primeiro uso comercial, revogar permissões de descarte/reset e exigir backup verificável e restauração ensaiada.
- Originais fiscais/caixa ficam fora do Git, Vercel, fixtures e logs. Anonimizar CPF/CNPJ, razão social, endereço, nomes, chave de acesso e valores identificáveis. Nunca subir nota real da cafeteria.
- Separar fato verificado, suposição e recomendação. Evidência inclui comando, saída resumida, quantidade de testes, SHA e link real; usar “não executado” com motivo. Não chamar pronto com checks falhando ou comportamento não verificado.
- UI: poucos cliques, foco ao abrir tela/aba, anexos no navegador, campos compactos, alertas legíveis, gráficos sem sobreposição e tela utilizável durante processamento em segundo plano.

## 7. Protocolo de coordenação

CTO define risco e Definition of Ready → Database (se necessário) → Back-end → OCR/Fiscal → Front-end/UX → QA → Guardião → Segurança → DevOps autorizado → CTO relata; humano decide merge. Handoff (8.3) quando cruzar escopo; nunca aprovar própria autoria. Divergência: expor opções/prós/contras ao CTO; persistindo, decide o responsável. Perfis não iniciam agentes, automações ou monitoramento por si sós.

## 8. Modelos

### 8.1 Definition of Ready (antes de começar)
- [ ] Objetivo e critério de aceite escritos em 1–3 frases
- [ ] Issue vinculada (`#n`)
- [ ] Escopo cabe em uma PR pequena (senão, dividido)
- [ ] Riscos de dados/fiscal/segurança identificados
- [ ] Dependências e agentes envolvidos definidos

### 8.2 Modelo de PR
```
## O que muda
(1–3 frases)

## Por quê
(issue #n, problema, impacto)

## Como foi feito
(decisões principais; o que ficou de fora de propósito)

## Riscos e impacto
(dados, fiscal, segurança, desempenho; migração? reversível?)

## Evidências
- Testes: <comando> → <resultado real>
- Lint/format/tipos: <resultado>
- Build: <resultado>
- Teste manual: <passos e resultado>
- Deploy de homologação: <URL e smoke test>

## Conformidade com a Diretriz Inviolável
CL conferidas: CL-01…CL-16 (marque exceções: nenhuma)

## Rollback
(como desfazer)
```

### 8.3 Modelo de handoff entre agentes
```
De: <agente> → Para: <agente>
Contexto: <o que já foi feito, PR/branch>
Pedido: <o que preciso>
Contrato: <entradas/saídas, tipos, erros>
Restrições: <prazos, regras CL/segurança relevantes>
Pronto quando: <critério verificável>
```

### 8.4 Relatório de Bloqueio (conflito com a diretriz)
```
Regra em risco: CL-xx
Tarefa: <o que foi pedido>
Por que conflita: <explicação objetiva>
Opções limpas: 1) … 2) … 3) …
Recomendação: <opção e motivo>
Impacto de cada opção: <prazo, risco, esforço>
Aguardando: decisão do responsável
```

### 8.5 Relatório final de entrega
```
Agente(s): …
Resumo: <1–2 frases>
Verificado: <fatos com evidência>
Não verificado / não executado: <e por quê>
Suposições: …
Riscos remanescentes: …
Próximos passos sugeridos: …
```

## 9. Checklist final (Definition of Done)

**Código limpo (CL)**
- [ ] Nomes claros, funções pequenas, sem duplicação, sem código morto (CL-01 a CL-04)
- [ ] Camadas respeitadas, sem acoplamento indevido (CL-05)
- [ ] Comentários explicam o porquê; JSDoc nas funções públicas; sem `TODO` órfão (CL-06)
- [ ] Erros tratados, sem `catch` vazio, mensagens claras (CL-07)
- [ ] Sem números/textos mágicos (CL-08)
- [ ] Cálculos puros; dinheiro sem float; identificadores fiscais como texto (CL-09 a CL-11)
- [ ] Concorrência e idempotência tratadas (CL-12)
- [ ] Testes novos/ajustados, determinísticos (CL-13)
- [ ] Lint, formatação e tipos sem erro e sem *warning* novo (CL-14)
- [ ] Sem refatoração fora do escopo; sem segredo (CL-15, CL-16)

**Projeto**
- [ ] Autorização no servidor; menor privilégio; multi-tenant verificado
- [ ] Migração versionada, reversível ou justificada; nada em produção sem autorização
- [ ] Funcionalidades existentes preservadas (teste de regressão)
- [ ] Interface responsiva, poucos cliques, acessível
- [ ] Dados reais anonimizados; nenhum segredo vazado
- [ ] CI verde; evidências reais anexadas; limitações declaradas
