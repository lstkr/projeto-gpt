# Estoque+ — proteção de main (#52)

22/10/2026: repositório privado, main.protected=false.
API GitHub rulesets: 403 (Upgrade to GitHub Pro or make this repository public).
API de branch protection via integração ChatGPT: 403 (sem privilégio administrativo).
Jamais tornar o repositório público para contornar o plano.

## Controles presentes
- Build/SQL/Security Red Team no GitHub Actions e audit de proveniência após push.
- O audit de proveniência DETECTA push direto depois do fato; Vercel pode publicar antes.
- Este PR torna únicos os check-run names de PG 15/17 das três suítes.
- Configuração de 13 checks consolidada em lib/branch-protection-policy.cjs.

## Ação que falta ao administrador
1. GitHub pessoal: habilitar GitHub Pro; ou organização GitHub Team/Enterprise.
2. Com GitHub CLI autenticado (gh auth login) na máquina do proprietário:
   node scripts/admin/protect-main.cjs                  (simulação)
   node scripts/admin/protect-main.cjs --apply          (ativa proteção)
   node scripts/admin/protect-main.cjs --apply --reviews=1
   (somente com revisor humano independente; proprietário não aprova sua PR).
3. Alternativa: GitHub > Settings > Branches > Add classic branch protection rule
   > main, Require PR, Require status checks, strict/up-to-date, admins,
   disable force push/delete, require conversation resolution, linear history.
4. Confirmar: gh api repos/lstkr/projeto-gpt/branches/main --jq .protected
   deve retornar true; testar PR pendente com merge realmente bloqueado.
5. Somente depois fechar #52. Se GitHub retornar 403, manter Issue bloqueada.

IMPORTANTE: integrar PR e obter checks recentes com nomes novos antes de aplicar.
Nenhum segredo de conta deve ser colocado no repositório ou em issues.
