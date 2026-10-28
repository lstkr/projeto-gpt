const BOOTSTRAP_ERRORS = Object.freeze({
  invalidProject: 'Ref inválido. Informe o ref confirmado do projeto Estoque+ DB.',
  missingUrl: 'URL de conexão vazia. Cole a URL PostgreSQL copiada do projeto autorizado.',
  passwordPlaceholder: 'A URL ainda contém o marcador [YOUR-PASSWORD]. Substitua-o pela senha do banco.',
  invalidUrl: 'Formato de URL inválido. Use uma URL PostgreSQL copiada em Dashboard → Connect.',
  invalidProtocol: 'Protocolo inválido. A URL deve começar com postgres:// ou postgresql://.',
  missingPassword: 'A URL não contém a senha do banco. Copie novamente a conexão PostgreSQL.',
  invalidPasswordEncoding: 'A senha contém caracteres reservados sem codificação URL. Codifique-os antes de montar a URL.',
  transactionPort: 'A porta 6543 (pooler em modo transação) não é aceita. Use conexão direta ou Session pooler na porta 5432.',
  invalidPort: 'Porta não aceita. Use a conexão direta ou Session pooler na porta 5432.',
  invalidDatabase: 'O banco da URL deve ser postgres.',
  invalidDirectUser: 'O usuário da conexão direta deve ser postgres.',
  missingPoolerRef: 'O usuário da conexão não contém o ref esperado. No Session pooler, use postgres.<ref>.',
  projectMismatch: 'O host não corresponde ao ref confirmado. Copie a conexão do projeto autorizado.',
  passwordMismatch: 'A senha provisória do DBA e a confirmação não coincidem ou excedem o limite aceito.',
  protectedLogging: 'O banco não confirmou a proteção dos parâmetros nos logs. Peça ao DBA para revisar a configuração.',
  insufficientPrivilege: 'O usuário do banco não tem permissão para concluir o bootstrap. Confirme o usuário administrativo e as migrações.',
  missingMigration: 'A função de bootstrap não foi encontrada. Confirme que a migração de instalação limpa terminou.',
  alreadyBootstrapped: 'O bootstrap já foi realizado. Não tente criar outra conta DBA; peça ao responsável para revisar o acesso.',
  tlsFailure: 'A validação TLS falhou. Confira a data do computador, a rede e os certificados confiáveis do Node.js; não desative a validação.',
  authenticationFailure: 'O PostgreSQL recusou a autenticação. Confira a senha do banco e a codificação dos caracteres reservados.',
  networkFailure: 'Não foi possível alcançar o PostgreSQL. Confira a rede, o endereço escolhido no Dashboard e a disponibilidade do destino.',
  genericFailure: 'Bootstrap não concluído por uma falha não classificada. Confira o projeto, a conexão e as migrações sem compartilhar credenciais.'
});

const SESSION_POOLER_HOST = /^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/;
const DEFAULT_POSTGRES_PORT = '5432';
const TRANSACTION_POOLER_PORT = '6543';
const MIN_DBA_PASSWORD_BYTES = 6;
const MAX_DBA_PASSWORD_BYTES = 72;

function parsePostgresUrl(connectionString) {
  if (typeof connectionString !== 'string' || !connectionString.trim()) throw new BootstrapError('missingUrl');
  if (connectionString.includes('[YOUR-PASSWORD]')) throw new BootstrapError('passwordPlaceholder');
  try {
    const target = new URL(connectionString);
    if (!['postgres:', 'postgresql:'].includes(target.protocol)) throw new BootstrapError('invalidProtocol');
    if (target.hash) throw new BootstrapError('invalidPasswordEncoding');
    return target;
  } catch (failure) {
    if (failure instanceof BootstrapError) throw failure;
    const errorKey = hasUnencodedPasswordDelimiter(connectionString) ? 'invalidPasswordEncoding' : 'invalidUrl';
    throw new BootstrapError(errorKey);
  }
}

function hasUnencodedPasswordDelimiter(connectionString) {
  const authorityStart = connectionString.indexOf('://') + 3;
  const credentialEnd = connectionString.lastIndexOf('@');
  const passwordStart = connectionString.indexOf(':', authorityStart) + 1;
  if (authorityStart < 3 || credentialEnd < passwordStart) return false;
  return /[/?#]/.test(connectionString.slice(passwordStart, credentialEnd));
}

function decodeCredentials(target) {
  try {
    return { user: decodeURIComponent(target.username), password: decodeURIComponent(target.password) };
  } catch {
    throw new BootstrapError('invalidPasswordEncoding');
  }
}

function validateConnectionAddress(target, user, expectedProject) {
  const port = target.port || DEFAULT_POSTGRES_PORT;
  if (port === TRANSACTION_POOLER_PORT) throw new BootstrapError('transactionPort');
  if (port !== DEFAULT_POSTGRES_PORT) throw new BootstrapError('invalidPort');
  if (target.pathname !== '/postgres') throw new BootstrapError('invalidDatabase');

  if (target.hostname === `db.${expectedProject}.supabase.co`) {
    if (user !== 'postgres') throw new BootstrapError('invalidDirectUser');
  } else if (SESSION_POOLER_HOST.test(target.hostname)) {
    if (user !== `postgres.${expectedProject}`) throw new BootstrapError('missingPoolerRef');
  } else {
    throw new BootstrapError('projectMismatch');
  }
  return Number(port);
}

/**
 * Valida a conexão permitida para o bootstrap e retorna somente os campos usados pelo driver.
 * Mensagens são constantes para nunca revelar URL, senha ou host recebido.
 * @param {string} connectionString URL digitada localmente no prompt oculto.
 * @param {string} expectedProject Ref confirmado do projeto autorizado.
 * @returns {{host: string, port: number, database: string, user: string, password: string}}
 */
export function parseBootstrapConnection(connectionString, expectedProject) {
  validateProjectReference(expectedProject);
  const target = parsePostgresUrl(connectionString);
  const { user, password } = decodeCredentials(target);
  if (!password) throw new BootstrapError('missingPassword');
  const port = validateConnectionAddress(target, user, expectedProject);
  return { host: target.hostname, port, database: 'postgres', user, password };
}

/**
 * Rejects an unconfirmed or malformed project reference before asking for credentials.
 * @param {string} expectedProject Ref supplied as the bootstrap command argument.
 */
export function validateProjectReference(expectedProject) {
  if (!/^[a-z]{20}$/.test(expectedProject || '')) throw new BootstrapError('invalidProject');
}

/**
 * Confirms the new DBA password without including either input in the error.
 * @param {string} password Provisional password entered through hidden input.
 * @param {string} confirmation Repeated provisional password.
 */
export function validateDbaPassword(password, confirmation) {
  if (password !== confirmation || Buffer.byteLength(password) < MIN_DBA_PASSWORD_BYTES ||
      Buffer.byteLength(password) > MAX_DBA_PASSWORD_BYTES) {
    throw new BootstrapError('passwordMismatch');
  }
}

/**
 * Requires the PostgreSQL settings that keep statement parameters out of logs.
 * @param {{normal?: string, failure?: string, audit?: string} | undefined} settings Server settings returned by PostgreSQL.
 */
export function validateProtectedLogging(settings) {
  if (settings?.normal !== '0' || settings?.failure !== '0' || settings?.audit !== 'off') {
    throw new BootstrapError('protectedLogging');
  }
}

/**
 * Maps validation and driver failures to safe, actionable text without reading exception messages.
 * @param {unknown} failure Erro interno, que pode conter dados da conexão.
 * @returns {string} Mensagem segura para o terminal.
 */
export function bootstrapFailureMessage(failure) {
  if (failure instanceof BootstrapError) return failure.message;
  const code = failure && typeof failure === 'object' ? failure.code : undefined;
  if (code === 'PROTECTED_PARAMETER_LOGGING') return BOOTSTRAP_ERRORS.protectedLogging;
  if (code === '42501') return BOOTSTRAP_ERRORS.insufficientPrivilege;
  if (['42883', '3F000', '42P01'].includes(code)) return BOOTSTRAP_ERRORS.missingMigration;
  if (code === '23505') return BOOTSTRAP_ERRORS.alreadyBootstrapped;
  if (['28P01', '28000'].includes(code)) return BOOTSTRAP_ERRORS.authenticationFailure;
  if (['CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'SELF_SIGNED_CERT_IN_CHAIN', 'ERR_TLS_CERT_ALTNAME_INVALID'].includes(code)) {
    return BOOTSTRAP_ERRORS.tlsFailure;
  }
  if (['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET'].includes(code)) {
    return BOOTSTRAP_ERRORS.networkFailure;
  }
  return BOOTSTRAP_ERRORS.genericFailure;
}

/** Representa uma falha de validação sem incluir dados recebidos do usuário. */
export class BootstrapError extends Error {
  constructor(errorKey) {
    super(BOOTSTRAP_ERRORS[errorKey]);
    this.name = 'BootstrapError';
  }
}
