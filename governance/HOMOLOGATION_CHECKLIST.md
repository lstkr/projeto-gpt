# Estoque+ — Checklist de homologação / release candidate

Atualizado: 2026-10-20. PR de integração: #40 (draft). **Não publicar em produção** com esta checklist incompleta.

## Banco existente autorizado para testes manuais (decisão do gestor)
- **Autorização 20/10/2026:** reutilizar o Supabase atual `dpauqdihvhbbaellwjav`, SEM alterar contas existentes. Não criar novo banco agora.
- **Regra de preservação:** manter `private.app_users`, `password_hash`, `private.app_sessions` e os dados atuais. Não resetar senhas, reexecutar `db/schema.sql` no banco existente, truncar tabelas, semear usuários de teste por cima dos existentes ou executar SQL destrutivo.
- Verificação somente de leitura confirmou 2 usuários; contagem não divulga identificadores, senhas nem tokens. A consulta de funções mostrou que faltam `public.inventory_validate_session`, `public.pending_receipt_cancel`, `private.has_permission` e `public.inventory_permissions_list`.
- **Não considerar o PR #40 homologado no banco atual até revisão de compatibilidade e instalação controlada das RPCs faltantes.** Nesta etapa foram autorizadas verificações de código, **não migrações no banco**.
- Antes de eventual migração, registrar backup, plano de reversão e quais RPCs/tabelas mudarão; exigir autorização separada. Para migração incremental nunca usar um `schema.sql` de instalação limpa.
- Ações de conferência/lançamento/cancelamento alteram o estoque compartilhado; usar notas anonimizadas e procedimentos de recuperação. Evitar testes destrutivos com documentos reais.

### Opt-in de Vercel Preview no banco existente
- Por padrão Preview permanece bloqueada. Somente a branch `integration/homologacao-clean-main-20261020` pode usar o banco atual, e apenas com `ESTOQUE_ALLOW_SHARED_DB_PREVIEW=true`.
- Na Vercel, definir **apenas para Preview dessa branch**: `NEXT_PUBLIC_SUPABASE_URL` (URL HTTPS do projeto atual), `NEXT_PUBLIC_SUPABASE_ANON_KEY` (chave publishable/anon, **nunca** service_role) e `ESTOQUE_ALLOW_SHARED_DB_PREVIEW=true`.
- `VERCEL_GIT_COMMIT_REF` é fornecido pela Vercel; o código verifica a branch no servidor e no navegador. Se não for informado, a Preview falha fechada. Não criar login/senha nos arquivos de configuração.
- Não ativar o opt-in para outras branches ou ambientes Production. A proteção não substitui login por sessão própria e permissões PostgreSQL.
- As variáveis e o redeploy ainda precisam ser configurados pelo gestor na Vercel, pois o conector atual retorna 403 para o time `lstkr`. O status de build bem-sucedido não confirma conexão ao banco.

## Gates automatizados
- [ ] CI PR #40: npm test e npm run build **no SHA final**, PostgreSQL 15 e 17 para sessão e integridade fiscal. Atualizar evidências a cada commit.
- [ ] Rodar cenários HTTP reais para 401 sem sessão, 401 expirada, 403 permissão negada, 429 limite de chamadas (pendente implementar limite compartilhado), 503 RPC indisponível, 502/504 terceiro, payload inválido e máximo.
- [ ] SQL com 2 conexões: cancelamento × lançamento, lançamento × lançamento, revisão nula/obsoleta, retry e falha parcial. Sem duplicar saldo, nota ou movimento.
- [ ] Revisar avisos do Supabase Advisors (segurança e desempenho) no ambiente de teste; SECDEF público com token próprio exige auditoria independente, não suprimir avisos sem justificar.

## Casos manuais obrigatórios (evidência por SHA)
| Cenário | Resultado | Evidência |
| --- | --- | --- |
| Login/logout, sessão inválida e revogação | pendente | |
| Funcionário importa nota e salva conferência pendente | pendente | |
| Gestor configura permissões fiscais do funcionário | pendente | |
| Cancelar NF: funcionário negado pelo banco, gestor permitido | pendente | |
| OCR JPG/PNG, PDF térmico e lote de cupons (inclusive foto desfocada) | pendente | |
| QR local, fallback externo e aviso de privacidade (dados anonimizados) | pendente | |
| Consulta pública SVRS e falha/timeout sem travar OCR | pendente | |
| Divergências código com zeros, unidade, desconto, totais | pendente | |
| Conferência linha a linha obrigatória e persistência após reload | pendente | |
| Lançar uma vez, reabrir e impedir lançamento/cancelamento duplicado | pendente | |
| Contagem física, ajuste, fornecedor, caixa com PDF e preço de custo | pendente | |
| Mobile 375px, teclado e mensagens de erro de sessão | pendente | |

## Condições de bloqueio
- PR #40 deve manter status draft enquanto falta CI no SHA final, homologação real, revisão de segurança, RPCs compatíveis e opt-in Preview confirmado.
- PRs dependentes **não são equivalentes** a PR integrado: seus checks isolados não comprovam o candidato.
- Repo privado não significa docs no GitHub Pages privados; notas operacionais ficam em governance/.
- Vercel Git integration pode criar preview automaticamente ao fazer push; **não confiar no preview sem verificar o banco ao qual está conectado**.
- Exposição fiscal de terceiros: fallback envia automaticamente um recorte do QR; dados próximos ao rodapé podem incluir informações sensíveis.
- O cancelamento existente apaga file_bytes; rollback SQL NÃO restaura o original. Definir retenção e backup antes de produção.
- `npm install` sem lockfile torna builds não inteiramente reproduzíveis; criar lockfile validado em PR separado.

## Retomada em uma única execução
1. Ler esta checklist e issues #30/#31/#32; consultar checks do PR #40.
2. Identificar **um** bloqueador reprodutível, corrigir com teste direcionado.
3. Atualizar issue com branch/SHA, comandos, resultado, pendências e próximo passo.
