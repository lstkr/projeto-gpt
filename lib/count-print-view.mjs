/**
 * Produce a minimal print-only view-model from an already-authorized,
 * single-tenant inventory response. Never copy cost, price or valuation.
 * A printed paper never changes inventory or completes a count.
 */
const safeText=v=>String(v??'');
const numberOrNull=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
export function buildCountSheet({products=[],latestCount=null,mode='blind',paper='a4',user=null,unitName=''}={}){
  if(!Array.isArray(products))throw new TypeError('Produtos inválidos.');
  if(!['blind','differences'].includes(mode))throw new RangeError('Modo inválido.');
  if(!['a4','thermal58','thermal80'].includes(paper))throw new RangeError('Papel inválido.');
  if(mode==='differences'&&user?.role!=='admin')
    throw new Error('Relatório de divergências disponível apenas para o gestor.');
  if(mode==='differences'&&(!Array.isArray(latestCount?.items)||!latestCount.items.length))
    throw new Error('Nenhuma conferência concluída para imprimir.');
  const byId=new Map(products.map(p=>[safeText(p.id),p]));
  const items=mode==='blind'?products.map(p=>({
    name:safeText(p.name),sku:safeText(p.sku),unit:safeText(p.unit||'un'),
    category:safeText(p.category)
  })):latestCount.items.map(entry=>{
    const p=byId.get(safeText(entry.productId));
    return {
      name:safeText(entry.name||p?.name||'Produto não identificado'),
      sku:safeText(p?.sku),
      unit:safeText(entry.unit||p?.unit||'un'),
      category:safeText(p?.category),
      expected:numberOrNull(entry.expected),
      counted:numberOrNull(entry.counted)
    };
  });
  return {
    paper,mode,
    establishment:safeText(unitName||'Unidade atual'),
    responsible:safeText(user?.display_name||'Responsável não informado'),
    reference:mode==='differences'?safeText(latestCount.id||'Última conferência'):'Folha auxiliar',
    items
  };
}
