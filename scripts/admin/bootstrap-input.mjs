import { BootstrapError } from './bootstrap-connection.mjs';

const MAX_INPUT_BYTES = 16_384;
const INPUT_FIELDS = ['connectionString', 'password', 'confirmation'];

/** Recebe as entradas do PowerShell pelo pipe, sem registrar conteúdo ou erros de JSON. */
export async function readProtectedInput(input) {
  const chunks = [];
  let receivedBytes = 0;
  for await (const chunk of input) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8');
    receivedBytes += bytes.length;
    if (receivedBytes > MAX_INPUT_BYTES) throw new BootstrapError('invalidProtectedInput');
    chunks.push(bytes);
  }
  try {
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!payload || INPUT_FIELDS.some((field) => typeof payload[field] !== 'string')) {
      throw new Error('Estrutura inválida');
    }
    return Object.fromEntries(INPUT_FIELDS.map((field) => [field, payload[field]]));
  } catch {
    throw new BootstrapError('invalidProtectedInput');
  }
}
