# Comparação local — 02/11/2026
Base main: 7766b1c. Candidato: codex/ocr-limpeza-item2, diff local sem commit.

| Teste originalmente falhando | Classificação | Resultado após ambiente |
|---|---|---|
| iniciador Windows/bootstrap | Antiga main: dependência do lockfile admin não instalada | Passou |
| perfil UI/UX | Antiga main: checkout CRLF | Passou |
| design-system-architect | Antiga main: checkout CRLF | Passou |
| visual-regression-testing | Antiga main: checkout CRLF | Passou |
| accessibility-specialist | Antiga main: checkout CRLF | Passou |
| ux-research-usability-testing | Antiga main: checkout CRLF | Passou |
| sessão expirada/revogada | Ambiente: valores fictícios ausentes; reproduzida main | Passou |
| sessão ativa | Ambiente: valores fictícios ausentes; reproduzida main | Passou |
| RPC ausente/erro banco | Ambiente: valores fictícios ausentes; reproduzida main | Passou |
| rate limit permitido | Ambiente: valores fictícios ausentes; reproduzida main | Passou |
| rate limit negado/429 | Ambiente: valores fictícios ausentes; reproduzida main | Passou |
| sessão anônima/401 | Ambiente: valores fictícios ausentes; reproduzida main | Passou |
| token não declara privilégios | Ambiente: valores fictícios ausentes; reproduzida main | Passou |

Nenhuma falha exclusiva ou causada pelo item 2 na comparação.

## Execução
- npm ci na raiz e scripts/admin, ambos checkouts: exit 0; lockfiles/manifests idênticos.
- main sem valores fictícios: 269/282, 13 falhas (ambiente-main-sem-config.log).
- main com valores fictícios antes do reparo LF/admin: 276/282, 6 falhas (ambiente-main-ci.log).
- item 2 equivalente: 280/286, mesmas 6 falhas (ambiente-item2-ci.log).
- main após ambiente: 282/282 (ambiente-main-final.log).
- item 2 após redesenho: 288/288 (ambiente-item2-final.log).
- npm run build: exit 0 (ambiente-build-final.log), VERCEL=1, VERCEL_ENV=preview, URL e preview https://ci-placeholder.supabase.co e chave ci-placeholder-public-key.
- Sem arquivos .env nos checkouts; nenhum segredo ou banco real usado.
- Cinco arquivos LF repostos via git show HEAD:arquivo; git diff --quiet nessas paths: exit 0. Nada disso deve entrar na PR fiscal.
- git diff --exit-code para os quatro manifests/lockfiles: exit 0.
- npm inicialmente falhou no sandbox; npm ci com acesso autorizado ao registro teve sucesso. Primeira suíte disparada durante instalação incompleta não foi usada para comparar.
- Não executado: OCR real, teste visual, CI remoto, PR, merge ou deploy.
- Avisos: Node 22.11 vs requisito pdfjs-dist >=22.13; avisos CSS legados no build.

Logs em main-ambiente/ e ocr-item2/, relativos a este relatório. CL-13: suíte integral sem afrouxar/pular/apagar testes existentes; teste novo do filtro rejeitado foi reescrito para o requisito humano autorizado. CL-15/16: sem refatoração de ambiente no diff fiscal, sem credenciais reais.
