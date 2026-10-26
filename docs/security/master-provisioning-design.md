# Desenho: MASTER híbrida para bootstrap e recuperação

**Estado:** proposta para revisão; não implementa RPC, endpoint ou configuração de segredo.

## Objetivo e ameaça

A MASTER só autoriza bootstrap do primeiro superadmin, quando ainda não existe um, e recuperação de superadmin existente sem sessão válida. Não participa do cadastro rotineiro de Gestores/Funcionários. Criação rotineira usa sessão válida de superadmin e as RPCs existentes `inventory_user_create` e `inventory_manager_grant`, com autorização e tenant validados no servidor/banco. Não presumir Supabase Auth.

## Desenho recomendado

1. Criar tabela privada singleton, por exemplo private.master_credentials, guardando somente hash bcrypt via pgcrypto.crypt, estado ativo e timestamps. A migration não insere hash ou valor padrão.
2. Gerar a MASTER com CSPRNG e pelo menos 32 bytes de entropia, nunca escolhida pelo usuário. Utilitário local entrega uma única vez por canal privado; não usar argumentos de processo, Git, CI, issue ou log. Provisionamento/rotação do hash exigem operação separada aprovada; não há hash ou segredo padrão na migração.
3. API route server-side fica desligada por padrão por variável server-only. Desligada, recusa antes de consultar credencial. Não usar `NEXT_PUBLIC_*`. Bootstrap/recuperação validam MASTER e condições persistentes sem exigir uma sessão que ainda não existe; nunca criar RPC anônimo privilegiado. Credencial server-only e grants serão fechados na implementação, sem segredo no bundle.
4. Bootstrap verifica ausência de superadmin dentro da mesma transação/lock que cria o primeiro e grava auditoria. Duas tentativas concorrentes só criam uma conta. Após existir superadmin, MASTER não pode criar novos usuários. Username lower-case e único; senha mínima 12 caracteres e máximo 72 bytes para bcrypt.
5. Recuperação sem sessão válida só atua sobre superadmin existente: senha válida, troca obrigatória e revogação das sessões na mesma transação auditável. Não cria conta, eleva papel ou muda tenant. Cadastro rotineiro continua nas RPCs por sessão, sem MASTER. Diferenças entre permissões atuais e política aprovada exigem revisão Back-end/Database antes de implementar; este desenho não muda contratos silenciosamente.
6. Funções privadas têm `search_path` fixo e `EXECUTE` revogado de PUBLIC, anon e authenticated. Somente chamada server-side autorizada pode invocá-las; validam novamente operação e condições persistentes. Criação rotineira verifica sessão/papel/tenant diretamente nas RPCs existentes.

## Tentativas, bloqueio e mensagens

- Rate limit na API route por IP confiável da plataforma e por tentativa; não confiar em header arbitrário do cliente. Guardar apenas HMAC/digest para escopo, nunca segredo ou body.
- Atraso progressivo com teto e janela curta. Não aplicar bloqueio global permanente à MASTER: terceiro não pode impedir todos os gestores de provisionar contas.
- Resposta genérica para MASTER incorreta, usuário duplicado ou permissão negada; Retry-After sem detalhes da conta. Não devolver erro bruto do banco.
- Auditoria registra ator quando validado, ação, resultado, data e correlação; fluxos sem sessão registram origem excepcional sem inventar ator autenticado. Nunca senha, hash da MASTER, hash de senha, token ou body. Falha de auditoria aborta a operação crítica.
- Redigir logs de API, tracing e erros. Teste automatizado procura a MASTER fictícia nos logs e respostas.

## Alternativa e recomendação

**Alternativa:** criar usuários somente por script do proprietário, conectado ao banco por credencial server-side e sem tela pública. Prós: menor superfície pública e sem risco de lockout por terceiros; contras: exige operação manual e acesso técnico em cada cadastro.

**Recomendação:** usar MASTER somente nos dois fluxos excepcionais, com rota desligável, limite por origem e auditoria. Manter utilitário privado do proprietário como recuperação operacional; rotina de gestores/funcionários usa sessão de superadmin. Implementação somente depois da aprovação explícita deste desenho, em PR separado.

## Relação com objetos existentes

- Migration 20261022145500_admin_password_recovery.sql cria public.inventory_admin_password_reset. Ela redefine senha individual, marca troca obrigatória e revoga sessões; não é MASTER.
- Migration 20261023000500_user_directory_update.sql cria public.inventory_user_update e private.app_user_edit_audit. Trata metadados do diretório, não senhas ou MASTER.
- Catálogo lido do legado não encontrou RPC literal admin_password_recovery nem tabela privada com nome de access/code. private.app_login_attempts guarda username e horário; accessCode no cliente é token de sessão Estoque+, não MASTER.
- private.bootstrap_superadmin cria o bootstrap de superadministrador; deve ser restrita após provisionamento inicial da instalação canônica, sem confundi-la com MASTER.

## Critérios de aceite antes de implementação

| Cenário | Resultado obrigatório |
|---|---|
| MASTER errada/ausente | Mensagem genérica e nenhuma alteração |
| Tentativas por uma origem | Atraso progressivo local; outra origem continua disponível; sem bloqueio global |
| Rota desligada | Negada antes de consultar segredo |
| Bootstrap concorrente | Um primeiro superadmin; segunda tentativa recusada |
| Bootstrap com superadmin existente | Recusado mesmo com MASTER correta |
| Recuperação sem sessão | Apenas superadmin existente; troca obrigatória, sessões revogadas e auditoria atômica |
| Cadastro rotineiro | RPCs existentes com sessão válida de superadmin/tenant, sem envio de MASTER |
| Papel negado/tenant divergente | Recusa no servidor/banco, inclusive chamada direta |
| Username duplicado/inválido | Recusa sem confirmar conta na resposta excepcional |
| Senha fora da política | Recusa antes de persistir |
| Falha de gravação/auditoria | Rollback integral |
| Logs/respostas/tracing | Segredo sintético e hashes ausentes, comprovados por teste |
| Rotação | Segredo anterior recusado e evento sem segredo |

**Não executado:** nenhuma alteração de banco, segredo, API ou teste.
