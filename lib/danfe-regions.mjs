const HEADER=/DADOS\s+D[OA]S?\s+PRODUTOS?\s*\/\s*SERVI[CÇ]OS?/;
const FOOTER=/DADOS\s+ADICIONAIS|INFORMA[CÇ][OÕ]ES\s+COMPLEMENTARES|RESERVADO\s+AO\s+FISCO/;
const REGION_PADDING=12;
const MIN_TABLE_HEIGHT=40;
const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();

/** Usa títulos reconhecidos e coordenadas da própria imagem; não presume posição por frações. */
export function danfeRegions({width,height,lines}) {
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return null;
  const headings=lines.filter(line=>HEADER.test(normalize(line.text)));
  if(headings.length!==1)return null;
  const heading=headings[0],y=heading.bbox?.y0;
  if(!Number.isFinite(y)||y<=REGION_PADDING||y>=height-MIN_TABLE_HEIGHT)return null;
  const footer=lines.find(line=>FOOTER.test(normalize(line.text))&&line.bbox?.y0>y);
  const top=Math.max(0,Math.floor(y)-REGION_PADDING);
  const bottom=Math.min(height,Math.ceil(footer?.bbox?.y0??height));
  if(bottom-top<MIN_TABLE_HEIGHT)return null;
  return {header:{left:0,top:0,width,height:Math.ceil(y)},
    products:{left:0,top,width,height:bottom-top}};
}

/** Texto de cabeçalho e produtos mantém a origem regional e a tabela delimitada. */
export function regionalDanfeText(header,products) {
  return String(header||'')+'\nDADOS DO PRODUTO / SERVICO\n'+String(products||'');
}
