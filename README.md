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

## Contagem física de estoque

No menu **Contagem de estoque**, Gestor e funcionários contam todos os produtos (inclusive zeros), conferem diferenças com o saldo atual e concluem a reconciliação. O sistema grava os ajustes e o histórico com data e responsável. O banco rejeita contagens com saldos obsoletos.

Somente o **Gestor** define a contagem obrigatória por intervalo de dias, dia da semana ou dia fixo do mês. O calendário só passa a valer depois de ser habilitado; as contas e senhas não são alteradas por esta funcionalidade.

## Auditoria de possíveis duplicatas

O catálogo é auditado sempre que é carregado ou alterado. Apenas o **Gestor** vê a página **Possíveis duplicatas** e o alerta no painel de estoque. A análise é informativa: os pares são exibidos para conferência e edição dos cadastros, sem fusão ou exclusão automática de saldos, IDs, entradas, histórico fiscal ou usuários.

- Zeros à esquerda em códigos numéricos são ignorados (`00123` = `123`), inclusive em sufixos numéricos com o **mesmo** prefixo (`ABC-00123` = `ABC-123`). Prefixos diferentes continuam distintos.
- Códigos de fornecedor são comparados apenas sob o mesmo CNPJ; códigos iguais entre fornecedores distintos não provam que o produto é idêntico.
- A descrição passa por normalização de acentos, pontuação e abreviações comuns, seguida por comparação de tokens e distância de edição. Erros pequenos de digitação em códigos só geram suspeita quando a descrição também é parecida.
- Embalagens com números diferentes e divergências de unidade exigem conferência, sem classificação de alta probabilidade.
- Ao cadastrar um produto, a interface apresenta candidatos semelhantes e solicita confirmação se o Gestor insistir em criar o registro. Durante o lançamento de NF-e/NFC-e, o pareamento considera códigos de fornecedor normalizados e alerta sobre descrições divergentes.
- **Nunca unir saldos manualmente sem revisar movimentos, notas e contagens**: IDs antigos são usados no estorno de documentos. Não existe operação de fusão automática nesta versão.

Cobertura automatizada: `npm test` (arquivo `tests/duplicate-products.test.cjs`).

## Consolidação de cadastros duplicados (Gestor)

A opção **Possíveis duplicatas** detecta também códigos numéricos equivalentes mesmo quando a descrição está corrompida pelo OCR. Ex.: `10987`/`0010987`, `397431`/`0397431` e `410160`/`0410160`. Códigos idênticos com nomes muito diferentes aparecem como **revisar**, nunca como equivalência confirmada.

A partir da tela de auditoria, o Gestor pode escolher **Consolidar cadastros**. É necessário selecionar qual produto permanecerá e confirmar que os dois registros representam fisicamente a mesma mercadoria. A função `inventory_merge_products` valida a sessão do Gestor, revisão do estoque, IDs e unidades em uma transação no Supabase. Ela preserva o cadastro escolhido, soma as quantidades, pondera o custo pela quantidade, conserva os códigos antigos e os códigos de fornecedor, seleciona o maior estoque mínimo e atualiza as referências de movimentações, itens e `stockEntries` das notas.

A operação mantém o histórico original de contagens físicas (fotografia do momento), grava a consolidação em `catalogMerges`, preserva os documentos e continua permitindo excluir/estornar notas utilizando os vínculos atualizados. **Ela não deduz se os estoques foram contados duas vezes**: confira o estoque real antes de confirmar. Produtos com unidades incompatíveis exigem conversão e correção prévia. Não há fusão automática nem exclusão direta de contas e senhas.

Na conferência fiscal, se um código já existe mas a descrição está muito diferente, o sistema exige vincular um produto existente ou marcar explicitamente que o cadastro é distinto; não cria mais outro registro silenciosamente por essa divergência.

**Implantação:** aplicar a nova definição SQL do arquivo `db/schema.sql` ao banco já existente (especificamente a atualização de `private.inventory_save_impl` e a criação de `public.inventory_merge_products`) antes de usar o botão de consolidação. Nunca execute um reset do banco, que apagaria o estoque e pode comprometer os vínculos.


## Conferência final, compras por categoria e histórico de fornecedores

- Na conferência de uma nota, **Quem conferiu** foi movido para o último quadro, ao lado de **Conferi todo o documento**, habilitado depois de revisar todas as linhas e os totais destacados. Alterações posteriores desmarcam a confirmação.
- A lista de compras fica agrupada por categoria com fornecedor habitual, estoque atual/mínimo, quantidade sugerida, preço médio pago em entradas anteriores (ponderado pelas quantidades), custo de referência e previsão de gasto por item, categoria e total. Quando ainda não há histórico, recorre ao custo cadastrado e identifica essa origem. Se faltar preço, a previsão é parcial, sem inventar valores.
- O campo **Fornecedor habitual** pode ser configurado pelo Gestor no cadastro, sugerindo nomes já encontrados nas notas. Sem escolha manual, aparece o fornecedor com maior frequência no histórico daquele produto.
- Nova aba **Fornecedores** reúne compras já realizadas por estabelecimento (CNPJ quando conhecido), com total gasto, notas e relação dos itens comprados.
- No upload de notas, os itens são cruzados com notas anteriores do mesmo fornecedor por descrição e código. Correspondências inequívocas com um produto cadastrado pré-selecionam o vínculo; conflitos ou OCR imperfeito são destacados e exigem decisão humana.
- Histórico e preços usam os documentos e `stockEntries` já registrados. Sem compras anteriores, não há preço médio calculável.
- **Reset de dados:** limpar estado do inventário e encerrar sessões, sem alterar **nenhum registro de `private.app_users`**, senha, login ou papel. O reset de produção exige operação separada, com incremento da revisão de estoque para impedir ressurreição de snapshots obsoletos.

Testes: `npm test` e `npm run build`.

## Relatórios de fechamento de caixa

A tela **Fechamento de caixa** permite registrar o relatório da maquininha/sistema de vendas sem confundir faturamento com movimentações de dinheiro. Campos de faturamento: Cartão crédito POS, Cartão débito POS, Crédito, Débito, Outras e Dinheiro (vendas). Cadastre sangrias e suprimentos individualmente com valor e motivo. O painel calcula faturamento, POS, entradas/saídas de numerário, saldo após movimentações e diferença opcional do numerário contado.

Uma tabela separada `public.cash_closings` preserva os fechamentos, sem alterar estoque, documentos fiscais, contas ou senhas. Os RPCs `cash_closings_list` e `cash_closing_save` exigem sessão de usuário válida; colaboradores podem incluir novos caixas, mas somente o **Gestor** pode substituir um fechamento existente. Evita duplicação do mesmo caixa/data.

A visualização gráfica mostra os faturamentos **diários** do mês escolhido, somando diferentes caixas do mesmo dia, e a visão mensal apresenta faturamento acumulado, quantidade de fechamentos e média por fechamento. Sem dados anteriores o gráfico começa vazio, sem valores fictícios.

**Importante:** o modelo corresponde às rubricas do PDF de 10/10/2026, mas não presume que suprimentos sejam vendas ou que a diferença do caixa digital do PDF represente uma perda financeira. O relatório original indica R$ 569,00 na seção NFC-e, R$ 151,00 em cartões POS e R$ 241,50 tanto em suprimentos quanto em sangrias. O saldo físico depende do momento em que o numerário foi contado.

**Migração necessária:** aplicar `db/cash-closing.sql` no projeto Supabase existente antes da publicação da interface. Nenhum reset de dados ou usuários é necessário.
