# Estoque+ — amostras fotográficas de 21/10/2026

## Origem e armazenamento

O usuário enviou **10 fotografias**: três de cupons NFC-e (uma com **duas notas distintas**) e sete de fechamento térmico. São **11 documentos**, não dez.

- **Originais (privados):** Biblioteca do usuário, pasta `/Estoque+/Testes OCR`.
- **Golden transcrito, anonimizado:** `tests/fixtures/user-thermal-golden-20261021.json`.
- **Testes automatizados de lógica:** `tests/user-thermal-golden.test.cjs`, incluídos em `npm test`.

As imagens originais **não estão neste repositório** e não devem ser copiadas para issue pública, logs, snapshots públicos ou CI sem anonimização que preserve a legibilidade e sem revisão. Elas contêm dados fiscais reais, chaves de acesso e QR Codes; parte dos fechamentos contém dados financeiros operacionais. Nenhum CPF/CNPJ/chave/QR, dado de consumidor ou nome comercial foi incluído no golden. Datas, códigos de item e valores permanecem para permitir comparação precisa; manter os fixtures no repositório privado.

## Cobertura

| Arquivo privado | Cenário principal | Verificação |
|---|---|---|
| fiscal-01-cia-da-fruta.jpeg | 1 item, 2 unidades, troco no rodapé | venda 17,98; troco 32,02 não é desconto |
| fiscal-02-rudi-tomate.jpeg | tomate por peso, 1 KG | total 14,37 |
| fiscal-03-duas-notas.jpeg | **2 NFC-e em uma fotografia** | dois documentos independentes: 49,48 e 45,05 |
| caixa-2025-11-26.jpeg | crédito/débito, outros, movimentações | total 1.083,00; POS 721,00 |
| caixa-2025-11-25.jpeg | sangria, suprimento, físico | total 906,00; POS 744,00 |
| caixa-2025-11-14.jpeg | seis movimentos, débito avulso | total 1.157,00; POS 710,00 |
| caixa-2025-11-11.jpeg | seis modalidades, quatro movimentos | total 1.163,00; POS 820,00 |
| caixa-2025-11-08.jpeg | quatro modalidades, três movimentos | total 663,00; POS 472,00 |
| caixa-2025-11-04.jpeg | seis modalidades, cinco movimentos | total 1.144,00; POS 813,00 |
| caixa-2025-10-08.jpeg | divergência real no caixa físico | total 1.011,00; POS 494,00; diferença +3,20 |

### Critérios adicionais ainda manuais

1. Executar OCR **sobre cada fotografia original** (sem copiar bytes reais ao repositório), guardar saída transiente, comparar com valores transcritos e registrar falsos positivos, ausências e tempos.
2. Na foto com duas notas, comprovar separação por região/documento e ausência de duplicação entre fornecedores; nunca lançar produtos automaticamente.
3. Na nota com desconto de linha, manter subtotal 51,50, desconto 2,02 e líquido 49,48, sem aplicar desconto em duplicidade.
4. No comprovante com troco, distinguir preço (17,98), valor entregue (50,00), troco (32,02) e pagamento efetivo.
5. Preservar unidade `ML` impressa para manjericão, sem converter silenciosamente; requer conferência humana.
6. Comparar faturamento NFC-e e POS, sem somar novamente os números repetidos no quadro **Caixa Digital**.
7. Preservar diferença de +3,20 em caixa físico em 08/10/2025. Não classificar automaticamente como fechamento reconciliado.
8. Imagens térmicas têm sombras, dobraduras, baixa nitidez, texto lateral cortado e tipografias diferentes. OCR real precisa de testes por imagem além do golden de parser.

### Limitação

**Golden textual ≠ teste ponta-a-ponta de OCR da imagem**. A suíte automática testa resultados esperados sobre transcrição normalizada e ajuda a identificar regressões de parser. A comparação de OCR em pixels depende de um executor com acesso autorizado aos originais privados e não deve usar a rede para consultar notas fiscais reais sem autorização explícita.
