// Isolated Playwright print-layout regression for inventory counts (#100/#90).
// Uses synthetic records ONLY; requires Chromium, never accesses a real tenant.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const artifacts = path.join(__dirname, 'artifacts');
fs.mkdirSync(artifacts,{recursive:true});
const variants = [
  { paper:'a4', pixels:794, modes:['blind','differences'], label:'A4' },
  { paper:'thermal58', pixels:230, modes:['blind','differences'], label:'58 mm' },
  { paper:'thermal80', pixels:318, modes:['blind','differences'], label:'80 mm' }
];

function fixture(paper,mode) {
  const items=Array.from({length:34},(_,n)=>({
    sku:String(100000+n).padStart(8,'0'),
    name:n===0?'CAFÉ ESPECIAL TORRA MÉDIA MOÍDO PARA COADOR E ESPRESSO EMBALAGEM EXTRA LONGA E ETIQUETA DE RASTREABILIDADE':
      'Produto sintético '+String(n+1).padStart(2,'0')+' com embalagem longa',
    category:n%2?'Secos e embalagens':'Hortifruti e perecíveis',
    unit:n%2?'un':'kg',
    expected:n%2?2:1.25,
    counted:n%2?1:1.50,
    cost:9876543,
    unitPrice:9999999,
    stockValue:12345678
  }));
  return {paper,mode,establishment:'Unidade QA (sintética)',reference:'QA-'+paper,
    responsible:'Teste automatizado',items};
}

async function measure(page) {
 return page.evaluate(()=>{
   const table=document.querySelector('table');
   const cells=[...document.querySelectorAll('th,td')];
   const tolerance=2;
   const overflowing=cells.map((cell,index)=>{
     const rect=cell.getBoundingClientRect();
     return {
       index,
       scrollWidth:cell.scrollWidth,
       clientWidth:cell.clientWidth,
       visible:rect.width>0&&rect.height>0,
       // Text wider than a cell indicates an uncontrolled layout issue.
       // 'overflow-wrap:anywhere' must prevent these overflows.
       invalid:cell.scrollWidth>cell.clientWidth+tolerance
     };
   }).filter(cell=>cell.invalid||!cell.visible);
   const tr=[...document.querySelectorAll('tbody tr')].map(x=>x.getBoundingClientRect());
   const rowsOverlap=tr.some((r,index)=>index>0&&r.top<tr[index-1].bottom-1);
   const html=document.documentElement;
   return {
     pageOverflow:html.scrollWidth>window.innerWidth+tolerance,
     tableOverflow:table.scrollWidth>table.clientWidth+tolerance,
     cellProblems:overflowing.slice(0,12),
     rowsOverlap,rows:tr.length,
     tableWidth:Math.ceil(table.getBoundingClientRect().width),
     viewportWidth:window.innerWidth
   };
 });
}

(async()=>{
 const {countPrintHtml}=await import('../../lib/count-print.mjs');
 const launch={headless:true};
 if(process.env.ESTOQUE_CHROME_PATH)launch.executablePath=process.env.ESTOQUE_CHROME_PATH;
 const browser=await chromium.launch(launch);
 try{
   for(const v of variants)for(const mode of v.modes){
     const context=await browser.newContext({viewport:{width:v.pixels,height:950}});
     const page=await context.newPage();
     await page.emulateMedia({media:'print'});
     const html=countPrintHtml(fixture(v.paper,mode),new Date('2026-10-22T15:00:00Z'));
     assert.doesNotMatch(html,/>9876543<|>9999999<|>12345678</);
     if(mode==='blind'){
       assert.doesNotMatch(html,/>1,25<|>1,5<|>2</);
       assert.doesNotMatch(html,/<th>Estoque<\/th>|<th>Dif\.<\/th>/);
     }
     await page.setContent(html,{waitUntil:'load'});
     const screenshot='count-print-'+v.paper+'-'+mode+'.png';
     await page.screenshot({path:path.join(artifacts,screenshot),fullPage:true});
     const layout=await measure(page);
     assert.equal(layout.pageOverflow,false,v.label+' '+mode+' page exceeds printable width: '+JSON.stringify(layout));
     assert.equal(layout.tableOverflow,false,v.label+' '+mode+' table exceeds printable width: '+JSON.stringify(layout));
     assert.deepEqual(layout.cellProblems,[],v.label+' '+mode+' clipped table cells: '+JSON.stringify(layout));
     assert.equal(layout.rowsOverlap,false,v.label+' '+mode+' row collision');
     assert.equal(layout.rows,34,v.label+' '+mode+' missing rows');
     // CSS @page is exercised by Chromium's print engine, not just unit tests.
     const pdf=await page.pdf({preferCSSPageSize:true,printBackground:true});
     assert.equal(pdf.subarray(0,5).toString(),'%PDF-',v.label+' '+mode+' PDF invalid');
     assert.ok(pdf.length>1200,v.label+' '+mode+' PDF unexpectedly small');
     console.log('PASS print '+v.label+' '+mode+' / 34 lines / '+pdf.length+' PDF bytes');
     await context.close();
   }
   // Deliberate regression injection proves this guard detects clipped cells.
   const c=await browser.newContext({viewport:{width:230,height:700}});
   const p=await c.newPage();
   await p.setContent(countPrintHtml(fixture('thermal58','blind')));
   await p.evaluate(()=>{
     const cell=document.querySelector('tbody td:nth-child(2)');
     cell.style.whiteSpace='nowrap';
     cell.style.overflowWrap='normal';
     cell.style.wordBreak='normal';
     cell.style.overflow='hidden';
   });
   const broken=await measure(p);
   assert.ok(broken.cellProblems.length>0,'QA must reject deliberately clipped text');
   await c.close();
   console.log('PASS intentional clipping is detected by visual QA gate');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
