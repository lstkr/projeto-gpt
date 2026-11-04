/** Executa o bootstrap com reversão somente depois de abrir a transação. */
export async function runBootstrapTransaction({ client, operation, reportRollbackFailure }) {
  let transactionStarted = false;
  try {
    await client.connect();
    await client.query('BEGIN');
    transactionStarted = true;
    await operation(client);
    await client.query('COMMIT');
    transactionStarted = false;
  } catch (failure) {
    if (transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackFailure) {
        reportRollbackFailure(rollbackFailure);
      }
    }
    throw failure;
  }
}
