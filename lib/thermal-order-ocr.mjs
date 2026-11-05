const ITEM_ROW=/^(\d{3,14})\s+(\d+(?:,\d{1,4})?)\s+(?:(UN|KG|CX|PCT)\s+)?(\d+(?:\.\d{3})*,\d{2,4})\s+(\d+(?:\.\d{3})*,\d{2})$/i;
const normalize=text=>String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
const fixed=text=>{const [whole,fraction='']=text.replaceAll('.','').split(',');return BigInt(whole)*10_000n+BigInt(fraction.padEnd(4,'0'));};

function itemFromRow(match,names) {
  const quantity=fixed(match[2]),price=fixed(match[4]),total=fixed(match[5]);
  // Arredondamento explícito à metade para cima ao confrontar o total impresso em centavos.
  const agrees=(quantity*price+500_000n)/1_000_000n===total/100n;
  return {code:match[1],name:names.join(' '),quantity:Number(quantity)/10_000,
    unit:(match[3]||'').toLowerCase(),unitPrice:Number(price)/10_000,lineTotal:Number(total)/10_000,
    unitInferred:!match[3],readingWarning:[!match[3]?'Unidade de venda ausente; confira a unidade, sem usar a embalagem como conversão.':'',
      !agrees?'Quantidade e preço divergem do total impresso; confira.':''].filter(Boolean).join(' ')};
}

/** Pedido sem valor fiscal possui descrição antes da linha de código/quantidade/preços. */
export function parseThermalOrder(text) {
  const source=normalize(text);
  if(!/SEM\s+VALOR\s+FISCAL/.test(source)||!/\bPEDIDO\b/.test(source)||/\bDANFE\b|\bNFC-?E\b/.test(source))return null;
  if((source.match(/\bPEDIDO\b/g)||[]).length!==1)return [];
  const lines=String(text).split(/\r?\n/).map(line=>line.replace(/\s+/g,' ').trim()).filter(Boolean);
  const header=lines.findIndex(line=>/^DESCRICAO\b/.test(normalize(line)));
  if(header<0)return [];
  const items=[];let names=[];
  for(const line of lines.slice(header+1)) {
    if(/^(?:SUB[ -]?TOTAL|TOTAL|QUANT.*PECAS|DINHEIRO|TROCO|FORMA DE PAGAMENTO)\b/.test(normalize(line)))break;
    const match=ITEM_ROW.exec(line);
    if(match) {if(names.length)items.push(itemFromRow(match,names));names=[];}
    else if(!/^[=_.-]+$/.test(line))names.push(line);
  }
  return items;
}
