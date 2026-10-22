const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const root=join(__dirname,'..');
const view=readFileSync(join(root,'pages/index.js'),'utf8');
const styles=readFileSync(join(root,'styles/globals.css'),'utf8');
test('day detail has independent register cards and a responsive two-column payment grid',()=>{
 assert.match(view,/className="cash-day-summary"/);
 assert.match(view,/className="cash-day-register-card"/);
 assert.match(view,/className="cash-day-channels"/);
 assert.match(view,/CASH_CHANNELS\.map\(\(\[key,label\]\)=>/);
 assert.match(view,/className="cash-day-register-total"/);
 assert.doesNotMatch(view,/CASH_CHANNELS\.map\(\(\[key,label\]\)=>`\$\{label\}:/);
 assert.match(styles,/\.cash-day-channels\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(styles,/@media\(max-width:620px\)/);
});
