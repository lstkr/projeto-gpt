# Estado do Estoque+ — 01/11/2026
## Estado atual
- Main e407b32: B1/E1 aprovadas; desktop #193 e CNPJ/SVRS #194 publicados na homologação.
- Item 1 atual: chave numérica NF-e55/NFC-e65 validada localmente (DV, UF/mês/modelo e CNPJ).
- Chave mostra UF, mês/ano, série e número como texto; fornecedor é emitente, nunca destinatário.
- CNPJ/chaves divergentes ou chave preenchida inválida ficam Pendentes e bloqueiam confirmação na tela.
- Escolhas humanas explícitas ligadas às leituras permitem resolver divergência sem ocultar evidências.
- QR/CODE128/OCR locais; retirada a chamada da tela ao leitor externo de imagens.
- Consulta oficial NFC-e e arquivamento no sistema preservados; DANFE não usa consulta NFC-e.
- Sem banco, migração, conversão de estoque/custo ou alteração de login neste bloco.
## Próximos passos — ordem atual de Lucas
1. Publicar/testar identificação local pela chave no computador.
2. Limpar OCR: desconto/líquido não são itens; juntar linhas; CNPJ quebrado, CPF do destinatário e ruído.
3. Dicionário único de unidades; ML só sugere maço com contexto claro; ambiguidade fica Pendente.
4. Avisar divergência da soma dos itens menos desconto frente ao total, sem mudar lançamentos.
5. Dica uma nota por foto; detecção/separação local de duas notas com escolha humana se incerta.
6. Detectar pacote - N unid e sugerir composição; não converter estoque/custo.
7. Conferido por automático definido no servidor pela sessão continua na fila; pedir OK se banco/login.
8. Associação/conversão exige OK com risco/reversão e perguntar controle em unidades ou pacotes.
## Decisões
- Desktop: cadastro, conferência completa, estoque e financeiro; celular: foto, consulta rápida e login.
- Uma PR por vez; tela/texto/leitura integra com CI verde; banco/estoque/custo/login requerem OK.
- Pré-comercial #178 adiado até uso comercial; produção não autorizada; QR externo sem uso pela tela.
- Fotos reais apenas em testes locais; repositório só recebe dados sintéticos/anonimizados.
- DANFE anexado abriu; arquivo da foto com duas NFC-e não encontrado e precisa ser reenviado.
## Evidências deste bloco
- 27 testes relevantes passaram; build aprovado; navegador isolado passou quatro cenários incluindo DANFE.
- Suíte uma vez: 276/282; seis falhas locais antigas Windows/bcryptjs/CRLF; CI fará validação Linux.
- DANFE real: OCR local extraiu uma chave válida55; barcode dessa foto não leu; CODE128 sintético passou.
- Modo econômico proposto em PR docs rascunho: cabeçalho só no final, leitura/testes/revisão focados; sem merge.
- Revisão fiscal independente: achados corrigidos e sem novo impeditivo; CL-07/11/13/15/16 conferidas.
## Giro — preview local 02/11/2026
- Layout aprovado aplicado na branch codex/giro-layout; ícone 3 provisório, sem main/deploy/banco.
- PR #197 rascunho: filtros, itens em largura total, contagem em cartões, gráfico diário/mensal; sem merge.
- 306/306 na suíte; 7/7 após correção da revisão; build e regressão visual em seis larguras passaram.
- Nova branch fix/giro-ui-followup: 6 ajustes focados; WebKit reserva estável; Firefox/Safari real pendentes.
