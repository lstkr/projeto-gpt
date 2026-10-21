const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {readFileSync}=require('node:fs');
// Uses the same generated public worker file that the browser loads.

async function main(){
  // Load the actual production API bundle: its worker must be bundled too.
  require('../.next/server/pages/api/cash-extract.js');
  assert.equal(typeof globalThis.pdfjsWorker?.WorkerMessageHandler?.setup,'function');
  const server=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'start','-p','3187'],{stdio:'inherit'});
  try{
    let response;
    const {version}=require('pdfjs-dist/package.json');
    for(let attempt=0;attempt<60;attempt++){
      try{response=await fetch('http://127.0.0.1:3187/vendor/pdf.worker-'+version+'.min.mjs');break;}
      catch(error){if(server.exitCode!==null)throw error;await new Promise(resolve=>setTimeout(resolve,500));}
    }
    assert.ok(response,'Next.js server did not start');
    assert.equal(response.status,200);
    assert.match(response.headers.get('content-type'),/javascript/);
    assert.equal(await response.text(),readFileSync(require.resolve('pdfjs-dist/legacy/build/pdf.worker.min.mjs'),'utf8'));
  }finally{server.kill();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
