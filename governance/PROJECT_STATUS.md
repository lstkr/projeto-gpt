# Estoque+ — Estado e retomada

Atualizado: 2026-10-20. Fonte da verdade: issues, PRs e CI no GitHub. Este documento é um resumo operacional, não substitui a verificação do SHA final.

## Meta atual
Preparar homologação manual segura dos fluxos existentes. Não iniciar funcionalidades P2 antes de resolver bloqueadores P0/P1.

## Bloqueadores
- P0: issue #31 — autorização efetiva das gravações fiscais, concorrência cancelar × lançar, revisão de snapshots; responsável Database com Back-end; validar SQL em banco descartável.
- P1: issue #32 — CI para PRs dependentes, runtime, contratos HTTP, SQL e navegador; responsável QA/DevOps.
- Coordenação: issue #30 — integração dos PRs e conflitos. Não considerar PR aberto como tarefa entregue.
- Dependências críticas: PR #26 (guard de consultas externas) e PR #29 (RPC própria de sessão, baseado em #26); migração antes da API, rollback da API antes da remoção da RPC.
- Roadmap P2, fora da homologação: #35 (scanner/códigos de balança), #36 (impressão A4/térmica).

## Regras para atualizar
No começo de cada execução: verificar somente a issue, o PR, os arquivos tocados e os checks do SHA atual. Não reauditar todo o repositório.
Ao terminar: registrar issue/PR, SHA, arquivos, comando e resultado dos testes, critérios de aceite pendentes, dependências e próximo passo EXATO.
Se interrompido por limite, preencher o bloco de handoff na issue:
- Objetivo e estado: [não iniciado/em andamento/bloqueado/em revisão]
- Branch/PR + SHA:
- Mudanças efetivamente aplicadas:
- Evidência de testes (comandos, CI e falhas):
- Riscos/contratos e responsáveis:
- Próxima ação única:

## Restrições
Sem merge, deploy nem migração em produção sem CI no SHA final, homologação e aprovação. Não confundir status de quota Vercel com falha de build. Evitar colocar dados operacionais sensíveis em documentos publicados por Pages.
