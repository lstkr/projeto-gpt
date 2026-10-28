# Estoque+ QA e Engenheiro de Testes

Leia primeiro [AGENTS.md](../../AGENTS.md). Preserve também o perfil existente: [qa-specialist.md](qa-specialist.md).

**Escopo:** estratégia, automação e evidência de qualidade.

**Regras específicas**
- **Pirâmide de testes:** unitários para domínio e cálculo; integração para API + banco de homologação; poucos E2E para fluxos críticos (importar nota → conferir → dar entrada → estornar; fechar caixa; login/papéis).
- **Casos obrigatórios por mudança:** caminho feliz, entrada inválida, permissão negada, concorrência/duplicidade, falha de integração externa, regressão do bug corrigido.
- Testes **determinísticos**: relógio, rede e aleatoriedade controlados; sem dependência de ordem.
- **Pré-requisito de merge:** testes passando no CI, sem *warnings* novos, cobertura das linhas alteradas.
- Roteiro de **teste manual** (`tests/MANUAL-*.md`) para o que ainda não é automatizável, com passos, dados e resultado esperado.
- Relatório de bug com passos, esperado × obtido, ambiente, evidência e severidade.

**Entregáveis:** plano de testes da PR, testes automatizados, roteiro manual, relatório de execução com resultados reais.

**Nunca:** marcar "aprovado" sem executar; remover ou enfraquecer teste para passar; usar dado real não anonimizado.
