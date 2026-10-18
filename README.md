# Projeto GPT — Controle de Estoque

Aplicação web responsiva para cadastro de produtos, controle de entradas/saídas e importação conferida de documentos fiscais.

## O que está incluído

- Painel de estoque, alertas de reposição, custos e quantidade por produto.
- Cadastro/edição de produtos e registro de entradas e saídas.
- Importação local do XML completo de NF-e, com conferência dos itens antes de confirmar.
- OCR experimental em português para fotos de cupons (as sugestões podem conter erros).
- Histórico de documentos e movimentações.
- Login e criação de conta por e-mail quando as variáveis Supabase estão configuradas.
- Persistência no PostgreSQL do Supabase, com Row Level Security (RLS), para que cada conta só acesse a própria linha de estoque.
- Fallback de demonstração em `localStorage` quando o Supabase não está configurado.

## Rodar localmente

Requisitos: Node.js 20.9 ou superior.

```bash
npm install
cp .env.example .env.local
# Preencha as duas variáveis Supabase se já tiver um projeto configurado.
npm run dev
```

Acesse http://localhost:3000.

## Configurar o banco e o login

1. Crie um projeto Supabase e configure a autenticação por e-mail em **Authentication → Providers**.
2. No **SQL Editor** desse projeto, execute o conteúdo de [db/schema.sql](db/schema.sql). A tabela possui RLS e políticas para que uma sessão autenticada consulte/insira/atualize somente o próprio `user_id`.
3. Copie a URL do projeto e a publishable key/anon key pública para `.env.local` ou para as variáveis de ambiente do projeto na Vercel:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Na configuração de autenticação do Supabase, ajuste **Site URL** e **Redirect URLs** para os endereços locais/de produção usados pela aplicação.
5. Faça um teste criando duas contas separadas e verifique que os dados de uma não aparecem na outra.

A chave pública `anon`/publishable pode ser usada no navegador somente com RLS corretamente aplicada. **Nunca** coloque uma `service_role` ou secret key em variável `NEXT_PUBLIC_*`.

## Documentos fiscais

O XML completo de NF-e é preferível à foto por trazer os itens em formato estruturado. Fotos de cupom usam OCR experimental no navegador; confira descrição, unidade, quantidade e preço antes de lançar. PDF ainda exige preenchimento manual. A aplicação não envia imagens para um serviço externo de OCR, mas o Tesseract baixa os dados do modelo de idioma quando necessário.

## Limitações atuais

- O armazenamento em nuvem só é ativado depois de configurar um projeto Supabase e suas variáveis de ambiente.
- Esta versão guarda o estado de cada usuário em um documento JSON por conta. Para múltiplos usuários operando o mesmo estoque compartilhado, será preciso evoluir o modelo para empresas/estoques compartilhados e papéis de acesso.
- Não há rotina de backup configurada nem OCR automático de PDF.
- Antes de uso operacional, valide o comportamento com notas e cupons reais e mantenha a conferência humana antes de alterar quantidades.

A verificação de build do Next.js está em [.github/workflows/ci.yml](.github/workflows/ci.yml).
