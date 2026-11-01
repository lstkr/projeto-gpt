# Estado do Estoque+ — 01/11/2026

## Estado atual
- Main 7b2df25: B1 #188/#189 e correções #190/#191 integradas, só homologação.
- #185 redução de foto aprovada por Lucas; QR externo desativado por padrão.
- Supabase Estoque+ DB; produção não autorizada e não alterada.
- B1: 2 correções válidas; segunda aba travava por repetição do erro no servidor.
- #191 aplicada com OK: PT409 encerra a repetição; valores e histórico conferidos intactos.
- Pedido antigo já não estava ativo; nenhuma conexão precisou ser encerrada.
- Deploy B1 READY em 7b2df25; smoke 8/8; teste humano de duas abas pendente.
- Backup B1 protegido: 3 fechamentos e 2 funções; sem exportar conteúdo.
- E1 preparada: chave fiscal única por unidade, antes da escrita e sob bloqueio de concorrência.
- E1 preserva legado; sem chave continua manual; estorno permite relançamento posterior.
- E1 inclui limite de 15s nas chamadas da tela; timeout não confirma gravação.

## Próximos passos
1. Lucas retesta B1 nas duas abas do computador; campos devem permanecer após conflito.
2. E1: CI e revisão; novo OK explícito antes de aplicar banco e integrar na homologação.
3. Depois de publicar E1, testar duplicidade e conferir estoque salvo após atualizar a página.
4. Pré-comercial na #178; notificações futuras na #186.

## Decisões
- Direção: desktop é o uso principal (cadastro, conferência completa, estoque e financeiro); celular fica com envio de foto, consulta rápida e login.
- Priorizar teclado, tabelas, campos visíveis e testes no computador; D1–D3 vira enviar foto → notas a conferir, preservando mobile atual sem polimento novo.
- Agente único, revisão independente para banco/dinheiro/fiscal/login; máximo duas PRs ativas.
- Banco/dinheiro/fiscal/login/exclusão/produção exigem OK explícito; nenhuma produção autorizada.
- Reset total exige NOVO OK e frase do proprietário; preserva estrutura, auth/storage e backup B1.
- Reversão E1 suspende notas novas, preservando dados, histórico e gravações comuns.

## Evidências deste bloco
- E1: replay SQL local, permissões, rejeição atômica e reversão passaram em PGlite18.6.
- Instalador e testes relevantes: 21/21; build aprovado.
- Suíte completa: 256/263; um teste ajustado ao transporte passou depois; seis falhas locais antigas de Windows/CRLF.
- PG15/17 e concorrência real serão validados pelo CI; E1 não aplicada remotamente.
