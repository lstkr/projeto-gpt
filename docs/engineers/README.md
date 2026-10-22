# Perfis de engenheiros executores

A estrutura é CTO → Head Senior → Engineer executor → QA/Security → integração. Todos obedecem ao AGENTS.md e ao perfil de seu Head em docs/agents. Perfis não iniciam agentes de software por si só. Cada Engineer recebe uma Issue pequena e abre uma PR com testes, SHA e rollback. Ler governance/TEAM_DELIVERY_MODEL.md e governance/DELIVERY_BOARD.md.

- [Cash & Analytics Engineer](cash-analytics.md) → **Back-end Specialist**; Issue #97 (CMV motor), parent #85; não modificar banco nem gráficos.
- [Data Integrity Engineer](data-integrity.md) → **Database Architect**; Issue #98 (CMV histórico); aceite residual #70 e #62.
- [Identity & Access Engineer](identity-access.md) → **Database Architect**; Issue #102 (edição usuários RPC), parent #77.
- [Print & Documents Engineer](print-documents.md) → **UI/UX Specialist**; Issue #100 renderer, parent #36; UI de impressão fica em #101.
- [Product UI Engineer](product-ui.md) → **UI/UX Specialist**; Issues #99 CMV UI, #101 impressão UI, #103 editar usuário UI; #69 layouts restantes.
- [Fiscal OCR Engineer](fiscal-ocr.md) → **Back-end Specialist**; Issues #58 processamento paralelo, aceite residual #62 e #63.
- [OCR Validation Engineer](ocr-validation.md) → **QA Specialist**; Issue #104 e parent #94; campanha #50.
- [Browser Regression Engineer](browser-regression.md) → **QA Specialist**; Issues #50 e #90; validar #58 e #69.
- [AppSec Engineer](appsec.md) → **Security Specialist**; Auditar todas PRs que alterem sessão, custos, multiempresa, uploads e SQL.
- [CI/CD Engineer](cicd.md) → **CTO (co-head Back-end Specialist)**; Issues #52 e #54, automação de checks.
