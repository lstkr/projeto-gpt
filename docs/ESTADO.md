# Estado do Estoque+ — 01/11/2026

## Estado atual
- Base deste bloco: main da0f595; PR documental #183 mesclada com CI verde.
- Segundo Lucas: mescladas #161, #177, #179 e #180.
- Segundo Lucas: fechadas #140, #153, #163, #155, #162, #166 e #167; branches preservadas.
- Segundo Lucas: bootstrap concluído, acesso como Gestor e foco/avisos aprovados no celular.
- Problema relatado: foto do iPhone 12 Pro excede o limite de 4 MB.
- QR externo deve permanecer desativado por padrão; pendências pré-comerciais: #178.
- Homologação de testes: https://estoque-homologacao-ashy.vercel.app/

## Próximos passos, em ordem
1. Diretrizes enxutas adotadas; publicação de homologação READY e teste básico 8/8 aprovado.
2. Implementada redução da cópia de arquivamento de fotos acima de 4 MB no navegador.
   OCR usa original; limite do servidor preservado, sem alteração de SQL ou regras fiscais.
   Comparar OCR antes/depois com fotos reais privadas; qualidade ainda não testada.
3. B1: correção financeira com motivo e histórico; exige OK explícito.
   Antes do OK: explicar como desfazer a migração, teste na cafeteria e motivo em 2 linhas.
4. E1: impedir nota duplicada pela mesma chave fiscal antes de qualquer fluxo mobile.
- Registrar futura melhoria em issue: notificações dentro da página (ainda não criada).

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
- Redução de fotos: cinco testes novos passaram; foto real de iPhone ainda não disponível.
- Validação: contagem de linhas, links locais e git diff --check.
- Suíte local: 14 falhas; uma asserção foi atualizada para a cópia reduzida e revalidada.
- Outras 13 falhas locais já existiam; CI da PR documental passou no Linux.
- Testes relevantes: 10/10; build compilou, mas parou por configuração Supabase ausente.
- CI da redução de fotos será conferido uma vez após abrir a PR.
- Rollback de fotos: reverter o commit; fotos grandes voltam a ser recusadas, sem apagar dados.
