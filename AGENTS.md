# AGENTS.md — Estoque+

1. Nunca comprometer estoque, segurança ou funcionalidades existentes. Não declarar
   testes, migrações ou deploy aprovados sem evidência real.
2. Usar `Agente: <nome>` e `Escopo desta entrega: <1 linha>` somente na mensagem final.
   Linguagem simples, respostas curtas, no máximo uma decisão com recomendação.
   Explicar termo técnico novo na primeira vez; avisar sobre risco ou erro mesmo que atrase.
3. Antes de editar, ler `docs/ESTADO.md`, os trechos relevantes do README, código,
   testes e perfil em `docs/agents/`. Conferir branch, SHA e alterações locais.
4. Trabalhar como agente único; chamar especialistas/revisão independente para
   banco, dinheiro/estoque/fiscal e login/permissões. Não aprovar a própria revisão.
5. Uma PR por objetivo, preferencialmente até 400 linhas; uma ativa, no máximo duas.
   Preservar contratos e arquivos do usuário; evitar refatoração ampla e dependências novas.
6. Stack: Next.js Pages Router, React/JavaScript; autenticação própria, não Supabase Auth;
   estoque JSONB com revisão/RPCs. Confirmar no código antes de mudar.
7. Autorizar operações no servidor/banco por sessão, papel e estabelecimento.
   Nunca expor nem commitar segredos. Não expor dados fiscais reais ou custos a quem não tem permissão.
8. Preservar usuários, hashes e logins. Nunca resetar ou apagar dados sem OK explícito.
   Nem fechar PRs ou apagar branches sem OK. Banco remoto conectado é somente leitura até autorização específica.
9. Estoque/fiscal: transações, revisão e idempotência; preservar histórico e IDs.
   Dinheiro/quantidade com precisão decimal; códigos fiscais como texto, incluindo zeros.
10. OCR/QR são assistivos: conferência humana antes do lançamento, sem mesclar produtos
    automaticamente. QR externo desativado por padrão; consulta fiscal limitada a 10 s.
11. Seguir CL-01–CL-16 em `docs/agents/diretrizes-completas.md`; ler só as CL da área
    afetada, nunca o arquivo inteiro. Consultar modelos/checklist conforme o risco.
    Não remover nem afrouxar checks.
12. Rodar testes relevantes durante o trabalho; suíte completa uma vez antes da PR,
    além do build quando aplicável. Banco exige validação em ambiente seguro.
    Esperar CI uma vez e conferir uma vez; sem consultas em loop.
13. Lucas autoriza merge sem novo OK somente com CI verde, sem conflitos e baixo risco,
    sem banco/migração, dinheiro/estoque/fiscal, login/permissões, exclusão ou produção.
    Nesses casos restritos, pedir OK explícito com risco, como desfazer e roteiro de teste.
14. Homologação: https://estoque-homologacao-ashy.vercel.app/; oferecer 3–5 passos
    de teste. Confirmar deploy e smoke com evidência após merge autorizado.
15. Ao fim do bloco, atualizar `docs/ESTADO.md` (máximo 40 linhas); relatar em 1–2 linhas
    o que mudou, por quê e limites da validação. Citar CL aplicáveis sem autoaprovação.

## Modo econômico
1. Uma mensagem final por entrega; sem progresso entre comandos, salvo instrução superior obrigatória.
2. Final com até 10 linhas: Feito / Arquivos / Testes (passou/falhou) / Pendente / Preciso de mim; português simples, termo novo explicado em uma linha.
3. Sem saídas, logs ou diffs no chat; só números e 1–3 linhas de erro; detalhes na PR, chat só com o link.
4. Ler só o necessário: buscar com rg, ler trechos e não reler material já consultado.
5. Na iteração, só testes afetados; suíte completa uma vez antes da entrega.
6. Uma rodada independente ao fim, corrigindo no mesmo ciclo; repetir somente por erro grave.
7. Raciocínio leve por padrão; elevar para banco/migração, autenticação/permissões, fiscal/SEFAZ ou concorrência.
8. Decidir itens pequenos e registrar suposição em uma linha; perguntar só se bloqueado, uma pergunta com recomendação.
9. Economia não reduz segurança, integridade fiscal/estoque, testes ou evidências: detalhes completos ficam na PR.
10. Nada fora do escopo; regras de autorização e revisão continuam válidas.
