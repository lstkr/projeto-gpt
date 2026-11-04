import { useEffect, useState } from 'react';
import { prepareReceiptOriginal } from '../lib/receipt-original.mjs';

/** Ignora respostas antigas e revoga arquivos ao trocar nota, unidade, sessão ou desmontar. */
export function useReceiptOriginal({receiptId,loadOriginal,retry}) {
  const [result,setResult] = useState(null);
  useEffect(() => {
    if (!receiptId) return;
    let active=true, objectUrl=null;
    setResult({receiptId,loader:loadOriginal,status:'loading'});
    Promise.resolve().then(() => loadOriginal(receiptId)).then(payload => {
      if (!active) return;
      const file = prepareReceiptOriginal(payload);
      objectUrl = URL.createObjectURL(new Blob([file.bytes],{type:file.mime}));
      setResult({receiptId,loader:loadOriginal,status:'ready',file:{...file,url:objectUrl}});
    }).catch(() => {
      if (active) setResult({receiptId,loader:loadOriginal,status:'error'});
    });
    return () => { active=false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  },[receiptId,loadOriginal,retry]);
  return result?.receiptId === receiptId && result?.loader === loadOriginal ? result : {status:'loading'};
}
