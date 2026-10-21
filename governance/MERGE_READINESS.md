# Estoque+ — Preparo de merge na main

Atualizado em 21/10/2026. PR integrador: #40 (`integration/homologacao-clean-main-20261020`).
Fonte da verdade: o SHA atual, verificações do GitHub e o estado real do banco. Este arquivo registra pré-condições; **não autoriza merge, migração ou deploy por si só**.

## Git e reconciliação
- #40 foi criado a partir da `main`; comparar novamente `main...integration/homologacao-clean-main-20261020` imediatamente antes do merge. Esperado: `behind_by=0`, `mergeable=true`.
- Escopo fiscal incorporado/reconciliado: #7, #13, #17 → #18 → #38, #26 → #29, #37, mais a interface já integrada na `main`.
- Inclusões adicionais nesta revisão: #24 (teclado, foco, semântica, legibilidade móvel; o modal de NF não pode fechar durante exclusão), #22 (ordenação compartilhada de duplicatas com teste). **Não** sobrescrever API de PDF.js/guard de sessão com as implementações legadas de #22.
- PRs independentes #20 e #33 (perfis/documentação dos agentes), e demais partes documentais/refatorações do #22, permanecem entregas separadas; não fechar, mesclar à força ou descartar mudanças desses PRs apenas porque #40 está integrável.
- Jamais fazer merge isolado das branches encadeadas #17/#18/#38 ou #26/#29 após #40, sob risco de reaplicar alterações antigas. Verificar diffs de cada PR antes de marcar como supersedido.
- Validar `npm test`, `npm run build`, workflow `Native session RPC tests` (PG 15/17), `Fiscal integrity SQL tests` (PG 15/17), `Receipt regression tests`, status Vercel **no SHA final**, sem usar resultado de SHA anterior.

## Banco existente — bloqueio distinto de conflitos de Git
- O gestor optou por usar o **mesmo Supabase** nos testes manuais, mantendo os **logins e senhas**. Esta decisão **não autorizou** migração, redefinição, exclusão nem atualização de usuários, senhas, sessões, arquivos fiscais ou estoque.
- Consulta **somente de leitura** em 21/10/2026: 2 contas existentes; `inventory_validate_session(text)`, `pending_receipt_cancel(text,uuid)`, `private.has_permission(uuid,text)` e `inventory_permissions_list(text)` ainda não instaladas.
- O código do #40 requer essas RPCs. Fazer merge que acione um deploy de Production **antes** da compatibilização do banco deixa consultas fiscais/API e permissões indisponíveis, mesmo com CI de código verde.
- Não executar `db/schema.sql` de instalação limpa no banco existente. Preparar backup/recuperação verificável, examinar diffs/owners/grants/RLS, executar mudanças **incrementais** e transacionais, somente após autorização separada e plano de reversão.
- Ordem de dependências a validar com Database: instalar a camada de permissões de `db/access-permissions.sql`, reconciliar `db/pending-receipts.sql` com a tabela e registros existentes, instalar `supabase/migrations/20261019201520_inventory_validate_session.sql`, depois `supabase/migrations/20261020221500_fiscal_write_integrity.sql`. Fazer preflight/RLS e testes de POSTGREST reais antes de habilitar gravações; não reaplicar instalação nova.
- Após eventual instalação, ler somente metadados para conferir contagem de usuários inalterada; nunca consultar ou imprimir hashes/tokens. Conferir login de Gestor e Funcionário manualmente, sem alterar credenciais.

## Portão de homologação funcional
- Ambiente Preview com banco compartilhado requer opt-in **restrito à branch** e variáveis explícitas na Vercel; não configurar `service_role` como chave pública.
- Conferir login/logout e renovação da sessão própria; 401/403/503 sem vazamento, rejeição de permissão por usuário, 429 distribuído ainda pendente (#23).
- Importação OCR local, QR automático com aviso de envio a terceiro, consulta oficial, conferência por `lineId` e gravação; cancelar × lançar concorrente; não duplicar saldo/nota. Conferir contagem, caixa e campos em celular/teclado.
- PR #40 permanece **draft** até critérios de ambiente e testes reais atendidos. Não fechar #30/#31/#32 nem publicar em Production apenas por `mergeable=true`.
- Se o gestor desejar apenas revisão/merge de código, planejar um mecanismo de deploy controlado para não publicar o candidato antes das RPCs.

## Registro de conclusão por SHA
- Branch + SHA final:
- Git behind/mergeable:
- Workflows e Vercel:
- Revisão de permissões/RPCs:
- Evidências de homologação:
- Plano de rollout/rollback:
- Autorização do gestor para merge e migrações:
