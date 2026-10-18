# Projeto GPT — Estoque da Cafeteria

Aplicação web para o estoque da cafeteria, com contas individuais, leitura assistida de cupons e notas e controle de reposição.

## Funcionalidades

- Consulta e alteração das quantidades em estoque.
- Cadastro de produtos, categorias, unidades e estoque mínimo.
- Histórico de entradas, saídas, notas e responsáveis pelas conferências.
- Exclusão de notas já lançadas **exclusiva do Gestor**, com confirmação, estorno de quantidades e remoção das movimentações da nota em uma única transação no Supabase.
- Importação de XML de NF-e.
- OCR de imagens executado em duas passagens, com melhoria de contraste e tentativa de separar cupons lado a lado.
- Leitura de QR Code NFC-e e extração de chave de acesso quando disponível; atalho à consulta pública oficial.
- Conferência manual obrigatória antes do lançamento.
- Área de administrador com valor do estoque, edição de custo e estoque mínimo.
- Lista de compras com sugestão de quantidade = estoque mínimo − estoque atual, exportável em CSV.

## Papéis de acesso

- `admin` (**Gestor** na interface): vê valores e custos, configura estoque mínimo, consulta/exporta lista de compras e pode excluir notas lançadas, estornando as entradas correspondentes.
- `employee`: consulta produtos, altera estoque e lança/conferе documentos, sem visualizar custo por produto e valor total do estoque.
- O banco impõe as restrições: para sessões de funcionários, o RPC de leitura remove o custo dos produtos e o RPC de gravação preserva custos e mínimos já cadastrados. Produtos novos criados por funcionários começam com mínimo e custo zerados, a serem preenchidos pelo dono.
- Sessões expiram em 12 horas; o login limita tentativas consecutivas. Senhas são guardadas com bcrypt e tokens de sessão como hashes.

## QR Code e consulta fiscal

O leitor tenta obter o conteúdo do QR Code com `jsqr` e o detector nativo do navegador; se não encontrar, também procura a chave de acesso no texto lido por OCR. Quando identifica uma chave, a tela apresenta um link de consulta pública da NFC-e.

A consulta pública oficial permite consultar pela chave e pelo QR Code. Isso não equivale a uma API pública gratuita para retornar os itens automaticamente. A API de consulta em massa da NF-e oferecida pelo Serpro exige contratação, credenciais da API e certificado e-CNPJ. Consulte as informações oficiais antes de habilitar uma integração contratada:
- [Consulta pública de NF-e/NFC-e no RS](https://www.fazenda.rs.gov.br/servicos-ao-cidadao/servicos?servico=2065)
- [API de consulta de dados de NF-e do Serpro](https://www.gov.br/pt-br/servicos/obter-solucao-digital-de-consulta-de-dados-de-nota-fiscal-eletronica-nfe)

O OCR/QR ainda é assistivo: confirme descrição, quantidade, unidade e preço com o documento original. Uma imagem com vários cupons pode exigir que cada um seja revisado individualmente. Nada é lançado automaticamente.

## Leitura de QR por API externa (opcional)

O leitor de fotos tenta primeiro `jsqr`, `@zxing/library` e as APIs nativas do navegador, incluindo recortes da região inferior do cupom e tentativas de rotação. Essa abordagem foi inspirada nas variantes do worker Python de [pcelias-ctrl/nfc-e](https://github.com/pcelias-ctrl/nfc-e).

Na área **Notas fiscais** há uma opção desmarcada por padrão: **Usar API externa para tentar ler QR Codes difíceis**. Com ela ativa, se nenhum leitor local obtiver uma URL fiscal completa, o navegador recorta o rodapé da nota e envia o recorte compactado ao endpoint interno `POST /api/qr-externo`; esse endpoint envia a imagem ao `POST /api/v1/qrcode/decode` do serviço descrito no repositório. Apenas os campos da URL de QR recebida são aproveitados; não há lançamento automático de itens.

A URL padrão é `https://nfc.kopilot.food/api/v1/qrcode/decode`, fornecida na documentação do repositório como exemplo de implantação. A disponibilidade desse serviço **não foi verificada em produção**. Quem preferir rodar o serviço por conta própria pode definir `NFCE_QR_DECODER_URL` no ambiente Next.js. Em falhas e timeouts, o OCR segue funcionando e a interface mostra o erro de QR externo.

**Limitação:** o endpoint `/api/v1/nfce/decode` de pcelias-ctrl suporta extração estruturada de itens somente para São Paulo (`NFCE_SP`), por isso **não é usado** para cupons do Rio Grande do Sul. O serviço externo apenas melhora a **decodificação do QR**; a consulta fiscal continua na integração separada com o portal SVRS. Essa integração também depende da resposta HTTP e do HTML da página oficial.

**Privacidade:** a imagem enviada ao serviço de terceiros contém apenas um recorte do rodapé do cupom (que pode incluir informações fiscais). A opção externa requer ativação explícita e não altera a leitura local quando estiver desmarcada.

## Banco de dados

O projeto usa Supabase. A linha JSONB em `public.shared_inventory` guarda o estado compartilhado. RLS bloqueia acesso direto à tabela; RPCs validam a sessão e aplicam regras por papel. As tabelas internas ficam em `private`.

O esquema canônico está em [db/schema.sql](db/schema.sql). As senhas reais de produção não devem ser adicionadas ao repositório.

O Supabase Security Advisor foi consultado após as mudanças de permissão e não retornou alertas.

## Exclusão de notas e limpeza dos dados de teste

- Para excluir uma nota já lançada, entre com o perfil **Gestor**, acesse **Notas fiscais → Histórico de documentos** e clique em **Excluir NF** (ou abra **Ver detalhes → Excluir NF e estornar estoque**).
- A operação exige confirmação e é executada exclusivamente pelo RPC `inventory_delete_document`. O banco verifica a permissão `admin`, o documento, o vínculo de cada item com o produto e o saldo disponível. A exclusão remove o documento e apenas as movimentações vinculadas à nota, além de subtrair exatamente as quantidades que ela adicionou.
- Se a quantidade disponível já tiver sido consumida, a operação é recusada para evitar estoque negativo. O Gestor precisa reconciliar o saldo antes de tentar novamente. O cadastro do produto é mantido, mesmo se seu estoque chegar a zero.
- Cada nova entrada armazena `documentId`, `productId`, `movementId` e `stockEntries` para permitir o estorno seguro. Documentos antigos sem esses vínculos **não são excluídos com um estorno especulativo**.
- O banco aplica revisão de estado e impede que um navegador desatualizado recrie notas apagadas ou sobrescreva dados de outra sessão.

**Regra permanente para resets:** limpar apenas o estado do estoque (`products`, `documents`, `movements`, controle de revisão e IDs excluídos) e encerrar sessões antigas. **Nunca apagar, recriar ou modificar `private.app_users`**, seus `password_hash`, nomes de login, papéis internos nem as credenciais cadastradas. Após um reset, é necessário fazer login novamente com **os mesmos usuários e senhas**.

## Aplicação Next.js

Requisitos: Node.js 20.9 ou superior.

```bash
npm install
npm run dev
```

As variáveis `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` podem ser definidas no ambiente. O projeto usa uma publishable key pública no cliente. Nunca incluir uma chave `service_role` ou secret key em código de frontend.

## Cuidados operacionais

- Verifique cada OCR antes de confirmar; OCR pode confundir números ou deixar itens de fora.
- Configure backups regulares do Supabase.
- Troque as credenciais iniciais por senhas fortes e exclusivas antes do uso diário.
