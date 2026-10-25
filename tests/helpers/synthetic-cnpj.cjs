'use strict';
// Deterministic test-only identifiers, generated without copying registry/source data.
// Valid check digits do not imply registration or ownership of an identifier.
function syntheticCnpj(seed=1){
  if(!Number.isInteger(seed)||seed<1||seed>9999) throw new RangeError('Synthetic CNPJ seed must be an integer from 1 to 9999.');
  let value='00000000'+String(seed).padStart(4,'0');
  for(const weights of [[5,4,3,2,9,8,7,6,5,4,3,2],[6,5,4,3,2,9,8,7,6,5,4,3,2]]){
    const remainder=[...value].reduce((sum,n,i)=>sum+Number(n)*weights[i],0)%11;
    value+=remainder<2?'0':String(11-remainder);
  }
  return value;
}
module.exports={syntheticCnpj};
