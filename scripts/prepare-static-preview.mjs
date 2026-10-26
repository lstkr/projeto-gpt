import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import { getSupabaseConfig } from '../lib/supabase-config.mjs';

// A prévia estática não possui process.env: publica somente os campos públicos validados.
const config = getSupabaseConfig();
await mkdir('_pages', { recursive: true });
await copyFile('docs/index.html', '_pages/index.html');
await writeFile('_pages/supabase-runtime-config.mjs',
  'export const supabaseConfig = ' + JSON.stringify(config) + ';\n');
