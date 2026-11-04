const MAX_ORIGINAL_BYTES = 4_000_000;
const MAX_ENCODED_LENGTH = 5_500_000;
const ALLOWED_MIMES = new Set(['application/pdf','image/jpeg','image/png','image/webp','application/xml','text/xml']);

function matchesSignature(bytes,mime) {
  const starts = values => values.every((value,index) => bytes[index] === value);
  if (mime === 'application/pdf') return starts([37,80,68,70,45]);
  if (mime === 'image/jpeg') return starts([255,216,255]);
  if (mime === 'image/png') return starts([137,80,78,71,13,10,26,10]);
  if (mime === 'image/webp') return starts([82,73,70,70]) && [87,69,66,80].every((value,index) => bytes[index+8] === value);
  return true; // XML é mostrado somente como texto escapado, nunca como documento executável.
}

/** Valida o arquivo já autorizado, sem interpretar HTML/SVG ou executar conteúdo fiscal. */
export function prepareReceiptOriginal({base64,mime,fileName}) {
  if (!ALLOWED_MIMES.has(mime) || typeof base64 !== 'string' || base64.length > MAX_ENCODED_LENGTH) {
    throw new Error('Não foi possível pré-visualizar este formato de arquivo.');
  }
  const encoded = base64.replace(/\s/g,'');
  if (!encoded || encoded.length%4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new Error('Arquivo original inválido.');
  const binary = atob(encoded);
  if (binary.length > MAX_ORIGINAL_BYTES) throw new Error('O original excede o limite de 4 MB.');
  const bytes = Uint8Array.from(binary,character => character.charCodeAt(0));
  if (!matchesSignature(bytes,mime)) throw new Error('O conteúdo do arquivo não corresponde ao formato informado.');
  const kind = mime.includes('xml') ? 'xml' : mime === 'application/pdf' ? 'pdf' : 'image';
  const text = kind === 'xml' ? new TextDecoder('utf-8',{fatal:true}).decode(bytes) : null;
  return {bytes,mime,kind,text,fileName:String(fileName || 'original').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,160)};
}
