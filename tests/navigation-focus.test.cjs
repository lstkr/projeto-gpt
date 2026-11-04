const test = require('node:test');
const assert = require('node:assert/strict');
const focusModule = import('../lib/navigation-focus.mjs');

function control({ visible = true, disabled = false, inert = false } = {}) {
  return {
    calls: [],
    getClientRects: () => visible ? [{}] : [],
    matches: () => disabled,
    closest: () => inert ? {} : null,
    focus(options) { this.calls.push(options); }
  };
}

function screen({ controls = [], dialog = false, inert = false, form = true } = {}) {
  const heading = control();
  const main = {
    closest: () => inert ? {} : null,
    querySelector: (selector) => selector === 'h1' ? heading :
      form ? { querySelectorAll: () => controls } : null
  };
  const documentRoot = {
    querySelector: (selector) => selector === 'main.main' ? main : dialog ? {} : null
  };
  return { documentRoot, heading };
}

test('abertura do formulário foca o primeiro campo disponível e permite rolar até ele', async () => {
  const hidden = control({ visible: false });
  const disabled = control({ disabled: true });
  const input = control();
  const { documentRoot, heading } = screen({ controls: [hidden, disabled, input] });
  (await focusModule).focusNavigationDestination(documentRoot);
  assert.deepEqual(input.calls, [{ preventScroll: false }]);
  assert.equal(hidden.calls.length + disabled.calls.length + heading.calls.length, 0);
});

test('navegação sem formulário foca título programaticamente, sem adicioná-lo ao Tab', async () => {
  const { documentRoot, heading } = screen({ form: false });
  (await focusModule).focusNavigationDestination(documentRoot);
  assert.equal(heading.tabIndex, -1);
  assert.equal(heading.calls.length, 1);
});

test('diálogo aberto ou fundo inerte preservam foco do fluxo modal existente', async () => {
  for (const options of [{ dialog: true }, { inert: true }]) {
    const input = control();
    const { documentRoot, heading } = screen({ ...options, controls: [input] });
    (await focusModule).focusNavigationDestination(documentRoot);
    assert.equal(input.calls.length + heading.calls.length, 0);
  }
});

test('formulário sem campos disponíveis usa título e renderização sem main é segura', async () => {
  const { documentRoot, heading } = screen({ controls: [control({ inert: true })] });
  const { focusNavigationDestination } = await focusModule;
  focusNavigationDestination(documentRoot);
  assert.equal(heading.calls.length, 1);
  assert.doesNotThrow(() => focusNavigationDestination({ querySelector: () => null }));
});
