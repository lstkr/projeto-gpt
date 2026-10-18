# Projeto GPT — Estoque da Cafeteria

Aplicação web para o estoque da cafeteria, com contas individuais, leitura assistida de cupons e notas e controle de reposição.

## Funcionalidades

- Consulta e alteração das quantidades em estoque.
- Cadastro de produtos, categorias, unidades e estoque mínimo.
- Histórico de entradas, saídas, notas e responsáveis pelas conferências.
- Importação de XML de NF-e.
- OCR de imagens executado em duas passagens, com melhoria de contraste e tentativa de separar cupons lado a lado.
- Leitura de QR Code NFC-e e extração de chave de acesso quando disponível; atalho à consulta pública oficial.
- Conferência manual obrigatória antes do lançamento.
- Área de administrador com valor do estoque, edição de custo e estoque mínimo.
- Lista de compras com sugestão de quantidade = estoque mínimo − estoque atual, exportável em CSV.

## Papéis de acesso

- `admin`: vê valores e custos, configura estoque mínimo e consulta/exporta lista de compras.
- `employee`: consulta produtos, altera estoque e lança/conferе documentos, sem visualizar custo por produto e valor total do estoque.
- O banco impõe as restrições: para sessões de funcionários, o RPC de leitura remove o custo dos produtos e o RPC de gravação preserva custos e mínimos já cadastrados. Produtos novos criados por funcionários começam com mínimo e custo zerados, a serem preenchidos pelo dono.
- Sessões expiram em 12 horas; o login limita tentativas consecutivas. Senhas são guardadas com bcrypt e tokens de sessão como hashes.

## QR Code e consulta fiscal

O leitor tenta obter o conteúdo do QR Code com `jsqr` e o detector nativo do navegador; se não encontrar, também procura a chave de acesso no texto lido por OCR. Quando identifica uma chave, a tela apresenta um link de consulta pública da NFC-e.

A consulta pública oficial permite consultar pela chave e pelo QR Code. Isso não equivale a uma API pública gratuita para retornar os itens automaticamente. A API de consulta em massa da NF-e oferecida pelo Serpro exige contratação, credenciais da API e certificado e-CNPJ. Consulte as informações oficiais antes de habilitar uma integração contratada:
- [Consulta pública de NF-e/NFC-e no RS](https://www.fazenda.rs.gov.br/servicos-ao-cidadao/servicos?servico=2065)
- [API de consulta de dados de NF-e do Serpro](https://www.gov.br/pt-br/servicos/obter-solucao-digital-de-consulta-de-dados-de-nota-fiscal-eletronica-nfe)

O OCR/QR ainda é assistivo: confirme descrição, quantidade, unidade e preço com o documento original. Uma imagem com vários cupons pode exigir que cada um seja revisado individualmente. Nada é lançado automaticamente.

## Banco de dados

O projeto usa Supabase. A linha JSONB em `public.shared_inventory` guarda o estado compartilhado. RLS bloqueia acesso direto à tabela; RPCs validam a sessão e aplicam regras por papel. As tabelas internas ficam em `private`.

O esquema canônico está em [db/schema.sql](db/schema.sql). As senhas reais de produção não devem ser adicionadas ao repositório.

O Supabase Security Advisor foi consultado após as mudanças de permissão e não retornou alertas.

## Aplicação Next.js

Requisitos: Node.js 20.9 ou superior.

```bash
npm install
npm run dev
```

As variáveis `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` podem ser definidas no ambiente. O projeto usa uma publishable key pública no cliente. Nunca incluir uma chave `service_role` ou secret key em código de frontend.

## Cuidados operacionais

- Verifique cada OCR antes de confirmar; OCR pode confundir números ou deixar itens de fora.
- Configure backups regulares do Supabase.
- Troque as credenciais iniciais por senhas fortes e exclusivas antes do uso diário.
