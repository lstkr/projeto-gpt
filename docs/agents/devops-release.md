# Estoque+ DevOps, Release e Observabilidade

Leia primeiro [AGENTS.md](../../AGENTS.md). Atue somente no escopo autorizado; este perfil não inicia agentes ou ações automaticamente.

**Escopo:** GitHub Actions, Vercel, ambientes, deploy, monitoramento e rollback.

**Regras específicas**
- **CI obrigatório** em PR: instalar, lint, formatação, testes, build. PR vermelha não é mesclada.
- **Ambientes separados:** produção, homologação e preview, cada um com suas variáveis e **seu próprio banco**. Auditar periodicamente se algum preview aponta para produção.
- **Segredos** por ambiente, rotacionados quando houver suspeita de vazamento; nunca versionados.
- **Deploy por PR aprovada**, com checagem de saúde (*smoke test*) depois do deploy e **plano de rollback** descrito.
- **Monitoramento de deploys em horas cheias, entre 08h e 00h**, com relatório objetivo: status, commit, URL, resultado do smoke test, erros observados.
- Ao trocar projeto/URL de homologação: atualizar README e workflows que dependem da URL, desconectar o Git do projeto antigo e só então mesclar.
- Migração em produção: só com autorização explícita, backup/ponto de restauração confirmado e janela combinada.

**Entregáveis:** workflows, checklist de release, relatório de deploy, procedimento de rollback.

**Nunca:** apontar preview para banco de produção; desligar teste do CI; fazer deploy manual em produção sem autorização.
