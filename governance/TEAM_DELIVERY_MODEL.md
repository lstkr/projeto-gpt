# Estoque+ — Squads: Heads seniores e engenheiros executores

Documento operacional criado em 22/10/2026. O CTO prioriza e integra. Os
heads atuais continuam donos de decisões técnicas; novos engenheiros são
PERFIS de especialidade, não contas ou agentes autônomos em execução contínua.

| Head (sênior) | Engineers específicos | Responsabilidade |
| --- | --- | --- |
| Back-end Specialist | Fiscal OCR Engineer; Cash & Analytics Engineer | OCR, APIs fiscais, contratos de caixa e CMV |
| Database Architect | Data Integrity Engineer; Identity & Access Engineer | RLS/RPC, histórico, isolamento, concorrência, usuários |
| UI/UX Specialist | Product UI Engineer; Print & Documents Engineer | Interface, acessibilidade, impressão A4/térmica |
| QA Specialist | OCR Validation Engineer; Browser Regression Engineer | Fotos privadas, QA mobile, testes funcionais e evidências |
| Security Specialist | AppSec Engineer | Ameaças/segredos e testes adversariais pós-commit |
| CTO + Back-end | CI/CD Engineer | Build, GitHub checks, Vercel e rollout seguro |

## Contrato de execução

1. Uma Issue filha tem exatamente um Engineer executor (DRI) e um Head
   aprovador. Se outro domínio for tocado, o head dessa camada revisa
   o contrato antes da integração.
2. Uma PR pequena resolve um objetivo verificável: prefira lógica pura,
   depois RPC/API, depois UI e por último homologação integrada.
3. Branch por PR a partir de main, salvo dependência explicitada; novos
   commits exigem nova avaliação de CI e segurança.
4. Em especial, NAO desenvolver simultaneamente em pages/index.js.
   Product UI Engineer integra as PRs UI em sequência, apenas após os
   contratos (CMV #97/#98, impressão #100, usuários #102) estarem aprovados.
5. Mudanças PostgreSQL devem vir em migrações versionadas com rollback,
   testes localizados e revisão Database + Back-end + Security.
6. Uma PR documenta parent/filha, DRI, head, arquivos, exclusões do escopo,
   SHA, testes efetivamente executados, bloqueios e rollback. Usar template.
7. QA e Security não devem presumir que o build ou workflow verde significa
   teste autenticado/homologação. Teste visual se houver interface; banco
   descartável para escrita; não publicar fotos fiscais nem credenciais.
8. Após merge só fechar Issue filha com critérios cumpridos. Issue mãe
   continua aberta até entrega integrada e verificação real.

## Regras para todas as equipes

Seguir AGENTS.md e os perfis em docs/agents; não presumir Supabase Auth.
Manter identidades originais e conferência fiscal humana. Nunca alterar
credenciais, resetar banco ou fazer deploy destrutivo sem autorização.
Não atribuir nomes de usuário GitHub fictícios aos papéis de Engineer.
Visibilidade PUBLICA do repositorio autorizada pelo proprietario em 24/10/2026
para testes manuais. NAO exigir que o repositorio seja privado, nem bloquear
PRs/homologacao apenas pela visibilidade publica. Garantir ausencia de segredos,
credenciais, tokens, dados pessoais, backups e imagens fiscais privadas no
codigo e historico. A autorizacao publica NAO libera push direto na main,
aplicacao de migracoes em producao ou deploy sem homologacao.
Issue #52 acompanha a protecao efetiva da main, que pode ser habilitada
em repositorios publicos no GitHub Free (Settings > Branches/Rules).
Ate confirmar main.protected=true e testes de bloqueio, checks falhos nao
bloqueiam push direto. Issue #54 (escopo Vercel) segue independente.
Scanner #35 permanece adiado por solicitação expressa do gestor.

## Exemplo de kickoff por equipe

"Atue como Estoque+ [Engineer], subordinado ao head [Senior], e trabalhe
SOMENTE a Issue #[N] do repositorio lstkr/projeto-gpt. Leia AGENTS.md,
governance/TEAM_DELIVERY_MODEL.md, o perfil do Head e o código real.
Abra PR pequena com testes e rollback; não altere produção. Faça handoff
à revisão independente de QA/Security; não declare sucesso sem evidência."
