# Estoque+ — Mapa arquitetural enxuto

Registro operacional, a conferir com a branch sob análise antes de mudanças.

- Aplicação: Next.js 15 / React 19; interface concentrada em pages/index.js; rotas API em pages/api.
- OCR no cliente com Tesseract.js; consultas fiscais externas através de endpoints próprios; manter conferência humana obrigatória.
- Persistência: PostgreSQL/Supabase, RPCs e snapshots de estoque. Autenticação própria por sessão: **não presumir Supabase Auth**.
- Autorização: validação server-side e nas RPCs; ocultar botões não é autorização. Menor privilégio, auditoria e RLS.
- Dados fiscais: preservar códigos como strings e zeros à esquerda, unidade, totais/descontos oficiais, idempotência de notas, conferência por linha estável.
- Concorrência: transações, ordem de locks consistente, revisão explícita e falha atômica. O risco de corrida e bypass de ACL está registrado na issue #31.
- Dependências de rollout: PR #29 de RPC de sessão depende do PR #26 de API; validar ordem de instalação e reversão documentadas nesses PRs.

## Mudanças de contrato
Quem propõe o contrato documenta payload, erros, autorização, compatibilidade e rollback; Back-end e Database aprovam RPC/API; UI confirma apresentação 401/403/429/503; QA valida matriz de regressão.

## Fontes principais
README.md, package.json, db/schema.sql, db/pending-receipts.sql, pages/api, .github/workflows, issues #30–#32 e PRs #26/#29. Não duplicar conteúdo detalhado que já está nas issues.
