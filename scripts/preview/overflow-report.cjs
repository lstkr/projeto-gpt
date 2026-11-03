const fs=require('node:fs');

/** Relata excesso de largura medido no documento ou em qualquer contêiner. */
function overflowReport(rows) {
  const problems=[];
  for(const row of rows) {
    if(row.scrollWidth>row.innerWidth)problems.push(`- ${row.file}: documento ${row.scrollWidth} > ${row.innerWidth}.`);
    for(const item of row.containers||[]) {
      if(item.scrollWidth>item.clientWidth)problems.push(`- ${row.file}: .${item.className.replaceAll(' ','.')} — scrollWidth ${item.scrollWidth} > clientWidth ${item.clientWidth}.`);
    }
    for(const error of row.consoleErrors||[])problems.push(`- ${row.file}: console: ${error}`);
  }
  return '# Problemas medidos por contêiner\n'+(problems.join('\n')||'Nenhum problema medido.')+'\n';
}
module.exports={overflowReport};
if(require.main===module)fs.writeFileSync(process.argv[3],overflowReport(JSON.parse(fs.readFileSync(process.argv[2],'utf8'))));
