# Estado do Estoque+ — 01/11/2026

## Estado atual
- Base atualizada: main ae475e2; melhorias de tela #182/#184/#187 preservadas.
- #183 diretrizes enxutas e #185 redução de foto integradas; foto aprovada por Lucas.
- B1: PR #188 banco e #189 interface dependente; Lucas autorizou SOMENTE homologação.
- Supabase Estoque+ DB confirmado; produção não autorizada e não alterada.
- Backup B1 protegido e conferido: 3 fechamentos e 2 funções; sem exportar conteúdo.
- QR externo desativado por padrão; pendências pré-comerciais na #178.
- Notificações futuras registradas na #186.
- Homologação: https://estoque-homologacao-ashy.vercel.app/

## Próximos passos
1. Concluir integração da main atual nas duas PRs e conferir CI uma vez por atualização.
2. Aplicar migração B1 somente na homologação; integrar #188 e depois #189.
3. Confirmar publicação e teste básico; Lucas testa motivo, histórico, duas abas e funcionário.
4. E1: impedir nota duplicada pela mesma chave fiscal antes de outro fluxo mobile.

## Decisões
- Agente único, com revisão independente para dinheiro/banco/login; máximo duas PRs ativas.
- Testes relevantes durante trabalho; suíte completa uma vez antes da PR.
- Banco/dinheiro/fiscal/login/exclusão/produção exigem OK explícito; nenhuma produção autorizada.
- Reset total existe, mas exige NOVO OK e confirmação textual do proprietário; não executar agora.
- Reset total limpa dados ativos/contas/histórico; preserva estrutura, auth/storage e backup B1.
- Reversão B1 suspende novas correções e preserva valores/histórico; detalhes em docs/B1-correcao-financeira.md.

## Evidências deste bloco
- Instalador atualizado para B1: 10/10 testes passaram; plano inclui 4 bases e 10 migrações.
- Replay/reversão/reset deliberado aprovados em PGlite18.6; backup também ensaiado localmente.
- CI anterior B1 passou PG15/17, concorrência e reversão; novo CI depende da conciliação da main.
- Tela B1: 22 testes relevantes passaram; build local passou antes das novas melhorias de tela.
- CL-10/12/13/16 revisadas; sem reset remoto, sem aplicação B1 até concluir verificações.
