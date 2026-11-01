import { validateProtectedLogging } from './bootstrap-connection.mjs';

/** Verifica os valores efetivos sem tentar SET de parâmetros restritos pelo Supabase. */
export async function verifyBootstrapLogging(client) {
  const settings = await client.query("SELECT current_setting('log_parameter_max_length') AS normal, current_setting('log_parameter_max_length_on_error') AS failure, current_setting('pgaudit.log_parameter', true) AS audit");
  validateProtectedLogging(settings.rows[0]);
}
