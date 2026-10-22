# CTO — Quadro de execução das Issues (22/10/2026)

É um índice de planejamento, não um monitor de runs em tempo real. Consultar
GitHub antes de declarar qualquer entrega concluída.

## Onda P1: estabilidade, homologação e segurança

| Issues atuais | Executor / Head | Próxima decisão |
| --- | --- | --- |
| #50 | Browser Regression Engineer / QA | autenticação e cenários manuais por perfil |
| #58 | Fiscal OCR Engineer / Back-end; UI co-head | lote A/B/C, conferência paralela, idempotência |
| #70 | Data Integrity Engineer / Database | validar autoria e sangrias em ambiente real autorizado |
| #90 | Browser Regression Engineer / QA | ampliar testes de sobreposição e viewport |
| #94, #104 | OCR Validation Engineer / QA | 13 imagens privadas, >=14 documentos, 3 novos goldens |
| #62, #63 | Fiscal OCR Engineer / Back-end | teste residual de CNPJ e nome por código |
| #52 | CI/CD Engineer / CTO | exigir PR/checks com proteção real quando habilitada |
| #54 | CI/CD Engineer / CTO | liberação administrativa Vercel pelo proprietário |
| #87, #96 | CTO | coordenar ISSUES e PRs por microentregas |

## Onda P2: implementação modular

| Parent | Issue filha e Engineer | Depende de |
| --- | --- | --- |
| #85 | #97 Cash & Analytics: função CMV pura | independente |
| #85 | #98 Data Integrity: históricos por tenant/período | revisão Database |
| #85 | #99 Product UI: painel CMV | #97 + #98 |
| #36 | #100 Print & Documents: renderização A4/58/80 | independente |
| #36 | #101 Product UI: botão/preview | #100 |
| #77 | #102 Identity & Access: editar usuários RPC | Database + Security |
| #77 | #103 Product UI: formulário Configurações | #102 |
| #69 | Product UI / UI Head: aceitar layout já desenvolvido | QA visuais |
| #35 | Scanner e balança: ADIADO (decisão do gestor) | aguardar prioridade nova |

Não colocar todas as mudanças em pages/index.js. Os itens de UI são seriados
pelos contratos prontos. As PRs isoladas de domínio puro e testes podem
progredir simultaneamente. Código integrado não equivale a homologação.
