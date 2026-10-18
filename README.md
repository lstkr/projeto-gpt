# Projeto GPT — Controle de Estoque

Aplicação web responsiva para acompanhar produtos, quantidades, custos e entradas de estoque a partir de documentos de compra.

## Funcionalidades do protótipo

- Painel com indicadores de estoque e produtos abaixo do mínimo.
- Cadastro de produtos, edição e ajustes de entrada/saída.
- Importação de XML de NF-e no navegador, com pré-visualização dos itens antes de confirmar.
- OCR experimental em português para fotos de cupons; os itens sugeridos podem conter erros e devem ser conferidos antes do lançamento.
- Inclusão manual de itens para PDF ou imagem quando o OCR não identificar os dados corretamente.
- Histórico local de documentos e movimentações, com consulta dos itens de cada documento.
- Busca, filtros por categoria/status e layout responsivo.

## Executar localmente

Requisitos: Node.js 20.9 ou superior.

```bash
npm install
npm run dev
```

Acesse http://localhost:3000.

## Limitações importantes

Esta primeira versão é um protótipo. Cadastros e históricos ficam no `localStorage` do navegador e não sincronizam entre dispositivos ou usuários. Não há autenticação, banco de dados compartilhado ou backups.

O XML da NF-e é a opção preferencial por conter dados estruturados. O OCR das fotos roda no navegador usando Tesseract.js e o idioma português é carregado do serviço de dados do mecanismo; a imagem não é enviada a um servidor da aplicação. O reconhecimento de cupons é heurístico: revise nomes, quantidades e preços. O OCR automático de PDFs ainda não está implementado.

Antes de usar em operação real, configure banco de dados, autenticação, backups e testes com os documentos utilizados no negócio. Qualquer leitura automática precisa de conferência humana antes de alterar o estoque.
