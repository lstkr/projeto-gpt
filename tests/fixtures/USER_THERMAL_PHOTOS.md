# Corpus privado de fotografias

O manifesto `private-real-images-20261022.json` cataloga 13 fotografias e no mínimo 14 documentos. Os nomes públicos usam IDs neutros, sem nomes originais ou datas. O detentor do acervo deve renomear uma cópia privada conforme os hashes do manifesto antes de executar `node scripts/verify-private-image-fixtures.cjs /diretorio/privado`.

Nenhuma fotografia real integra o Git ou deve ser enviada a CI, issues, logs ou provedores externos. O verificador só confere tamanho, assinatura JPEG e hash; não executa OCR e não aprova anonimização.

O golden `user-thermal-golden-20261021.json` preserva transcrições previamente existentes de dez fotos e onze documentos. Ele não contém fornecedor, consumidor, chave fiscal ou QR, mas seus valores/datas derivados ainda exigem tratamento como corpus privado; renomear referências não transforma dados operacionais em dados sintéticos. Não usar este corpus em publicação pública sem sanitização adicional.

Os três documentos sem golden humano continuam pendentes. É necessário revisar campos em pixels, separar documentos lado a lado, preservar unidades impressas, distinguir troco de desconto, não duplicar totais digitais e manter divergências físicas para conferência humana.

O pacote recebido em 25/10/2026 foi recusado para versionamento. A revisão sanitizada está em `anonymized-package-review-20261025.json`. A aprovação do parser textual não equivale à aprovação do OCR.
