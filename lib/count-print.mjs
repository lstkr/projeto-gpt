/**
 * Print-only rendering for stock count sheets.
 * No network, database, browser or inventory mutations here.
 * Input is a view model already filtered/authorized by the server/RPC.
 * Whitelist fields: never render cost, sale price or total valuation.
 */

const escaped = (v) => String(v ?? '').replace(/[&<>"']/g,
  (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const papers=Object.freeze({
  a4:{name:'A4',size:'A4 portrait',margin:'12mm',width:'auto'},
  thermal58:{name:'Térmica 58 mm',size:'58mm 297mm',margin:'2mm',width:'54mm'},
  thermal80:{name:'Térmica 80 mm',size:'80mm 297mm',margin:'3mm',width:'74mm'}
});
function textValue(v,limit=180){return escaped(String(v??'').slice(0,limit));}
function amount(value,unit){
  if(value===null||value===undefined||value==='')return '—';
  if(typeof value!=='number'||!Number.isFinite(value)||value<0)return 'Conferir';
  const normalized=String(unit??'').trim().toLowerCase();
  const digits=['un','und','unidade','pc'].includes(normalized)?0:
    ['g','gr'].includes(normalized)?0:3;
  const factor=10**digits;
  if(Math.abs(Math.round(value*factor)-value*factor)>1e-7)return 'Conferir';
  return new Intl.NumberFormat('pt-BR',{maximumFractionDigits:digits}).format(value);
}
function dateLabel(value){
  const date=value instanceof Date?value:new Date(value);
  if(!Number.isFinite(date.getTime()))throw new RangeError('Data de impressão inválida');
  return new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',
    day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(date);
}

/**
 * @param {object} sheet
 * @param {'blind'|'differences'} sheet.mode - blind MUST NOT reveal expected quantities.
 * @param {'a4'|'thermal58'|'thermal80'} sheet.paper
 * @param {Array} sheet.items - [{name, sku, category, unit, expected, counted}]
 */
export function countPrintHtml(sheet={},issuedAt=new Date()){
  if(!sheet||typeof sheet!=='object'||Array.isArray(sheet))throw new TypeError('Folha inválida');
  const paper=papers[sheet.paper||'a4'];
  if(!paper)throw new RangeError('Formato de impressão não suportado');
  const mode=sheet.mode||'blind';
  if(!['blind','differences'].includes(mode))throw new RangeError('Modo de impressão inválido');
  if(!Array.isArray(sheet.items)||sheet.items.length>2000)
    throw new RangeError('Lista de itens inválida ou excessiva');
  const rows=sheet.items.map((item,index)=>{
    const p=item||{};
    const unit=textValue(p.unit||'un',16);
    const name=textValue(p.name||'Produto não identificado',160);
    const code=textValue(p.sku||'',45);
    const category=textValue(p.category||'',70);
    const nameCell= '<b>'+name+'</b>'+(code?'<small>'+code+'</small>':'')+
      (category?'<small>'+category+'</small>':'');
    if(mode==='blind'){
      // Never read or emit expected, stock, cost, counted or variance in blind mode.
      return '<tr><td>'+String(index+1)+'</td><td>'+nameCell+'</td><td>'+unit+
        '</td><td class="count-slot" aria-label="Espaço para quantidade contada">_______</td></tr>';
    }
    const theoretical=amount(p.expected,p.unit);
    const counted=amount(p.counted,p.unit);
    const delta=(typeof p.counted==='number'&&typeof p.expected==='number'&&
       Number.isFinite(p.counted)&&Number.isFinite(p.expected)&&
       counted!=='Conferir'&&theoretical!=='Conferir')
      ? new Intl.NumberFormat('pt-BR',{maximumFractionDigits:3,signDisplay:'always'})
        .format(p.counted-p.expected)
      : '—';
    return '<tr><td>'+String(index+1)+'</td><td>'+nameCell+'</td><td>'+unit+
      '</td><td>'+theoretical+'</td><td>'+counted+'</td><td>'+delta+'</td></tr>';
  }).join('');
  const columns=mode==='blind'?'<th>Nº</th><th>Produto / código</th><th>Un.</th><th>Contado</th>':
    '<th>Nº</th><th>Produto / código</th><th>Un.</th><th>Estoque</th><th>Contado</th><th>Dif.</th>';
  const css='@page{size:'+paper.size+';margin:'+paper.margin+'}'+
    'body{font:12px Arial,sans-serif;color:#111;width:'+paper.width+';margin:0}'+
    'h1{font-size:18px;margin:0 0 6px}p{margin:4px 0;overflow-wrap:anywhere}'+
    'table{border-collapse:collapse;width:100%;table-layout:fixed}'+
    'th,td{border-bottom:1px solid #bbb;padding:5px 3px;text-align:left;overflow-wrap:anywhere;vertical-align:top}'+
    'thead{display:table-header-group}tr{break-inside:avoid}'+
    '.count-slot{min-width:48px}small{display:block;font-size:10px}footer{margin-top:12px}'+
    (sheet.paper?.startsWith('thermal')?
      'body{font-size:9px}h1{font-size:13px}th,td{padding:3px 1px;font-size:9px}small{font-size:8px}':'');
  const title=mode==='blind'?'Folha de contagem cega':'Relatório de conferência';
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'+
    '<meta name="viewport" content="width=device-width,initial-scale=1"><title>'+
    title+' — Estoque+</title><style>'+css+'</style></head><body><h1>'+title+'</h1>'+
    '<p>Unidade: '+textValue(sheet.establishment||'Não informada',120)+'</p>'+
    '<p>Referência: '+textValue(sheet.reference||'Não informada',80)+'</p>'+
    '<p>Responsável: '+textValue(sheet.responsible||'Não informado',100)+'</p>'+
    '<p>Emissão: '+dateLabel(issuedAt)+'</p><table><thead><tr>'+columns+
    '</tr></thead><tbody>'+rows+'</tbody></table><footer>'+
    '<p>Assinatura: ____________________________________</p>'+
    '<p>Documento auxiliar. Não altera saldos, notas ou histórico no Estoque+.</p>'+
    '</footer></body></html>';
}
