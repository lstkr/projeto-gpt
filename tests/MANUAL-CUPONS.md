# Casos de teste manual: imagens públicas de cupons fiscais

Este conjunto de referências é destinado ao upload **manual** no Estoque+.
As fotografias pertencem aos respectivos sites e permanecem hospedadas nas fontes originais.
Não confunda resultados esperados descritos por páginas editoriais com uma validação fiscal da SEFAZ.

| ID | Fonte | Imagem | O que conferir |
|---|---|---|---|
| HORT-01 | [Mais Goiás](https://www.maisgoias.com.br/cidades/mais-de-260-ganhadores-da-nota-fiscal-goiana-ainda-nao-resgataram-r-300-mil-em-premios/) | [JPG](https://uploads.maisgoias.com.br/2025/07/c49eb793-nota-fiscal-goiana.jpg) | Bananas por KG, preço, reconhecimento de texto parcialmente oculto. Cupom ECF antigo: não esperar QR NFC-e válido. |
| MERC-02 | [SECOM Bahia](https://www.ba.gov.br/comunicacao/noticias/2025-10/375126/compras-ate-o-dia-31-concorrem-ao-sorteio-de-novembro-da-nota-premiada) | [JPEG](https://www.ba.gov.br/comunicacao/sites/site-comunicacao/files/2025-10/Foto_Matheus%20Lens_Ascom%20Sefaz-Ba%20%283%29_0.jpeg) | Itens de mercearia, total e QR. Não aplicar endpoint SVRS do RS a QR de BA. |
| MERC-03 | [Casa de Cultura São Luís](https://casadeculturasaoluis.org.br/colabore) | [JPG](https://yata-apix-7ce54ed7-a41d-4ca8-8b90-b6444ba82501.s3-object.locaweb.com.br/c6f5d07b18c740aa81e96084962103d4.jpg) | Dois comprovantes lado a lado; impedir fusão indevida, reconhecer mercadorias por peso. |
| SIM-04 | [Qive/Arquivei](https://arquivei.com.br/blog/entenda-o-que-e-a-nfce/) | [PNG](https://arquivei.com.br/storage/2016/03/nfce-exemplo-2.png) | Exemplo demonstrativo (não cupom autêntico). Código 25897 repetido: preservar três linhas de açúcar distintas. |
| LEG-05 | [Valor Econômico](https://valor.globo.com/legislacao/valor-juridico/post/2021/10/criacao-de-nota-brasileira-fiscal-tem-caminho-aberto-no-congresso.ghtml) | [JPG](https://s2-valor.glbimg.com/ICrqFovu1cCpyUMPRnJceKVIo40%3D/0x0%3A640x480/984x0/smart/filters%3Astrip_icc%28%29/i.s3.glbimg.com/v1/AUTH_63b422c2caee4269b8b34177e8876b93/internal_photos/bs/2019/3/n/T9Yn2pRR69ejgIxymAcA/cupom-fiscal.jpg) | Cupom ECF antigo com dados parciais e texto curvado: OCR pode ficar inconclusivo, não lançar automaticamente. |

## Procedimento

1. Abra o link de imagem, salve o arquivo e faça upload na tela **Notas fiscais**.
2. Confira quantidade de documentos detectados e número de linhas por documento.
3. Compare código, produto, unidade, quantidade, preço, desconto e total **com a própria imagem**.
4. Não confirme a entrada desses documentos de testes no estoque real.
5. Registre os erros por campo: ausente, duplicado, unidade incorreta, valor incorreto, total incorreto, classificação indevida.
6. Se a consulta à SEFAZ falhar ou atingir 10 segundos, a conferência manual deve continuar disponível.

**Nota de escopo:** os exemplos de imagem não foram baixados nem executados em OCR automatizado nesta rodada. Links externos podem mudar. Para um teste reprodutível de ponta a ponta, usar fotografias com permissão de reutilização armazenadas em fixtures privadas e dados esperados revisados.
