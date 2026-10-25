const MIME_SIGNATURES = {
  'application/pdf': (bytes) => bytes.length >= 5 &&
    bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d,
  'image/jpeg': (bytes) => bytes.length >= 3 &&
    bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  'image/png': (bytes) => bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a,
  'image/webp': (bytes) => bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
};

export function getPendingReceiptPreviewType(mime, bytes) {
  if (!(bytes instanceof Uint8Array) || !bytes.length) return null;
  const normalizedMime = String(mime || '').split(';', 1)[0].trim().toLowerCase();
  return MIME_SIGNATURES[normalizedMime]?.(bytes) ? normalizedMime : null;
}

export function safePendingReceiptFilename(name) {
  const safeName = String(name || 'original')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 180);
  return safeName || 'original';
}
