# Auditoria npm e lockfile — Estoque+ (21/10/2026)

## Escopo e evidências

- Repositório: `lstkr/projeto-gpt`; base `main@3918136e0d28fa10b80a103b13f92051442b36f5`.
- Issue: [#44](https://github.com/lstkr/projeto-gpt/issues/44).
- CI de referência: [Build check 39623486019](https://github.com/lstkr/projeto-gpt/actions/runs/39623486019).
- Lockfile e classificação: [GitHub Actions 39637773044](https://github.com/lstkr/projeto-gpt/actions/runs/39637773044). Ambiente Node.js 22, npm 10, `npm install --package-lock-only --ignore-scripts --no-audit`, `npm ci --ignore-scripts --no-audit`, `npm audit --json`. O job terminou **success**.
- O lockfile v3 foi gerado pela resolução real do registro npm e versionado na branch de correção. Não foi gerado manualmente.
- A execução inicial do `npm audit` retornou **6 pacotes afetados: 1 critical, 4 high, 1 moderate**. Esses totais representam pacotes, não seis CVEs distintas: um único pacote pode ter vários advisories e dependências ascendentes também aparecem no resumo.

## Pacotes afetados (resoluções auditadas)

| Dependência | Versão instalada | Severidade npm | Direta? | Cadeia / advisory relevante |
| --- | --- | --- | --- | --- |
| `tar` | 6.2.1 | critical | não | `pdfjs-dist → canvas → @mapbox/node-pre-gyp → tar`; exemplos: [GHSA-23hp-3jrh-7fpw](https://github.com/advisories/GHSA-23hp-3jrh-7fpw), [GHSA-34x7-hfp2-rc4v](https://github.com/advisories/GHSA-34x7-hfp2-rc4v) |
| `@mapbox/node-pre-gyp` | 1.0.11 | high | não | Vulnerabilidade herdada de `tar` |
| `canvas` | 2.11.2 | high | não | Vulnerabilidade herdada de `@mapbox/node-pre-gyp` |
| `pdfjs-dist` | 3.11.174 | high | sim | [GHSA-wgrm-67xf-hhpq](https://github.com/advisories/GHSA-wgrm-67xf-hhpq): execução de JS em PDF malicioso; e cadeia `canvas` |
| `postcss` | 8.4.31 | high | não | `next → postcss`; [GHSA-6g55-p6wh-862q](https://github.com/advisories/GHSA-6g55-p6wh-862q), [GHSA-fxqj-rqcc-2cmp](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp), [GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849), [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93) |
| `next` | 15.5.28 | moderate | sim | Vulnerabilidade herdada de `postcss` no relatório npm |

**Interpretação:** `npm audit` classifica versões de dependências; não comprova que uma vulnerabilidade seja alcançável ou explorável na aplicação. `canvas` gera avisos de módulo indisponível nos testes de PDF do Linux, mas sua árvore vulnerável consta no lockfile e não deve ser ignorada. CSS do app é estático e `postcss` aparece no pipeline de build, mas a exposição precisa ser revisada pelo Back-end e DevOps.

## Mitigações existentes e mudanças recomendadas

1. O código atual de `pages/index.js` e `lib/server/cash-pdf.mjs` passa `isEvalSupported: false` ao PDF.js. Isso reduz o risco do advisory de execução de JS, **mas não substitui atualizar a biblioteca**, nem cobre outras falhas de parser/DoS.
2. O `npm audit` aponta `pdfjs-dist@6.4.299` e `next@16.4.2` como caminhos de correção com **mudança de major**. **Não** executar `npm audit fix --force`: PDF.js v3 usa imports legados e worker em `public/vendor`, e Next.js altera contrato de runtime/build.
3. Abrir tarefa separada para migrar PDF.js: validar leitura PDF servidor/navegador, arquivos com/sem texto, PDF malicioso controlado, worker publicado, OCR fallback e proteção contra falha. Verificar também o fechamento de caixa autenticado.
4. Abrir tarefa separada para atualizar Next.js/PostCSS: revisar compatibilidade de Next 16, Node 22, SSR/Pages Router, APIs, bibliotecas e CSS; executar build, testes e smoke E2E.
5. Registrar a auditoria como débito conhecido **sem esconder/falsificar seu resultado**. Após correções, tornar `npm audit --audit-level=high` um gate obrigatório. Avaliar `--omit=dev` só quando cabível; os pacotes afetados atuais constam em `dependencies`, não apenas em `devDependencies`.
6. Esta rodada apenas adiciona lockfile e muda instalações do CI para `npm ci`. **Não altera** versões `package.json`, o banco, sessões, senhas, API ou produção.

## Critério de aceite desta rodada

- `package-lock.json` rastreado no Git (npm lockfile v3).
- Jobs de build e regressão usam `npm ci` nas etapas de instalação, mantendo Node 22.
- `npm test`, teste de PDF, `npm run build`, teste da publicação do worker, SQL PG15/17 e previews devem passar na HEAD final do PR.
- Revisar alertas de npm sem forçar dependências incompatíveis.
- **Nenhum merge ou deploy de produção** feito como parte desta auditoria. Aprovação e integração exigem checks finais no PR.

## Recuperação

Mudanças exclusivas no gerenciamento de dependências e CI: eventual reversão pela reversão do PR na `main`. Não há migração de banco nem modificação de credenciais.
