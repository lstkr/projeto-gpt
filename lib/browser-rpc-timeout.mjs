export const RPC_TIMEOUT_MS = 15_000;
export const RPC_TIMEOUT_CODE = 'REQUEST_TIMEOUT';

/** Limita a espera mesmo se o transporte ignorar o cancelamento; não repete gravações. */
export async function boundedRpc(client, name, parameters, timeoutMs = RPC_TIMEOUT_MS) {
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(Object.assign(new Error('O sistema demorou para responder. Seus campos foram mantidos. Tente novamente ou confira a versão salva.'),
        {code: RPC_TIMEOUT_CODE}));
      controller.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      Promise.resolve().then(() => client.rpc(name, parameters).abortSignal(controller.signal)), deadline
    ]);
  } catch (error) {
    return {data: null, error};
  } finally {
    clearTimeout(timer);
  }
}
