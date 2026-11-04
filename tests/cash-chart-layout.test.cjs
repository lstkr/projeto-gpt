const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const component=readFileSync('components/CashRevenueChart.js','utf8');
const page=readFileSync('pages/index.js','utf8');
const styles=readFileSync('styles/giro-review.css','utf8');
test('escala começa em zero e extremos são legíveis sem valores sobrepostos nas barras',()=>{
 assert.ok(component.includes('[series.ceiling,series.ceiling/2n,0n]'));
 assert.ok(component.includes("['Maior',series.max],['Menor',series.min]"));
 assert.doesNotMatch(component.slice(component.indexOf('className="giro-revenue-bars"')),/<(?:strong|b)>/);
 assert.ok(component.includes('className="cash-chart-inspector"'));
});
test('rolagem móvel mostra o último registro e mantém dica e limpeza de eventos',()=>{
 for(const text of ['series.lastKey','scrollLeft=Math.max',"media.addEventListener('change',position)","media.removeEventListener('change',position)",'Deslize para ver'])assert.ok(component.includes(text),text);
 assert.ok(styles.includes('.giro-chart-scroll { overflow-x:auto'));
});
test('teclado e mouse inspecionam; ano abre mês e mês abre detalhe diário',()=>{
 for(const text of ['onFocus={()=>setHighlight(item.key)}','onMouseEnter={()=>setHighlight(item.key)}','onClick={()=>onSelect(item.key)}','disabled={!item.recorded}'])assert.ok(component.includes(text),text);
 assert.ok(page.includes("if(cashChartScope==='year'){setCashMonth(key);setCashChartScope('month');}else setCashSelectedDay(key)"));
});
