#!/usr/bin/env node
'use strict';
// Run ONLY after the owner upgrades private GitHub plan; default is dry-run.
const {spawnSync}=require('node:child_process');
const {CHECKS,payload}=require('../../lib/branch-protection-policy.cjs');
const args=process.argv.slice(2);
if(args.some(x=>x!=='--apply'&&!/^--reviews=[0-6]$/.test(x))){
 console.error('Usage: node scripts/admin/protect-main.cjs [--apply] [--reviews=0..6]');
 process.exit(2);
}
const reviews=Number((args.find(x=>x.startsWith('--reviews='))||'--reviews=0').split('=')[1]);
const policy=payload(reviews);
console.log('Estoque+ main: PR obrigatória, status checks únicos, proteção admin/force push/delete.');
console.log(CHECKS.map(x=>' - '+x).join('\n'));
console.log('Aprovações: '+reviews);
if(!args.includes('--apply')){
 console.log('Simulação: nada alterado. Use --apply após habilitar GitHub Pro/Team.');
 process.exit(0);
}
function gh(cmd,input){
 const r=spawnSync('gh',cmd,{input,encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:1048576});
 if(r.error)throw Error('GitHub CLI indisponível. Faça gh auth login.');
 if(r.status!==0)throw Error('GitHub recusou: '+String(r.stderr||'').slice(0,700));
 return String(r.stdout||'').trim();
}
const endpoint='repos/lstkr/projeto-gpt/branches/main';
try{
 gh(['api','--method','PUT',endpoint+'/protection','--input','-'],JSON.stringify(policy));
 if(gh(['api',endpoint,'--jq','.protected'])!=='true')throw Error('main ainda não consta protegida!');
 const p=JSON.parse(gh(['api',endpoint+'/protection']));
 if(p.enforce_admins?.enabled!==true)throw Error('Regra admins não confirmada');
 for(const name of CHECKS)if(!p.required_status_checks?.contexts?.includes(name))
   throw Error('Check obrigatório ausente: '+name);
 console.log('SUCESSO: main protegida e checks/admins verificados.');
}catch(err){
 console.error('BLOQUEADO: '+err.message);
 console.error('HTTP 403 em repositório privado requer GitHub Pro/Team e autenticação/admin.');
 process.exitCode=1;
}
