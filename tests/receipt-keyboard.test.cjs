const {test} = require('node:test');
const assert = require('node:assert/strict');
const keyboard = import('../lib/receipt-keyboard.mjs');

test('Enter em campos de texto e valores da nota impede envio implícito', async () => {
  const {preventReceiptImplicitSubmit} = await keyboard;
  for (const type of ['text', 'number', 'date', 'search']) {
    let prevented = false;
    preventReceiptImplicitSubmit({key: 'Enter', target: {tagName: 'INPUT', type}, preventDefault() {prevented = true;}});
    assert.equal(prevented, true, type);
  }
});

test('Tab e ativação deliberada de botões, links, seletores e checkboxes continuam nativos', async () => {
  const {preventReceiptImplicitSubmit} = await keyboard;
  for (const [key, tagName, type] of [['Tab','INPUT','text'], ['Enter','BUTTON','button'],
    ['Enter','A',''], ['Enter','SELECT','select-one'], [' ','INPUT','checkbox'], ['Enter','TEXTAREA','textarea']]) {
    preventReceiptImplicitSubmit({key, target: {tagName, type}, preventDefault() {assert.fail('Controle nativo bloqueado');}});
  }
});
