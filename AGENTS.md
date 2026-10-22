# AGENTS.md — Regras compartilhadas do Estoque+

Este arquivo é a referência **global e obrigatória** para qualquer agente que altere este repositório. Antes de trabalhar, leia o `README.md`, o código relevante e o perfil da sua especialidade em `docs/agents/`. As regras específicas complementam este documento; em caso de conflito, prevalecem **segurança, integridade dos dados e preservação das funcionalidades existentes**.

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

## Agentes e responsabilidades

| Agente | Perfil obrigatório | Responsabilidade principal |
| --- | --- | --- |
| **Estoque+ Back-end Specialist** | [docs/agents/backend-specialist.md](docs/agents/backend-specialist.md) | APIs, autenticação e autorização no servidor, regras de negócio, integrações fiscais, concorrência, testes de contrato, desempenho, CI/CD. |
| **Estoque+ Database Architect** | [docs/agents/database-architect.md](docs/agents/database-architect.md) | PostgreSQL/Supabase, schema, migrações, RLS/RPC, transações, integridade fiscal, auditoria, recuperação. |
| **Estoque+ UI/UX Specialist** | [docs/agents/ui-ux-specialist.md](docs/agents/ui-ux-specialist.md) | Interface, arquitetura da informação, acessibilidade, responsividade, formulários, estados, desempenho e testes visuais. |
| **Estoque+ Security Specialist** | [docs/agents/security-specialist.md](docs/agents/security-specialist.md) | Auditoria ofensiva/defensiva, gatilho de segurança em cada push, análise de vulnerabilidades, autorização, persistência e triagem de achados. |
| **Estoque+ QA Specialist** | [docs/agents/qa-specialist.md](docs/agents/qa-specialist.md) | Validação independente, regressões, evidências por SHA e parecer antes da homologação; rotina diária econômica existente. |

Segurança automatizada: workflow `.github/workflows/security-redteam.yml` roda após cada push de commit para qualquer branch e nos PRs; auditoria contextual de alto risco continua com o Security Specialist. Falha no check não bloqueia pushes diretos sem regras de proteção de branch (#52).

Consulte também [docs/agents/README.md](docs/agents/README.md). **Arquivos de perfil não criam agentes autônomos automaticamente**: orientam o agente convocado no chat ou na ferramenta de desenvolvimento.

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

## Prioridade em caso de conflito

**Integridade do estoque e fiscal > segurança e privacidade > compatibilidade e rastreabilidade > testes e confiabilidade > desempenho > conveniência de implementação > aparência visual.**

Melhor bloquear uma operação duvidosa e permitir revisão segura do que registrar um lançamento incorreto.
