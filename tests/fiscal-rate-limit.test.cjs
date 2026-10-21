const test = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../lib/server/fiscal-rate-limit.mjs');
const token = 'a'.repeat(64);
function makeResponse() {
  return {
    headers: {},statusCode:0,body:null,
    setHeader(k,v){this.headers[k]=v;return this;},
    status(code){this.statusCode=code;return this;},
    json(value){this.body=value;return this;}
  };
}
test('rate limit is allowed with valid RPC response',async()=>{
  const {enforceFiscalRateLimit}=await modulePromise;
  const res=makeResponse();
  let count=0;
  const factory=()=>({rpc:async(name,params)=>{
    count++;
    assert.equal(name,'inventory_external_rate_limit');
    assert.deepEqual(params,{p_session_token:token,p_endpoint:'qr'});
    return {data:{allowed:true,retry_after:0},error:null};
  }});
  assert.equal(await enforceFiscalRateLimit({headers:{'x-estoque-session':token}},res,'qr',{clientFactory:factory}),true);
  assert.equal(count,1);
  assert.equal(res.statusCode,0);
});
test('rate limit denies quota with HTTP 429 and Retry-After',async()=>{
  const {enforceFiscalRateLimit}=await modulePromise;
  const res=makeResponse();
  const factory=()=>({rpc:async()=>({data:{allowed:false,retry_after:31},error:null})});
  assert.equal(await enforceFiscalRateLimit({headers:{'x-estoque-session':token}},res,'nfce',{clientFactory:factory}),false);
  assert.equal(res.statusCode,429);
  assert.equal(res.headers['Retry-After'],'31');
});
test('invalid session, missing rpc and unknown endpoint fail closed',async()=>{
  const {enforceFiscalRateLimit}=await modulePromise;
  const dontConnect=()=>{throw Error('must not access database');};
  let res=makeResponse();
  assert.equal(await enforceFiscalRateLimit({headers:{}},res,'qr',{clientFactory:dontConnect}),false);
  assert.equal(res.statusCode,401);
  res=makeResponse();
  assert.equal(await enforceFiscalRateLimit({headers:{'x-estoque-session':token}},res,'invalid',{clientFactory:dontConnect}),false);
  assert.equal(res.statusCode,503);
  res=makeResponse();
  const factory=()=>({rpc:async()=>({data:null,error:{code:'PGRST202'}})});
  assert.equal(await enforceFiscalRateLimit({headers:{'x-estoque-session':token}},res,'qr',{clientFactory:factory}),false);
  assert.equal(res.statusCode,503);
});
test('anonymous session error returns 401 and does not expose tokens',async()=>{
  const {enforceFiscalRateLimit}=await modulePromise;
  const res=makeResponse();
  const factory=()=>({rpc:async()=>({data:null,error:{code:'28000'}})});
  assert.equal(await enforceFiscalRateLimit({headers:{'x-estoque-session':token}},res,'qr',{clientFactory:factory}),false);
  assert.equal(res.statusCode,401);
  assert.equal(JSON.stringify(res.body).includes(token),false);
});
