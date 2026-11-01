const MAX_UPLOAD_BYTES = 4_000_000;
const MAX_IMAGE_SIDE = 3200;
const JPEG_QUALITIES = [0.92, 0.85, 0.75];

function isImage(file) {
  return file.type.startsWith('image/') || /\.(png|jpe?g|webp|heic|heif)$/i.test(file.name);
}

function encodeJpeg(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) :
      reject(new Error('Não foi possível reduzir a foto. Tente exportá-la como JPEG.')),
    'image/jpeg', quality);
  });
}

async function fitUpload(canvas) {
  for (const quality of JPEG_QUALITIES) {
    const blob = await encodeJpeg(canvas, quality);
    if (blob.type === 'image/jpeg' && blob.size <= MAX_UPLOAD_BYTES) return blob;
  }
  throw new Error('A foto continua acima de 4 MB. Recorte o documento e tente novamente.');
}

/** Reduz apenas a cópia de arquivamento; o OCR continua usando o arquivo original.
 * A conversão e a limpeza ficam juntas (até 50 linhas) para liberar recursos em qualquer falha. */
export async function prepareReceiptImageUpload(file) {
  if (file.size <= MAX_UPLOAD_BYTES || !isImage(file)) return file;
  const image = new Image();
  const objectUrl = URL.createObjectURL(file);
  let canvas;
  try {
    image.src = objectUrl;
    await image.decode();
    const ratio = Math.min(1, MAX_IMAGE_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
    if (!(ratio > 0) || !image.naturalWidth || !image.naturalHeight) throw new Error('Imagem inválida.');
    canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Não foi possível preparar a foto neste navegador.');
    // Fundo branco evita escurecer documentos transparentes ao converter para JPEG.
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await fitUpload(canvas);
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', {type: blob.type});
  } catch {
    throw new Error('Não foi possível reduzir a foto para até 4 MB. Exporte como JPEG ou recorte o documento e tente novamente.');
  } finally {
    URL.revokeObjectURL(objectUrl);
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}
