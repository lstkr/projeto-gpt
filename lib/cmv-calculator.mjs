/**
 * CMV (custo das mercadorias vendidas): abertura + compras líquidas - encerramento.
 * Pure finance kernel. Inputs MUST come from historical records for one
 * establishment and one comparable period, validated by the calling service.
 * No current-cost substitution, database access or inventory writes happen here.
 * All monetary inputs are integer CENTS to avoid floating point rounding.
 */

const required=['openingStockCents','netPurchasesCents','closingStockCents'];

function cents(value,label,{allowNegative=false}={}){
  if(!Number.isSafeInteger(value)||(value<0&&!allowNegative)){
    throw new RangeError(label+' precisa ser valor seguro em centavos inteiros'+
      (allowNegative?'':', não negativo'));
  }
  return value;
}

/**
 * @param {object} input - Pre-aggregated values for ONE unit & ONE period.
 * @returns {{status:string,cmvCents:number|null,cmvPercent:number|null,
 *            missing:string[],warnings:string[]}}
 */
export function calculateCmv(input={}){
  if(!input||typeof input!=='object'||Array.isArray(input))
    throw new TypeError('Informe os valores da operação CMV.');
  const missing=required.filter(key=>input[key]===null||input[key]===undefined);
  if(missing.length){
    return {status:'insufficient-data',cmvCents:null,cmvPercent:null,missing,warnings:[
      'Estoque inicial, compras líquidas e estoque final históricos são necessários.'
    ]};
  }
  const opening=cents(input.openingStockCents,'openingStockCents');
  const purchases=cents(input.netPurchasesCents,'netPurchasesCents',{allowNegative:true});
  const closing=cents(input.closingStockCents,'closingStockCents');
  const cmv=opening+purchases-closing;
  if(!Number.isSafeInteger(cmv))throw new RangeError('CMV excede precisão segura.');
  const revenueMissing=input.revenueCents==null;
  const revenue=revenueMissing?null:cents(input.revenueCents,'revenueCents');
  const warnings=[];
  if(cmv<0)warnings.push('CMV negativo: conferir devoluções, inventários e ajustes antes de divulgar percentual.');
  if(revenueMissing)warnings.push('Receita comparável indisponível: percentual não calculado.');
  else if(revenue===0)warnings.push('Receita zerada: percentual de CMV indefinido.');
  // Basis points = rounded(CMV * 10000 / receita). BigInt prevents overflow.
  const basisPoints=cmv>=0&&revenue>0
    ? (BigInt(cmv)*10000n+BigInt(revenue)/2n)/BigInt(revenue)
    : null;
  if(basisPoints!==null&&basisPoints>BigInt(Number.MAX_SAFE_INTEGER))
    throw new RangeError('Percentual CMV excede precisão segura.');
  return {
    status:cmv<0?'needs-review':(revenueMissing||revenue===0?'cmv-only':'calculated'),
    cmvCents:cmv,
    cmvPercent:basisPoints===null?null:Number(basisPoints)/100,
    missing:[],warnings
  };
}
