# Pedidos dos previews: conferência em 04/11/2026

Fonte: 17 anotações recuperadas do chat "Atualize estado e fila do OCR", as duas
anotações atuais e os pedidos posteriores deste chat. Código inspecionado na main
61f6acb e branch #199. Issue fechada não comprova implementação nem teste humano.
"Nesta atualização" exige CI e aceite no novo preview; não significa merge.

| Nº antigo | Pedido | Situação conferida e destino |
|---|---|---|
| 1 | Corrigir nome OCR do produto | Parcial: #198 limpa tabela, mas a palavra truncada relatada continua pendente; não criar substituição fiscal automática. #104. |
| 2 | Interpretar certo sem botão adicional | #198 aplica parser também em novo OCR; Reinterpretar atende rascunhos antigos e substitui edições só com confirmação. Melhor leitura real ainda pendente. |
| 3 | Original ao lado da conferência | Incorporado em #197; presente na #199 e visível no anexo atual. |
| 4 | Conferente automático pelo sistema | UI usa conta conectada (#197/#199); autoria obrigatória pelo servidor ainda não comprovada. #128/#131 fechadas sem merge; #119 fechada não é prova. |
| 5 | Ocultar arquivo no resumo, manter nos detalhes | Ainda pendente; resumo atual mostra fileName. Fila UI desta auditoria na #199. |
| 6 | Totais abaixo dos itens nos detalhes | Ainda pendente; código os apresenta antes. Fila UI #199. |
| 7 | Gestor alterar NF lançada | Não implementado; exige estorno/ajuste transacional auditável e decisão fiscal. Não é simples edição visual. |
| 8 | Chave/metadados juntos e persistidos | Parcial: chave/UF/série/número visíveis; agrupamento e persistência completa não comprovados. Não confundir com #195 (validação local). |
| 9 | Remover identificação duplicada; status e consulta | Nesta atualização #199: mantém campo canônico, status QR separado da validade fiscal e consulta/proveniência no mesmo bloco. |
| 10 | Mês/Ano não deslocar | #199, testes de reserva dos controles; aceite visual anterior parcial entre navegadores. |
| 11 | Importação de caixa existente só avisar | Ainda pendente: código abre formulário e agrega aviso de duplicidade. Etapa Faturamento. |
| 12 | Upload de faturamento somente no topo | Ainda pendente: dois botões presentes. Etapa Faturamento; #124 fechada sem adoção de #138. |
| 13 | Média e última compra; previsto só agregado | Ainda pendente: média e referência são mostradas; não há última compra na estrutura retornada de compras. Exige regra/teste, não renomear média como última. |
| 14 | Periodicidade com padrão visual dos campos | Parcial: regras genéricas existem, seletor antigo sem classe field; reteste específico ainda necessário. |
| 15 | Substituir quantidade total por dias sem contagem | Quantidade total já removida; indicador específico de dias sem contagem ainda não localizado. |
| 16 | Outro gráfico | #197 substituiu o modelo; nesta atualização #199 filtra dias vazios e mantém zero explicitamente registrado. Aceite visual pendente. |
| 17 | Duplo clique abre seletor de mês/ano | Não há handler explícito; depende do controle/navegador. Pendente com fallback acessível. |

## Pedidos novos e ordem de execução
- Enter como Tab e lista contínua: #199 a5ca276, 22 checks verdes; novo aceite de Lucas pendente.
- Gráficos: nesta atualização #199 inclui dia da semana nos extremos, botão voltar ao ano e só dias registrados no mês. Ano mantém 12 meses; ausência não vira venda zero.
- Faturamentos múltiplos e fila persistida: #123/#124 fechadas, porém #134/#138 não mescladas e main sem cash_report_*; funcionalidade ainda ausente.
- Revisão de faturamento pelo autor/Gestor/Gerente, nunca por colega: depende da hierarquia e autorização server-side da #201; filtro visual é insuficiente.
- Hierarquia Gestor → Gerente → Funcionário, padrão na criação, delegação e auditoria: #201 é só documentação; ainda não implementada.
- Unidades/custos: #151 mesclada oferece associação/fatores explícitos, mas não autoriza inferir embalagens ou unificar produtos. Sugestão por embalagem, origem fiscal, precisão e revisão humana ainda precisam de implementação/testes.
- Consulta pública DANFE, fornecedor com ruído, número vazio e leitura truncada: pendências da #198/#104; não corrigidas por QR compacto nem por gráficos.
- Dicionário de unidades, soma/desconto, duas notas locais por foto e sugestão de pacote: fila de OCR permanece pendente; não marcada concluída por associação/conversão existente.

## Limites e próximos gates
As fases são: terminar UI/gráficos → Faturamento/permissões → Unidades/Custos.
Sem aplicar migração, reset, dado real, segredo, merge ou novo papel nesta auditoria.
Manter até três PRs ativas (#198/#199/#201); concluir/validar uma antes de abrir outra.
Revalidar cada pendência no código e com Lucas; esta tabela não encerra issues automaticamente.
