/** Explica a recusa sem afirmar que um lançamento ainda não confirmado foi salvo. */
export function inventorySaveMessage(error) {
  if (error?.code === '23505' && /nota já foi lançada/i.test(error?.message || '')) {
    return 'Esta nota já foi lançada ou foi enviada duas vezes. O servidor recusou o lançamento. Atualize a página para recuperar o estoque salvo e confira as notas antes de tentar novamente.';
  }
  if (error?.code === '23505') return 'Há um cadastro repetido. Confira os dados antes de salvar novamente.';
  if (['PT409', '40001'].includes(error?.code) || error?.message?.includes('outra sessão')) {
    return 'O estoque mudou em outra aba. Atualize a página para ver a versão salva. Suas alterações ainda não foram confirmadas.';
  }
  if (error?.code === 'REQUEST_TIMEOUT') {
    return 'O sistema demorou para responder. O salvamento não foi confirmado. Confira a versão salva antes de tentar novamente.';
  }
  return 'Não foi possível salvar no estoque compartilhado. Confira sua sessão e a conexão.';
}
