# Prévia local do Giro integrado

Esta prévia usa o aplicativo Next.js real desta branch com uma API fictícia em loopback.
Não usa credenciais reais, não conecta ao Supabase remoto e recusa gravações na API simulada.
Nunca enviar documentos reais ou usar contas/senhas reais nesta demonstração.

Em dois terminais, a partir da worktree:

```powershell
node scripts/preview/giro-fixtures.cjs
```

```powershell
$env:NEXT_PUBLIC_SUPABASE_URL='http://127.0.0.1:4175'
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY='giro-local-fixture-public-key'
$env:NEXT_PUBLIC_SUPABASE_PREVIEW_URL='http://127.0.0.1:4175'
$env:VERCEL_ENV=''
npm run dev -- --hostname 127.0.0.1 --port 4174
```

Use Node.js 22.13 ou superior da linha 22 e execute `npm ci` nesta worktree antes de iniciar.
A origem permitida na API fictícia é a porta 4174; não alterar a política de preview HTTPS.

Acesse http://127.0.0.1:4174. Conta ilustrativa `gestor.demo`; senha fictícia `somente-exemplo-local`.
Para visualizar o perfil Funcionário: `equipe.demo`, com a mesma senha de exemplo.
Esses valores não correspondem a contas reais. Não há bootstrap nem criação de usuários.

## Roteiro de confere

1. Estoque: marca/cores, unidade, contador de reposição e atividade recolhida.
2. Notas: abrir o XML ou PDF de exemplo; conferir original ao lado e download; nenhuma entrada real.
3. Caixa: seis modalidades, seleção explícita do número e correção com motivo/histórico preservados.
4. Visão do Gestor: mudar mês/ano e abrir modalidades/qualidade; compras e estoque têm escopos distintos.
5. Funcionário e tela estreita: painel gerencial ausente, tabela contida, original empilhado.

API fictícia recusa salvamento; alertas de autosave nesta prévia não significam erro do banco real.
As datas e valores são sintéticos. Não servem para avaliar o desempenho de um negócio.
Encerrar os dois processos com Ctrl+C. Nenhuma variável é gravada em `.env`.
