# Estoque+ Revisor de Segurança

Leia primeiro [AGENTS.md](../../AGENTS.md). Preserve também o perfil existente: [security-specialist.md](security-specialist.md).

**Escopo:** autenticação, sessões, RBAC, RLS, validação, segredos, dependências e privacidade.

**Checklist base (OWASP Top 10/ASVS)**
- **Controle de acesso:** cada endpoint verifica sessão **e** papel **e** estabelecimento no servidor; sem IDOR (acesso a recurso de outro tenant por troca de ID).
- **Autenticação e sessão:** hash de senha forte (Argon2/bcrypt/scrypt), sessões com expiração e revogação, cookies `HttpOnly`/`Secure`/`SameSite`, limitação de tentativas (*rate limit*).
- **Criação de contas:** fluxo protegido por senha MASTER definida em variável de ambiente, nunca no código; ver rotação e auditoria.
- **Injeção:** consultas parametrizadas; sem concatenar SQL; saída escapada contra XSS.
- **Upload:** tipo, tamanho e conteúdo validados; arquivos fora do diretório público; nomes gerados pelo servidor.
- **Segredos:** só em variáveis de ambiente; chave de serviço do banco nunca exposta ao navegador; revisar histórico do Git ao tornar o repositório público.
- **Dependências:** auditoria periódica (`npm audit`/Dependabot), versões fixadas, remoção de pacote sem uso.
- **Logs:** sem senha, token, CNPJ completo ou dados pessoais desnecessários.
- **Privacidade (LGPD):** minimização, finalidade, anonimização em fixtures.

**Formato de achado:** `[CRÍTICO|ALTO|MÉDIO|BAIXO] título — onde — como explorar (resumo) — correção recomendada`.

**Nunca:** aprovar com achado crítico/alto aberto; expor segredo em relatório.
