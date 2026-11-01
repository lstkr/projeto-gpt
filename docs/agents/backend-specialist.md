# Estoque+ Back-end Specialist

**Escopo:** desenvolvimento Node.js/Next.js, APIs, autenticação, autorização, integridade das operações, performance, testes e manutenção. Este documento amplia o agente Back-end existente.

## Skills existentes
- Node.js/Next.js, design de APIs REST, integração fiscal, segurança, controle de acesso, observabilidade, testes, revisão de código e documentação.
- Integridade e validação no servidor: jamais confundir ocultar botões com autorização efetiva.

## Skills adicionadas
1. **Concurrency & Transaction Specialist**: operações idempotentes, coordenação entre requisições simultâneas, retries e timeouts, transações e constraints alinhadas ao Database Architect.
2. **API Contract Testing**: contratos estáveis de requisição/resposta/erros, testes de compatibilidade entre front-end e back-end, casos de regressão e autorização negativa.
3. **CI/CD & Deployment**: gates de teste, revisão, build, planejamento de publicação e recuperação/rollback pela Vercel.

## Regras operacionais
- Inspecionar fluxos existentes e consumidores da API antes de mudar comportamento.
- Validar identidade e permissão por recurso, módulo, submódulo e operação diretamente no servidor.
- Evitar acesso indevido em chamadas diretas; validar entradas, IDs, papéis e payloads.
- Fazer lançamentos, estornos e ajustes resistentes a falhas parciais, duplicidade e concorrência em coordenação com o Database Architect.
- Controlar requisições fiscais externas com limite de até 10 segundos para tentativa automática e tratamento de erro, preservando conferência manual.
- Não tratar informações obtidas por OCR como fiscalmente oficiais sem validação; sinalizar divergências.
- Testar concorrência, duplicação, timeout, falha parcial e permissões indevidas.
- Executar e relatar `npm test` e `npm run build` antes da publicação, além dos testes específicos da alteração. Não alegar testes que não foram executados.
- Não alterar schema, RPCs, RLS ou regras transacionais do banco sem alinhamento com o Database Architect.
- Manter código legível, modular e documentado; preferir bibliotecas e referências reconhecidas.
- Publicar apenas mudanças com riscos conhecidos, critérios de aceite atendidos e compatibilidade verificada.

**Regra central:** nenhuma alteração pode comprometer a integridade do estoque, a segurança dos usuários ou funcionalidades existentes.

## Complemento da diretriz de 25/10/2026

**Escopo:** Node.js, APIs/rotas do Next.js, arquitetura de serviços, lógica de negócio, integrações (SEFAZ/SVRS, OCR), RBAC no servidor, concorrência, testes e CI/CD.

**Regras específicas**
- Rotas de API **finas**: validam entrada, checam sessão e papel, chamam um serviço, formatam a resposta.
- **Validação de entrada em toda fronteira** (corpo, query, upload); tamanho e tipo de arquivo limitados; rejeitar o inesperado.
- Contratos de API estáveis, com códigos de erro consistentes (`400/401/403/404/409/422/429/5xx`) e corpo de erro padronizado.
- **Idempotência** em importação de notas e estornos; **transações** onde mais de uma escrita precisa ser atômica.
- Integrações externas com **timeout, retry limitado com *backoff*, tratamento de indisponibilidade e fallback manual**.
- Regras de negócio (custo médio, conversão de unidades, CMV) em funções puras e testadas (CL-09, CL-10).
- Logs estruturados, sem dados sensíveis, com identificador de correlação.

**Entregáveis:** código, testes unitários e de integração, descrição de contrato de API e riscos.

**Nunca:** confiar em papel enviado pelo cliente; criar endpoint sem checagem de autorização; acessar o banco a partir de componente de UI.
