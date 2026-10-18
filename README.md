# Projeto GPT — Estoque da Cafeteria

Aplicação web para controle compartilhado do estoque da cafeteria, com contas individuais para identificar quem acessa o sistema.

## Funcionalidades

- Visão geral do catálogo, custos estimados e alertas de estoque mínimo.
- Cadastro e edição de produtos, categorias, unidades e custos.
- Registro de entradas, saídas e motivo/responsável pela movimentação.
- Importação de XML de NF-e com itens extraídos do XML.
- OCR experimental em português para fotos de cupons; valide nome, quantidade, unidade e preço.
- PDF com preenchimento manual.
- Histórico de documentos e movimentações.
- Campo obrigatório **Quem conferiu** antes de lançar cada nota.
- Banco Supabase compartilhado com autenticação individual por usuário.

## Contas e sessão

O banco registra papéis `admin` e `employee`. As senhas são armazenadas como hashes bcrypt; a aplicação emite tokens temporários de sessão, guarda apenas o hash deles no banco e encerra a sessão ao sair. As sessões expiram após 12 horas. O login tem limite de tentativas incorretas.

As credenciais reais são provisionadas diretamente no banco e **não devem ser incluídas neste repositório**. O papel da conta aparece na interface. Nesta versão, dono e funcionários compartilham as mesmas operações de estoque; uma tela de administração com permissões exclusivas para o dono ainda não foi implementada.

## Banco e segurança

O projeto usa uma linha JSONB em `public.shared_inventory` para o estado do estoque. O acesso direto à tabela está bloqueado por RLS; as funções RPC validam uma sessão ativa antes de ler ou gravar. As tabelas internas de usuários, sessões e tentativas ficam no schema `private` e não podem ser consultadas diretamente pelos clientes.

A configuração canônica do banco para novos projetos está em [db/schema.sql](db/schema.sql). Esse arquivo não inclui senhas reais.

O Supabase Security Advisor foi verificado após a alteração da autenticação e não retornou alertas. Revise o painel periodicamente, especialmente após mudanças em permissões SQL.

## Aplicação Next.js

Requisitos: Node.js 20.9 ou superior.

```bash
npm install
npm run dev
```

As variáveis `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` podem ser definidas no ambiente. Há valores públicos de fallback no cliente para facilitar a prévia; uma publishable key é pública por projeto. Nunca inserir uma `service_role` ou secret key em código frontend.

## Prévia estática

A página autônoma em [docs/index.html](docs/index.html) usa o mesmo login individual do aplicativo. Não compartilhe tokens de sessão e não coloque senhas no repositório.

Para publicar a prévia pelo GitHub Pages:
1. Abra **Settings → Pages** no repositório.
2. Em **Build and deployment**, selecione **GitHub Actions** como fonte.
3. Volte a **Actions** e reexecute o workflow “Publish inventory preview” se ele não iniciar automaticamente.

O workflow está em [.github/workflows/pages.yml](.github/workflows/pages.yml). O GitHub Actions conectado não tem permissão administrativa para habilitar Pages por API, então a primeira ativação precisa ser feita nas configurações.

## Cuidados antes do uso operacional

- Confira manualmente cada item antes de lançar nota/cupom; o OCR é experimental.
- Faça testes com documentos reais antes de depender do saldo para compras ou decisões financeiras.
- Configure backups regulares no Supabase.
- Use senhas fortes e exclusivas; as credenciais iniciais solicitadas devem ser trocadas assim que possível.
