# Estado do Estoque+ — 01/11/2026

## Estado atual
- Main 612de9c inclui #188; melhorias de tela #182/#184/#187 preservadas.
- #183 diretrizes enxutas e #185 redução de foto integradas; foto aprovada por Lucas.
- B1: banco #188 integrado e migração aplicada; interface #189 sobre main, só homologação.
- Supabase Estoque+ DB confirmado; produção não autorizada e não alterada.
- Backup B1 protegido e conferido: 3 fechamentos e 2 funções; sem exportar conteúdo.
- QR externo desativado por padrão; pendências pré-comerciais na #178.
- Notificações futuras registradas na #186.
- Homologação: https://estoque-homologacao-ashy.vercel.app/

## Próximos passos
1. Concluir publicação da interface #189 após CI verde, somente na homologação.
2. Ordem autorizada: migração no Estoque+ DB, #188 integrada, depois #189.
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
- #188 CI verde; PG15/17, concorrência, reversão e reset deliberado aprovados.
- Tela B1: 29 testes relevantes passaram após conciliar a main; CI final valida build.
- CL-10/12/13/16 revisadas; sem reset remoto e sem alteração em produção.
