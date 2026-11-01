# Estado do Estoque+ — 01/11/2026

## Estado atual
- Base atual: main 133bcd7; #183 e #185 mescladas com verificações verdes.
- Segundo Lucas: mescladas #161, #177, #179 e #180.
- Segundo Lucas: fechadas #140, #153, #163, #155, #162, #166 e #167; branches preservadas.
- Segundo Lucas: bootstrap concluído, acesso como Gestor e foco/avisos aprovados no celular.
- Redução de foto publicada; Lucas confirmou que funcionou no teste da cafeteria.
- QR externo deve permanecer desativado por padrão; pendências pré-comerciais: #178.
- Homologação de testes: https://estoque-homologacao-ashy.vercel.app/

## Próximos passos, em ordem
1. Diretrizes enxutas adotadas; publicação de homologação READY e teste básico 8/8 aprovado.
2. Implementada redução da cópia de arquivamento de fotos acima de 4 MB no navegador.
   OCR usa original; limite do servidor preservado, sem alteração de SQL ou regras fiscais.
   Comparar OCR antes/depois com fotos reais privadas; qualidade ainda não testada.
3. B1 preparado: PR #188 banco e PR #189 interface dependente, ambas rascunhos.
   Plano, reversão e roteiro: docs/B1-correcao-financeira.md; depende de CI e OK explícito.
4. E1: impedir nota duplicada pela mesma chave fiscal antes de qualquer fluxo mobile.
- Melhoria futura registrada: notificações dentro da página, issue #186.

## Decisões de trabalho
- Agente único; especialistas/revisão independente apenas para mudanças arriscadas.
- Uma PR ativa, no máximo duas; conferir CI uma vez após uma espera, sem loop.
- Comunicação curta, linguagem simples e no máximo uma decisão por mensagem.
- Testes relevantes durante o trabalho; suíte completa uma vez antes da PR.
- Atualizar este arquivo ao fim de cada bloco; máximo de 40 linhas.
- Merge automático autorizado por Lucas apenas com CI verde, sem conflitos e baixo risco.
- Banco/migrações, dinheiro/estoque/fiscal, login/permissões, exclusão e produção exigem OK.
- Testes humanos apenas na homologação, com roteiro de 3 a 5 itens.

## Evidências deste bloco
- B1: PRs #188/#189 abertas; sem merge, migração remota ou deploy manual.
- Testes relevantes: 22/22 passaram (cinco novos); foto da #185 preservada.
- Suíte única: 244/250; seis falhas locais de pacote ausente e quebra de linha Windows.
- Build local passou com configuração pública fictícia; sem banco remoto.
- Replay/reversão PGlite18.6 passaram; PG15/17 e concorrência real aguardam CI.
- Revisão cruzada: SQL pelo CTO, UI pelo DBA; dois problemas de troca de formulário corrigidos.
- CL-10/12/13/16 conferidas no escopo; sem migração, merge financeiro ou deploy.
