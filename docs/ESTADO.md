# Estado do Estoque+ — 01/11/2026

## Estado atual
- Main 8b70853: B1 #188/#189/#190/#191 e E1 #192 integradas somente na homologação.
- Lucas aprovou todos os testes B1/E1, incluindo duas abas, duplicidade, estorno e relançamento.
- E1 aplicada no Estoque+ DB com OK; estoque, caixa, histórico e usuários preservados.
- Deploy E1 READY; smoke 8/8; produção não autorizada e não alterada.
- Foto reduzida #185 aprovada; OCR lê original; QR externo desativado por padrão.
- Item 1 em desenvolvimento: conferência desktop mais larga, navegação por etapas e pendências por escrito.
- Enter nos campos não lança a nota; botão explícito e conferência final existentes preservados.
- Sem mudança em cálculo, associação, estoque, banco ou login neste item.

## Próximos passos — ordem aprovada
1. Publicar item 1 com CI verde; Lucas testa nota real, campos, teclado e pendências no computador.
2. Associação dos produtos da nota aos insumos e conversão de unidades/embalagens: pedir OK com risco e reversão.
3. Cadastro e consulta de estoque no computador.
4. OCR do CNPJ/DANFE onde couber.

## Decisões
- Direção: desktop é o uso principal (cadastro, conferência completa, estoque e financeiro); celular fica com envio de foto, consulta rápida e login.
- Priorizar teclado, tabelas, campos visíveis e testes no computador; D1–D3 vira enviar foto → notas a conferir, preservando mobile atual sem polimento novo.
- Pendências pré-comerciais #178 adiadas até o projeto virar comercial; notificações futuras #186.
- Uma PR por vez; tela de baixo risco pode integrar sem novo OK com CI verde e sem conflito.
- Banco/dinheiro/estoque/fiscal/login/exclusão/produção exigem OK explícito; nenhuma produção autorizada.
- Reset total exige NOVO OK; reversão E1 suspende notas novas sem apagar dados/histórico.

## Evidências deste bloco
- Testes relevantes da tela: 13/13; build aprovado; regras de lançamento intactas.
- Suíte completa: 260/266; seis falhas locais antigas de Windows/bcryptjs e CRLF de documentação.
- Chrome local: Tab/Shift+Tab, Enter seguro, etapas e pendências passaram; larguras 1440/1280/390px sem overflow externo.
- CL-05/07/13/15/16 conferidas; sem dependência nova no projeto.
