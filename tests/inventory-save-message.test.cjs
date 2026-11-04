const {test} = require('node:test');
const assert = require('node:assert/strict');
const messages = import('../lib/inventory-save-message.mjs');

test('nota duplicada informa recusa do servidor e orienta recuperar o estoque salvo', async () => {
  const {inventorySaveMessage} = await messages;
  const message = inventorySaveMessage({code: '23505', message: 'Esta nota já foi lançada nesta unidade. internal fixture detail'});
  assert.match(message, /nota já foi lançada.*servidor recusou.*Atualize a página/);
  assert.doesNotMatch(message, /internal fixture detail/);
  assert.match(inventorySaveMessage({code: '23505', message: 'CNPJ repetido no diretório de fornecedores'}), /cadastro repetido/);
});

test('conflito e tempo limite nunca afirmam que o lançamento foi confirmado', async () => {
  const {inventorySaveMessage} = await messages;
  for (const code of ['PT409', '40001']) assert.match(inventorySaveMessage({code}), /outra aba.*não foram confirmadas/);
  assert.match(inventorySaveMessage({code: 'REQUEST_TIMEOUT'}), /não foi confirmado.*antes de tentar novamente/);
  assert.match(inventorySaveMessage(null), /Não foi possível salvar/);
});
