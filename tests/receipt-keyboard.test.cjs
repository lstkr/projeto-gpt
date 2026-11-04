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

function field(type = 'text', options = {}) {
  return {tagName:'INPUT', type, tabIndex:0, readOnly:false,
    matches:selector => selector === ':disabled' && Boolean(options.disabled),
    getClientRects:() => options.hidden ? [] : [{}],
    focus() {this.focused = true;}, ...options};
}

test('Enter avança e Shift+Enter volta, pulando campos ocultos, bloqueados e ações', async () => {
  const {preventReceiptImplicitSubmit} = await keyboard;
  const first = field(), last = field('number');
  const skipped = [field('text',{disabled:true}),field('text',{hidden:true}),
    field('text',{readOnly:true}),field('text',{tabIndex:-1}),field('submit'),field('checkbox')];
  const panel = {querySelectorAll:() => [first,...skipped,last]};
  for (const control of [first,last]) control.closest = () => panel;
  const event = target => ({key:'Enter',target,preventDefault() {this.prevented=true;}});
  const forward = event(first);
  preventReceiptImplicitSubmit(forward);
  assert.equal(forward.prevented,true);
  assert.equal(last.focused,true);
  assert.ok(skipped.every(control => !control.focused));
  preventReceiptImplicitSubmit({...event(last),shiftKey:true});
  assert.equal(first.focused,true);
  last.focused=false;
  preventReceiptImplicitSubmit(event(last));
  assert.equal(last.focused,false,'último campo não aciona botão nem reinicia a nota');
});

test('composição de texto e atalhos não mudam o foco', async () => {
  const {preventReceiptImplicitSubmit} = await keyboard;
  const control = field('text',{closest:() => assert.fail('Não navegar')});
  preventReceiptImplicitSubmit({key:'Enter',target:control,isComposing:true,
    preventDefault() {assert.fail('Não interromper composição');}});
});
