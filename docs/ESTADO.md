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
1. B1: itens 1/2/4 aprovados; corrigir espera infinita em duas abas antes de novo teste.
2. Tela: limite de 15s por requisição; migração mínima PT409 exige NOVO OK.
3. E1 segue após corrigir a causa do travamento; preparar contrato sem aplicar banco.
4. E1: impedir nota duplicada pela mesma chave fiscal antes de outro fluxo mobile.

## Decisões
- Direção: desktop é o uso principal (cadastro, conferência completa, estoque e financeiro); celular fica com envio de foto, consulta rápida e login.
- Priorizar teclado, tabelas, campos visíveis e testes no computador; D1–D3 vira enviar foto → notas a conferir, preservando mobile atual sem polimento novo.
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
- Banco somente leitura: 2 correções válidas (revisões 1/2); recusas 40001 repetidas, sem terceira gravação.
- Correção da tela cobre timeout, conflito, preservação de campos e nova tentativa; sem SQL remoto.
