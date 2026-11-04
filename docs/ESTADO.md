# Estado do Estoque+ — 02/11/2026

## Estado atual
- Main 122ba79 inclui #188 e #189, integradas nessa ordem; CI verde.
- #183 diretrizes enxutas e #185 redução de foto integradas; foto aprovada por Lucas.
- B1 publicada e migração aplicada SOMENTE na homologação Estoque+ DB.
- Supabase Estoque+ DB confirmado; produção não autorizada e não alterada.
- Backup B1 protegido e conferido: 3 fechamentos e 2 funções; sem exportar conteúdo.
- QR externo desativado por padrão; pendências pré-comerciais na #178.
- Notificações futuras registradas na #186.
- Homologação: https://estoque-homologacao-ashy.vercel.app/

## Fila atual — PRs pequenas, nesta ordem
1. Concluído: fornecedor pela chave de acesso, #195 integrada (7766b1c). Teste desktop de Lucas pendente; não bloqueia a fila.
2. Em preparação: limpeza OCR — desconto/líquido fora dos itens, descrições em duas linhas, CNPJ quebrado, CPF junto ao destinatário e texto de baixa confiança.
3. Dicionário único de unidades e sinônimos: IN/UNID/UND → UN; ML em hortifruti → maço (molho como sinônimo); ambiguidade → Pendente.
4. Conferência de soma: itens menos desconto devem coincidir com o total; avisar divergência.
5. Duas notas na foto: separar localmente, revisar uma por vez e permitir escolha se incerto; dica “uma nota por foto”.
6. Pacotes: apenas sugerir “2 pacotes de 10 un”; conversão de estoque/custo depende de associação e OK humano.
7. Conferido por: usuário logado, definido no servidor; banco/login exigem OK, risco e rollback.

## Pendências anteriores
- Teste humano B1: motivo, histórico, duas abas e acesso de funcionário.
- E1 depende da confirmação humana de B1; nenhum novo trabalho de banco autorizado.
- Desktop prioritário; celular para envio de foto e consulta rápida.
- Não repetir OCR de foto real; exemplos de teste anonimizados.
- CI: esperar uma vez, conferir uma vez, reiniciar uma vez; persistindo, parar.
- Merge automático autorizado apenas com CI verde, sem conflito e baixo risco; fiscal/banco/dinheiro/estoque/login/exclusão exigem OK.

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
- Tela B1: 29 testes relevantes e 23 checks CI passaram; deploy READY SHA122ba79.
- Smoke da homologação: 8/8; interface autenticada ainda depende de teste humano.
- CL-10/12/13/16 revisadas; sem reset remoto; projeto legado Vercel inalterado.

## Trabalho local do item 2 — 02/11/2026, sem PR/merge autorizado
- Base: origin/main 7766b1c (#195); branch codex/ocr-limpeza-item2.
- Script temporário removido e ausente do histórico alcançável das referências consultadas.
- Comparação antes de continuar: main limpa reproduziu as mesmas 13 falhas sem configuração; com valores fictícios CI, main e item 2 tiveram as mesmas 6 (bootstrap sem dependências locais + 5 CRLF). Nenhuma das 7 adicionais foi causada pelo item 2.
- Ambiente: somente npm ci nos lockfiles da raiz e scripts/admin de ambos os checkouts; package.json e lockfiles sem diff. Cinco documentos restaurados aos bytes LF originais; git diff confirma zero mudança de conteúdo. Não incluir correção de ambiente na PR fiscal.
- Main: npm test 282/282. Item 2 após redesenho: npm test 288/288.
- Build do item 2: npm run build exit 0, somente placeholders de .github/workflows/ci.yml e modo preview; sem credenciais reais/conexão de banco.
- Confiança por linha/palavra só acrescenta readingWarning; não descarta nem aprova itens. Média global não autoriza linha. Sem metadados, exige conferência explícita pelo aviso.
- Revisão fiscal independente: bloqueios anteriores corrigidos; 10/10 testes de limpeza/identidade na revisão. Códigos repetidos/metadados parciais continuam como ponto de melhoria da associação de alertas por texto.
- Limitações: sem teste de interface/foto real; Node local 22.11 abaixo do mínimo declarado por pdfjs-dist (22.13), sem atualização de runtime autorizada; avisos CSS existentes.
- Nenhuma PR, CI remoto, merge ou deploy. Rollback: desfazer apenas o diff local do item 2; ambiente não muda contratos nem banco.

## Rascunho item 2 — acompanhamento remoto
- PR #198: https://github.com/lstkr/projeto-gpt/pull/198 — DRAFT, OPEN, sem merge; SHA 70f43bee628ffcb67ce6ce5c6cbf5d0cfff00489.
- Apenas quatro arquivos fiscais, +130/-5; nenhum ambiente/CRLF/documentação no commit.
- CI remoto: 23/23 checks passaram; aguardado uma vez, conferido uma vez, sem reinício.
- Preview READY do mesmo SHA: https://estoque-homologacao-1cashiv5q-lstkr.vercel.app
- CI build: Node v22.23.4 (>=22.13). Vercel: projeto 22.x; logs/metadados não expõem minor, portanto não confirmado >=22.13 por evidência direta.
- Propostas não implementadas: PR runtime mínimo >=22.13 <23 com verificação/log do Node no build; PR CRLF mínima com .gitattributes restrito aos cinco documentos afetados (eol=lf), mantendo testes intactos.
- Logs somente locais em .worktrees/ocr-item2/pr198-*. Não fazer merge sem OK humano.

## Reteste humano da DANFE e correção — 03/11/2026
- Lucas aprovou fornecedor, mas reprovou itens: fallback interpretou cabeçalho/endereço como produtos. Não homologado.
- Correção no rascunho #198, SHA ec8a79a888abfeb458eaf24fc2e0d915c61a2c04: parser isolado restringe leitura à tabela, rejeita extração incompleta e montantes sinalizados, exige igualdade decimal exata e mantém aviso humano. Sem conversão de embalagem.
- Ação explícita na conferência: Texto reconhecido na foto → Reinterpretar tabela DANFE (sem novo OCR). Confirma substituição dos itens/totais, preserva pendência/revisão e exige nova conferência. Nenhuma nota real foi reinterpretada pelo agente ou lançada.
- Testes: 294/294; build aprovado com valores fictícios CI; revisão fiscal independente 12/12 e sem outro bloqueio concreto após corrigir sinais.
- CI novo 23/23 checks aprovados; PR segue DRAFT/OPEN, sem merge.
- Novo preview READY e tela de login verificada: https://estoque-homologacao-o9l23gyjg-lstkr.vercel.app
- Autorização Preview somente da branch codex/ocr-limpeza-item2 aponta para Estoque+ DB confirmado; nenhuma alteração no banco.
- Nota original permaneceu fora do Git; testes públicos usam transcrição sintética. Sem repetir OCR real.
- Pendente: teste humano usando texto salvo. Tabelas com tributos/células adicionais ou leitura incompleta podem exigir preenchimento manual.
