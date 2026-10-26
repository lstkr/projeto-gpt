import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { getSupabaseConfig } from '../lib/supabase-config.mjs';

const JWT_SEGMENTS = 3;
const JWT_PAYLOAD_INDEX = 1;
const UNSAFE_PUBLIC_KEY = 'SUPABASE_PUBLIC_KEY_UNSAFE';

/** Produz erro de configuração sem incluir chave ou payload. */
function unsafePublicKeyError() {
  const error = new Error('Chave Supabase inadequada para publicação: use somente uma chave pública publishable/anon.');
  error.code = UNSAFE_PUBLIC_KEY;
  return error;
}

/** Impede publicar segredo ou JWT privilegiado; a assinatura não é verificada. */
export function validatePublicPreviewKey(publicKey) {
  const candidate = publicKey.trim();
  if (candidate.startsWith('sb_secret_')) throw unsafePublicKeyError();
  const segments = candidate.split('.');
  if (segments.length !== JWT_SEGMENTS) return;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(segments[JWT_PAYLOAD_INDEX], 'base64url').toString('utf8'));
  } catch {
    throw unsafePublicKeyError();
  }
  if (payload?.role === 'service_role') throw unsafePublicKeyError();
}

/** Gera a prévia somente depois de validar os campos públicos do ambiente. */
export async function prepareStaticPreview() {
  const config = getSupabaseConfig();
  validatePublicPreviewKey(config.publicKey);
  await mkdir('_pages', { recursive: true });
  await copyFile('docs/index.html', '_pages/index.html');
  await writeFile('_pages/supabase-runtime-config.mjs',
    'export const supabaseConfig = ' + JSON.stringify(config) + ';\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await prepareStaticPreview();
}
