# Estado do Estoque+ — 01/11/2026

## Estado atual
- Main e58c8f9: B1/E1 aprovadas por Lucas; conferência desktop #193 integrada.
- #193: navegação melhorou; pedido atual corrige identificação e leitura da nota.
- #194 existente foi reaproveitada: SVRS preenche razão social/CNPJ e lê subtotal, desconto e total por rótulo.
- Alternativa XML/OCR: CNPJ só preenchido com dígitos verificadores válidos; espaços do OCR tolerados.
- CNPJ ausente/inválido aparece Pendente; rascunho não envia CNPJ inválido nesse campo.
- Leitura de quantidade/preço/unidade/classificação dos itens foi preservada exatamente da main.
- Sem banco, migração, lançamento, alteração de cálculo ou login neste bloco.
- Teste da #194 substituído por fixture sintética; dados identificáveis dos commits anteriores ainda existem no histórico da branch.

## Próximos passos — pedido atual
1. Publicar #194 com CI verde; Lucas testa CNPJ e campos oficiais no computador.
2. Limpeza apenas do texto de exibição dos itens, sem fundir produtos; usar nota enviada e aguardar mais 2 prints.
3. Conferido por definido no servidor pela sessão; preparar risco/reversão e pedir OK se mudar banco/login/permissões.
4. Retomar associação aos insumos/conversões e cadastro/consulta de estoque após correções atuais.

## Decisões
- Direção: desktop é o uso principal (cadastro, conferência completa, estoque e financeiro); celular fica com envio de foto, consulta rápida e login.
- Priorizar teclado, tabelas, campos visíveis e testes no computador; D1–D3 vira enviar foto → notas a conferir, preservando mobile atual sem polimento novo.
- Uma PR por vez; tela/leitura pode mesclar com CI verde; banco/estoque/custo/login exigem OK explícito.
- Pré-comercial #178 adiado até uso comercial; QR externo desativado por padrão; notificações futuras #186.
- Notas reais só em testes locais; guardar no Git apenas exemplos anonimizados.
- Produção não autorizada; homologação usa Estoque+ DB e projeto Vercel estoque-homologacao.

## Evidências deste bloco
- Testes relevantes: 19/19; build aprovado; navegador isolado passou SVRS/OCR/inválido sem lançar estoque.
- Suíte completa: 267/274; seis falhas locais antigas (Windows/CRLF) e uma por renomeação ainda não registrada no índice.
- Renomeação registrada: teste de configuração 3/3; restam somente as seis falhas locais antigas.
- CL-05/07/11/13/15/16 conferidas; sem dependência nova, nota real nova no Git ou SQL remoto.
