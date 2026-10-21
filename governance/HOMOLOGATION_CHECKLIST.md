# Estoque+ — Checklist de homologação / release candidate

Atualizado: 2026-10-20. PR de integração: #39 (draft). **Não publicar em produção** com esta checklist incompleta.

## Ambiente isolado (obrigatório)
- [ ] Criar projeto/banco PostgreSQL/Supabase **descartável de homologação** distinto de `dpauqdihvhbbaellwjav`, com chaves próprias; nunca usar credenciais reais nem arquivos fiscais sem anonimização.
- [ ] Configurar variáveis **Preview** Vercel para apontar ao banco descartável. Variáveis NEXT_PUBLIC_ são visíveis no cliente: usar apenas publishable/anon key, nunca service_role.
- [ ] Verificar dump/backup, identificador de ambiente e mecanismos de rollback; rotular claramente o preview como HOMOLOGAÇÃO.
- [ ] Banco vazio: instalar db/schema.sql, depois db/access-permissions.sql, db/pending-receipts.sql, e módulos adicionais existentes (caixa/contagem conforme a versão); banco existente: somente migrações incrementais apropriadas, **nunca executar schema.sql inteiro**.
- [ ] Aplicar, na ordem, `supabase/migrations/20261019201520_inventory_validate_session.sql` e `supabase/migrations/20261020221500_fiscal_write_integrity.sql`, com preflights. Conferir EXECUTE/RLS/ACL e chamadas RPC com papel anon.
- [ ] Criar um usuário gestor e um funcionário exclusivos de homologação por procedimento aprovado (hash, sem senhas no git); garantir que sessions próprias sejam validadas/revogadas.

## Gates automatizados
- [ ] CI PR #39: npm test e npm run build **no SHA final**, PostgreSQL 15 e 17 para sessão e integridade fiscal.
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
- PR #39 deve manter status draft enquanto falta CI no SHA final, homologação real, revisão de segurança, migração em homologação ou credenciais Preview isoladas.
- PRs dependentes **não são equivalentes** a PR integrado: seus checks isolados não comprovam o candidato.
- Repo privado não significa docs no GitHub Pages privados; notas operacionais ficam em governance/.
- Vercel Git integration pode criar preview automaticamente ao fazer push; **não confiar no preview sem verificar o banco ao qual está conectado**.
- Exposição fiscal de terceiros: fallback envia automaticamente um recorte do QR; dados próximos ao rodapé podem incluir informações sensíveis.
- O cancelamento existente apaga file_bytes; rollback SQL NÃO restaura o original. Definir retenção e backup antes de produção.
- `npm install` sem lockfile torna builds não inteiramente reproduzíveis; criar lockfile validado em PR separado.

## Retomada em uma única execução
1. Ler esta checklist e issues #30/#31/#32; consultar checks de #39.
2. Identificar **um** bloqueador reprodutível, corrigir com teste direcionado.
3. Atualizar issue com branch/SHA, comandos, resultado, pendências e próximo passo.
