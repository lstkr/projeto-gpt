const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');

test('menu fecha ao clicar ou focar fora; interação interna mantém aberto e limpeza remove listeners', async () => {
  const {listenForMenuDismiss} = await import('../lib/dismiss-menu.mjs');
  const listeners = new Map();
  const ownerDocument = {
    addEventListener: (name, handler) => listeners.set(name, handler),
    removeEventListener: (name, handler) => { assert.equal(listeners.get(name), handler); listeners.delete(name); }
  };
  let closed=0, focused=0;
  const inside={};
  const element={ownerDocument, contains: target => target===inside,
    querySelector: () => ({focus: () => focused++})};
  const cleanup=listenForMenuDismiss(element, () => closed++);
  listeners.get('pointerdown')({target:inside});
  assert.equal(closed,0);
  listeners.get('pointerdown')({target:{}});
  listeners.get('focusin')({target:{}});
  listeners.get('keydown')({key:'Tab'});
  assert.equal(closed,2);
  listeners.get('keydown')({key:'Escape'});
  assert.equal(closed,3); assert.equal(focused,1);
  cleanup(); assert.equal(listeners.size,0);
});

test('rascunho antigo ou de outra conta exige nova confirmação e usa o nome da sessão', async () => {
  const {resetReceiptReviewer,receiptReviewerMatches} = await import('../lib/receipt-reviewer.mjs');
  const user={id:'session-person',display_name:'Equipe conectada'};
  const old={checkedBy:'Nome digitado',finalReviewed:true,items:[{code:'0001'}]};
  assert.equal(receiptReviewerMatches(old,user),false);
  const refreshed=resetReceiptReviewer(old,user);
  assert.equal(refreshed.checkedBy,'Equipe conectada');
  assert.equal(refreshed.finalReviewed,false);
  assert.equal(old.finalReviewed,true);
  assert.equal(refreshed.items,old.items);
  assert.equal(receiptReviewerMatches(refreshed,user),true);
  assert.equal(receiptReviewerMatches(refreshed,{...user,display_name:'Outra conta'}),false);
  assert.equal(resetReceiptReviewer(refreshed,user).finalReviewed,false);
  // Resposta canônica inventory_get não inclui id.
  assert.equal(receiptReviewerMatches(refreshed,{username:'equipe',display_name:user.display_name,role:'employee'}),true);
});

test('identidade ausente não é substituída por autoria genérica nem por nome no rascunho', async () => {
  const {receiptReviewerMatches,receiptReviewerName,resetReceiptReviewer} = await import('../lib/receipt-reviewer.mjs');
  for (const user of [null,{}, {id:'x'}, {display_name:'Nome'}, {id:'x',display_name:'   '}]) {
    assert.equal(receiptReviewerName(user),'');
    assert.equal(receiptReviewerMatches({checkedBy:'Nome'},user),false);
  }
  assert.equal(resetReceiptReviewer(null,null),null);
});

test('BI fica na navegação gerencial de Relatórios e detalhes acessam a correção existente', () => {
  const page=readFileSync('pages/index.js','utf8');
  const cash=page.slice(page.indexOf("{view === 'cash' && <>"),page.indexOf("{view === 'reports' && currentUser"));
  assert.doesNotMatch(cash, /GiroManagerInsights|panel cash-summary/);
  assert.match(page,/view === 'reports' && currentUser\?\.role === 'admin' && <>/);
  assert.match(page,/onClick=\{\(\)=>editCashClosing\(entry\)\}>Revisar caixa/);
  const edit=page.slice(page.indexOf('function editCashClosing(entry)'),page.indexOf('async function loadCashAudit'));
  assert.match(edit,/currentUser\?\.role !== 'admin'/);
  assert.match(edit,/setCashSelectedDay\(''\)/);
  assert.match(edit,/cashReviewed:false,correctionReason:''/);
  assert.match(page,/resetReceiptReviewer\(previous,currentUser\)/);
  assert.doesNotMatch(page,/placeholder="Nome do responsável pela conferência"|className="local-pill"/);
});

test('recarregar após conflito aplica revisão atual mesmo durante a trava de leitura e permite nova correção', async () => {
  const vm=require('node:vm');
  const {prepareCashClosing}=await import('../lib/cash-correction.mjs');
  const source=readFileSync('pages/index.js','utf8');
  const latest={id:'closing',day:'2026-11-02',register:'001',operator:'Equipe',revision:'2',cashCounted:'0',movements:[]};
  const context={currentUser:{role:'admin'},cashSavingRef:{current:false},cashEditId:'closing',
    cashConflict:true,accessCode:'ficticio',supabase:{},window:{confirm:()=>true},
    boundedRpc:async()=>({data:[latest]}),loadCashAudit:()=>{},
    setCashForm:value=>{context.form=value;},setCashConflict:value=>{context.cashConflict=value;},
    setCashSelectedDay:value=>{context.selectedDay=value;},setView:value=>{context.view=value;},
    setCashError:value=>{context.error=value;}};
  for(const name of ['setCashImportText','setCashImportWarnings','setCashEntryMode','setCashSaveTimedOut',
    'setCashEditId','setClosings','setCashDataStatus','setCashSaving'])context[name]=()=>{};
  context.editCashClosing=vm.runInNewContext('('+source.match(/^  function editCashClosing\(entry\)\{[\s\S]*?^  \}/m)[0]+')',context);
  const reload=vm.runInNewContext('('+source.match(/^  async function reloadCashCorrection\(\)\{[\s\S]*?^  \}/m)[0]+')',context);
  await reload();
  assert.equal(context.form.revision,'2'); assert.equal(context.form.cashReviewed,false);
  assert.equal(context.cashConflict,false); assert.equal(context.cashSavingRef.current,false);
  assert.equal(context.selectedDay,''); assert.equal(context.view,'cash');
  assert.equal(prepareCashClosing({...context.form,cashReviewed:true,correctionReason:'Recontagem'}).expectedRevision,'2');
});
