/** PDF sintético local, sem scripts, links, pessoas ou documentos fiscais reais. */
module.exports = function demoPdf() {
  const stream='BT /F1 16 Tf 35 510 Td (GIRO / EXEMPLO) Tj 0 -28 Td (SEM VALIDADE FISCAL) Tj /F1 12 Tf 0 -44 Td (Fornecedor ficticio) Tj 0 -24 Td (Nota 000143 - 02/11/2026) Tj 0 -40 Td (Leite integral - 12 L) Tj 0 -24 Td (Preco unitario: R$ 4,79) Tj 0 -36 Td (TOTAL: R$ 57,48) Tj ET';
  const objects=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 360 560] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let result='%PDF-1.4\n'; const offsets=[0];
  objects.forEach((value,index) => { offsets.push(Buffer.byteLength(result)); result+=`${index+1} 0 obj\n${value}\nendobj\n`; });
  const start=Buffer.byteLength(result);
  result+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(result);
};
