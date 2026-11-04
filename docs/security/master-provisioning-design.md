# Desenho: provisionamento de usuários protegido por MASTER

**Estado:** proposta para revisão; não implementa RPC, endpoint ou configuração de segredo.

## Objetivo e ameaça

A MASTER é uma segunda autorização para cadastrar Gestores e Funcionários. O repositório é público e RPCs public expõem EXECUTE à role anon; portanto, um endpoint MASTER não pode ser RPC anônimo. A sessão Estoque+ continua obrigatória e deve ser validada no servidor/banco.

## Desenho recomendado

1. Criar tabela privada singleton, por exemplo private.master_credentials, guardando somente hash bcrypt via pgcrypto.crypt, estado ativo e timestamps. A migration não insere hash ou valor padrão.
2. Definir o valor inicial uma única vez pelo proprietário via utilitário local versionado com entrada oculta; nunca passa pelo Git, CI, issue ou log. A rotação usa o mesmo canal e grava somente hash e evento.
3. O formulário chama API route server-side, não supabase.rpc direto do navegador. A rota valida sessão, papel, vínculo ao tenant ativo, username normalizado e política de senha; chama a rotina privada usando credencial server-only já configurada fora do cliente. Nenhuma chave privilegiada vai ao bundle.
4. A rotina verifica MASTER com crypt, cria usuário, guarda somente hash da senha, registra vínculo e evento de auditoria na mesma transação. Username lower-case e formato único; senha mínima 12 caracteres e limite máximo de 72 bytes para bcrypt.
5. Gestor não pode criar superadmin. Criação de Gestor fica restrita ao fluxo DBA/proprietário; Funcionário permanece no tenant ativo.
6. RPC privilegiada não concede EXECUTE a PUBLIC, anon ou authenticated. Somente a chamada server-side autorizada pode invocá-la; a rotina também valida sessão/papel.

## Tentativas, bloqueio e mensagens

- Rate limit na API route por IP confiável da plataforma e por tentativa; guardar apenas HMAC/digest para escopo, nunca segredo ou body.
- Atraso progressivo com teto e janela curta. Não aplicar bloqueio global permanente à MASTER: terceiro não pode impedir todos os gestores de provisionar contas.
- Resposta genérica para MASTER incorreta, usuário duplicado ou permissão negada; Retry-After sem detalhes da conta. Não devolver erro bruto do banco.
- Auditoria registra ator quando validado, ação, resultado, data e correlação; nunca senha, hash da MASTER, hash de senha, token ou body.
- Redigir logs de API, tracing e erros. Teste automatizado procura a MASTER fictícia nos logs e respostas.

## Alternativa e recomendação

**Alternativa:** criar usuários somente por script do proprietário, conectado ao banco por credencial server-side e sem tela pública. Prós: menor superfície pública e sem risco de lockout por terceiros; contras: exige operação manual e acesso técnico em cada cadastro.

**Recomendação:** usar fluxo server-side com MASTER somente se a API route puder controlar execução e tentativas sem RPC anônimo; manter script do proprietário como bootstrap/recuperação. Se controle de origem e redação de logs não forem demonstrados em testes, lançar inicialmente apenas o script do proprietário.

## Relação com objetos existentes

- Migration 20261022145500_admin_password_recovery.sql cria public.inventory_admin_password_reset. Ela redefine senha individual, marca troca obrigatória e revoga sessões; não é MASTER.
- Migration 20261023000500_user_directory_update.sql cria public.inventory_user_update e private.app_user_edit_audit. Trata metadados do diretório, não senhas ou MASTER.
- Catálogo lido do legado não encontrou RPC literal admin_password_recovery nem tabela privada com nome de access/code. private.app_login_attempts guarda username e horário; accessCode no cliente é token de sessão Estoque+, não MASTER.
- private.bootstrap_superadmin cria o bootstrap de superadministrador; deve ser restrita após provisionamento inicial da instalação canônica, sem confundi-la com MASTER.

## Critérios de aceite antes de implementação

Testar MASTER errada, atraso sem bloqueio global, auditoria sem segredo, ausência do valor em logs/respostas, Gestor criado somente por DBA/proprietário, Funcionário no tenant ativo, duplicidade, username normalizado, senha inválida, sessão inválida, tentativa concorrente e rotação.

**Não executado:** nenhuma alteração de banco, segredo, API ou teste.