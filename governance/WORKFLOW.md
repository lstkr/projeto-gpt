# Estoque+ Development Workflow 2.0 — economia de execuções

## Princípios
1. Uma issue e um objetivo verificável por execução; delimitar arquivos e não ampliar escopo silenciosamente.
2. Antes de alterar: consultar PROJECT_STATUS, issue, PR base e apenas arquivos afetados. Auditoria completa somente quando explicitamente solicitada ou por incidente amplo.
3. Um único agente é **DRI** (responsável final) por issue. Especialistas revisam contratos nas interfaces; não repetir implementação.
4. Commits e PRs pequenos; não empilhar mudanças sem contrato. PR dependente explicita base; rebase e integração apenas com CI no SHA final.
5. Preferir testes focados durante desenvolvimento; antes do merge, regressão, build e homologação proporcionais ao risco. Nunca pular testes de segurança, SQL/concorrência, autenticação e integridade fiscal.
6. Registrar evidências e handoff na issue; parar no limite sem perder o ponto de retomada.

## Responsabilidades
- CTO: priorizar, mapear dependências, designar DRI, revisar status e bloqueios; não repetir auditoria total.
- UI/UX: acessibilidade, responsividade, interface e testes de navegador; aprova UX de erros/privacidade.
- Back-end: API, autenticação, autorização, validação, observabilidade e contrato com DB.
- Database: migrações versionadas, RLS/RPC/ACL, transações, idempotência, dados fiscais, rollback.
- QA/Integração: casos e evidências, regressões reais, 401/403/429/503, fluxos fiscais e permissões.
- DevOps: CI, runtimes, build, ambientes, gates e deploy com aprovação.

## Priorização
P0: segurança, perda/corrupção/duplicação de dados, bypass de autorização e concorrência fiscal.
P1: bloqueios de integração, testes de homologação e confiabilidade de release.
P2: melhorias e novas funcionalidades. #35 e #36 ficam no roadmap.

## Critério de conclusão
Issue só fecha após PR integrado, CI no SHA final, critérios de aceite verificados e evidência anexada. PR aberto ou teste estático sozinho não significa homologação. Migração SQL só em ambiente descartável até autorização explícita para produção.

## Prompt econômico para agente
"Atue como [especialista]. Resolva APENAS a issue #[N] em lstkr/projeto-gpt. Consulte governance/PROJECT_STATUS.md, governance/ARCHITECTURE.md, esta regra e arquivos afetados. Confirme branch e contratos necessários. Faça PR pequeno com testes apropriados. Não faça deploy nem altere produção. Registre SHA, testes, pendências e próxima ação na issue. Se houver dependência, acione somente o especialista correspondente."

## Política de CI
- Em PRs encadeados, checks também devem rodar sobre branches não-main.
- Usar mesma versão LTS do Node em testes e build.
- Sem lockfile, npm install não é inteiramente reproduzível; não trocar por npm ci até introduzir/validar package-lock.json em PR próprio.
- Workflow Pages pode publicar docs; manter registros de coordenação em governance/ até revisar exposição.
