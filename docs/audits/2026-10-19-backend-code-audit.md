# Auditoria técnica do back-end — 19/10/2026

## Escopo e limites

Revisão estática do repositório `lstkr/projeto-gpt` (branch `main` em 19/10/2026), incluindo `lib/`, `pages/api/`, `pages/index.js`, SQL versionado e workflows. Não foram executados testes transacionais contra o banco de produção, testes de carga nem consulta fiscal real. **As recomendações de banco exigem validação do Estoque+ Database Architect antes de migrações.**

Critério de manutenção: extrair responsabilidades aos poucos, proteger as regras existentes com testes e separar operações fiscais/estoque das responsabilidades da interface. Comentários devem registrar **motivo, invariantes e efeitos colaterais**, não narrar a sintaxe.

## Achados prioritários

### P0 — Endpoints externos sem sessão

- `pages/api/qr-externo.js` aceita POST com imagem e repassa a terceiros sem autenticar uma sessão Estoque+.
- `pages/api/consulta-nfce.js` permite buscar HTML remoto da SVRS sem autenticação ou limitação explícita por usuário/IP. A lista restrita de hosts, os timeouts e o tamanho máximo de resposta já reduzem parte do risco, mas não substituem controles de acesso e tráfego.
- **Proposta:** extrair verificador server-side de sessão reutilizável, adicionar cabeçalho/credencial aos chamados do frontend e incluir testes 401/403/429, timeout e isolamento entre sessões. Implementação precisa de alinhamento com UI/UX e avaliação de impacto.

### P1 — Integridade de estoque centralizada em snapshots genéricos

- `db/schema.sql`, `private.inventory_save_impl`: valida revisão e usa `FOR UPDATE`, preserva documentos e movimentos anteriores e protege campos do catálogo para funcionários. Isso é positivo.
- Porém, a API permite substituir o estado JSONB completo; novas entradas e alterações de saldo não são modeladas como comandos de domínio com validação independente da relação *evento -> movimento -> saldo*. O arquivo grande `pages/index.js` conduz várias mutações em estado React e depende do autosave posterior.
- **Proposta (Database Architect + Back-end):** planejar operações específicas `register_receipt`, `adjust_stock`, `create_product`, etc., com transações idempotentes, auditoria de ator, controle de revisão por comando, invariantes de quantidade e estorno. Migrar sem trocar o armazenamento/contrato de uma vez. Não alterar diretamente o esquema nesta auditoria.

### P1 — RBAC granular ainda não representado

- `private.app_users` modela apenas `admin` e `employee`, sem política explícita por módulo e submódulo.
- **Proposta:** mapear a matriz de permissões, testar negações no servidor e só então publicar telas de configuração ao gestor. Controle visual não é autorização.

### P1 — Consentimento/documentação de QR externo

- `pages/index.js`, em `detectNfceQrCodes`, solicita fallback externo automaticamente.
- `pages/api/qr-externo.js` e `README.md` ainda descrevem envio condicionado a opt-in.
- **Proposta:** alinhar documentação, avisos de privacidade e comportamento da interface; definir política de transmissão de fotos antes de lançar mudanças.

## Manutenibilidade e redundância

### P2 — Página monolítica e testes acoplados ao JSX

- `pages/index.js`: ~2.971 linhas e ~218 KB no momento da leitura; mistura componentes, OCR, parser fiscal, rede, lógica de estoque e persistência.
- `tests/receipt-conference.test.cjs` usa recortes textuais do arquivo JSX e `vm.runInNewContext`; pequenas mudanças na localização de funções podem quebrar testes sem alterar comportamento.
- **Proposta incremental:** extrair primeiro funções puras de OCR e comparação fiscal para `lib/fiscal/`, mantê-las importáveis e adaptar os testes. Em seguida isolar hooks de upload/consulta fiscal; por último separar telas. Preservar assinaturas e snapshots de fixtures.

### P2 — Normalizações de unidades em vários lugares

- Unidades equivalentes são convertidas em `lib/duplicate-products.mjs`, `lib/purchasing.mjs`, `pages/index.js` e `db/schema.sql`, com tabelas de aliases próximas, mas não idênticas.
- **Proposta:** especificar conjunto canônico e regras **distintas** de exibição, comparação e conversão. Manter `kg` diferente de `g` sem conversão explícita; testes para `un/und/in`, `l/lt`, `kg/kgs`, `g/gr` e unidades desconhecidas. Só depois extrair helper comum junto ao Database Architect.

### P2 — Instalações não reproduzíveis e verificações repetidas

- `package.json`: Next/React/dependências com intervalos de versão e nenhum `package-lock.json` versionado encontrado.
- `.github/workflows/ci.yml` instala Node 20, usa `npm install` e chama `npm run build` (que já executa `npm test`).
- `.github/workflows/receipt-tests.yml` instala Node 22 e executa `npm test`, duplicando parte dos testes.
- **Proposta:** versionar lockfile, usar `npm ci`, padronizar Node 22, separar jobs de testes/build quando útil, adicionar lint e checagem de formato. Medir impacto antes de atualizar dependências.

### P2 — Documentação e observabilidade

- `pages/api/cash-extract.js` concentrava validação de sessão, limite de payload e parsing de PDF em uma implementação comprimida; nesta branch o mesmo comportamento foi reformatado e comentado.
- Não há evidência, nos arquivos revisados, de uma estratégia consistente de logs estruturados, correlação de requisições e testes de contrato para os três endpoints.
- **Proposta:** padronizar erros públicos (sem mensagens internas), observabilidade sem tokens/imagens fiscais em logs, limites por endpoint e testes de contrato. Evitar logs de dados sensíveis.

## Modificações de baixo risco incluídas nesta branch

1. `lib/duplicate-products.mjs`: substituído comparador duplicado por helper local; regra de priorização permanece `alta` antes de `revisar`, depois maior semelhança.
2. `tests/duplicate-products.test.cjs`: novo teste para garantir a mesma ordem nos dois métodos públicos de busca.
3. `pages/api/cash-extract.js`: somente legibilidade, constantes nomeadas e comentário sobre validação de sessão anterior ao processamento de PDF. Limites, autenticação, códigos HTTP e mensagens preservados.

## Critérios de aceite das próximas etapas

- `npm test` e `npm run build` devem passar; preferir também testes de endpoint com mocks e banco de homologação.
- Requisições anônimas aos endpoints protegidos devem receber 401 antes de qualquer consulta/decodificação; limite de taxa deve ser demonstrável.
- Usuário sem permissão deve receber 403, **independentemente do estado do frontend**.
- Cada entrada, saída, conferência e estorno deve ter teste de concorrência, idempotência e rastreabilidade.
- Casos de OCR com descontos, zeros à esquerda, linhas fiscais repetidas, unidades divergentes e valores oficiais não podem regredir.
- Mudanças de banco: migração versionada, revisão do Database Architect, plano de reversão e backup validado.
- Revisar PR e CI antes de qualquer merge; não publicar diretamente em produção a partir desta auditoria.
