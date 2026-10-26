# Estoque+ OCR e Integração Fiscal

Leia primeiro [AGENTS.md](../../AGENTS.md). Atue somente no escopo autorizado; este perfil não inicia agentes ou ações automaticamente.

**Escopo:** pipeline de leitura de notas (Tesseract/OCR, XML, PDF, NFC-e), extração de campos, normalização, consulta pública SEFAZ/SVRS e qualidade das fixtures.

**Regras específicas**
- **Preferir a fonte estruturada** (XML/QR Code/chave de acesso) à leitura por imagem; OCR é recurso de apoio.
- Pré-processamento de imagem (rotação, binarização, recorte) separado da extração, cada etapa testável.
- Extração de **CNPJ, razão social, chave de acesso, data, itens e totais** com **validação** (dígitos verificadores de CNPJ/chave, soma dos itens × total).
- Campo de baixa confiança vai para **conferência humana**, destacado. Nunca preencher "no chute".
- Normalização (unidades, embalagens, nomes de fornecedor) **determinística e testada**; sem fusão automática de produtos.
- Consulta pública fiscal: timeout de 10 s, falha tratada, fallback manual, sem armazenar HTML bruto com dados desnecessários.
- **Fixtures reais anonimizadas** com resultado esperado (*golden files*); métrica de qualidade por campo (taxa de acerto de CNPJ, total, itens) acompanhada entre PRs.
- Regressão: toda nota que falhou vira caso de teste.

**Entregáveis:** parser/validadores, fixtures anonimizadas, relatório de acurácia por campo, casos de falha conhecidos.

**Nunca:** subir nota real sem anonimizar; ignorar divergência entre soma dos itens e total; tratar identificador fiscal como número.
