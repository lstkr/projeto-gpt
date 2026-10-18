# Projeto GPT — Estoque da Cafeteria

Controle de estoque compartilhado para a equipe da cafeteria (três funcionários e o dono), sem contas individuais. Os documentos de compra precisam ser conferidos manualmente e cada lançamento registra quem conferiu.

## Funcionalidades

- Visão geral do catálogo, custos estimados e alertas de estoque mínimo.
- Cadastro e edição de produtos, categorias, unidades e custos.
- Registro de entradas, saídas e motivo/responsável pela movimentação.
- Importação de XML de NF-e com itens extraídos do XML.
- OCR experimental em português para fotos de cupons; valide nome, quantidade, unidade e preço.
- PDF com preenchimento manual.
- Histórico de documentos e movimentações.
- Campo obrigatório **Quem conferiu** antes de lançar cada nota.
- Banco Supabase compartilhado, protegido por políticas RLS e funções que validam um código de acesso compartilhado.

## Banco e segurança

O banco está no Supabase (região São Paulo). A tabela `private.app_access` guarda apenas o hash do código de acesso; o segredo não fica no repositório. A tabela de estoque não permite acesso direto aos papéis públicos. As funções públicas de leitura/gravação validam o código antes de consultar/alterar os dados.

O Supabase Security Advisor foi verificado após as últimas migrações e não retornou alertas de segurança. Revise o painel periodicamente, principalmente depois de mudar as permissões SQL.

## Aplicação Next.js

Requisitos: Node.js 20.9 ou superior.

```bash
npm install
npm run dev
```

As variáveis `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` podem ser definidas no ambiente. Há valores públicos de fallback no cliente para facilitar a prévia; a publishable key é pública por projeto. Nunca inserir uma `service_role` ou secret key em código frontend.

## Prévia estática

A página autônoma em [docs/index.html](docs/index.html) permite uma prévia estática da interface e utiliza o mesmo banco. Ela lê o código compartilhado do fragmento da URL (`#access=...`) ou da sessão do navegador. O fragmento não é enviado ao servidor web. O link equivale a uma credencial: compartilhe somente com a equipe e regenere-o caso vaze.

Para publicar a prévia pelo GitHub Pages:
1. Abra **Settings → Pages** no repositório.
2. Em **Build and deployment**, selecione **GitHub Actions** como fonte.
3. Volte a **Actions** e reexecute o workflow “Publish inventory preview” se ele não iniciar automaticamente.

O workflow está em [.github/workflows/pages.yml](.github/workflows/pages.yml). O GitHub Actions conectado atualmente não tem permissão administrativa para habilitar Pages por API, então a primeira ativação precisa ser feita nas configurações.

## Cuidados antes do uso operacional

- Confira manualmente cada item antes de lançar nota/cupom; OCR é experimental.
- Faça testes com documentos reais antes de depender do saldo para compras ou decisões financeiras.
- Configure backups regulares no Supabase.
- O estoque é compartilhado; o código de acesso é a chave da equipe. Não é um sistema de identidade individual.
