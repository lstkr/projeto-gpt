export function cashReportMimeFromBytes(value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value || []);
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) return 'application/pdf';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a].every((n,i)=>bytes[i]===n)) return 'image/png';
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
      && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  return null;
}

export function cashReportSafeDownloadName(value) {
  const name = String(value || 'faturamento');
  const leaf = name.split(/[\\/]/).pop() || 'faturamento';
  const safe = leaf
    .replace(/[\\/?:%*|"<>]/g, '_')
    .replace(/[\u0000-\u001f]/g, '_')
    .replace(/^\.+/, '_')
    .slice(0, 180);
  return safe || 'faturamento';
}

export function decodeCashReportBase64(value) {
  if (typeof value !== 'string' || !value || value.length > 5600000) throw new Error('Arquivo inválido.');
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i=0;i<binary.length;i++) bytes[i]=binary.charCodeAt(i);
  return bytes;
}

export function encodeCashReportBase64(value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value || []);
  let binary = '';
  for (let i=0;i<bytes.length;i+=8192) binary += String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(binary);
}

export function cashReportFileMatchesMime(mime, bytes) {
  return cashReportMimeFromBytes(bytes) === mime;
}
