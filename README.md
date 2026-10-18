# Projeto GPT — Controle de Estoque

Aplicação web para acompanhar produtos, quantidades, custos e entradas de estoque a partir de documentos de compra.

## Funcionalidades do protótipo

- Painel com indicadores de estoque e produtos abaixo do mínimo.
- Cadastro de produtos e ajustes de quantidade.
- Importação local de XML de NF-e, com pré-visualização dos itens antes de confirmar.
- Upload de fotos/PDFs de cupons ou documentos com inclusão manual e conferência dos itens.
- Histórico local de documentos e movimentações.
- Interface responsiva em português.

## Executar localmente

Requisitos: Node.js 20.9 ou superior.

```bash
npm install
npm run dev
```

Acesse http://localhost:3000.

## Importante sobre os dados e documentos

Esta primeira versão é um protótipo: os cadastros e históricos ficam no `localStorage` do navegador, neste dispositivo/perfil. Ainda não há banco de dados compartilhado, autenticação ou sincronização entre usuários.

O XML da NF-e é lido no navegador. Fotos e PDFs podem ser anexados para organizar a conferência, mas **a leitura automática por OCR de imagens ainda não está implementada**; seus itens precisam ser preenchidos/revisados manualmente. Nenhum arquivo é enviado a um servidor nesta versão.

Antes de usar em operação real, o próximo passo é configurar banco de dados, autenticação, backups e um serviço de OCR, com revisão humana antes de movimentar o estoque.
