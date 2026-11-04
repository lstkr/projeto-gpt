const test=require('node:test');
const assert=require('node:assert/strict');
const mod=import('../lib/session-health.mjs');
test('valid native token does not close a working session',async()=>{
 const {sessionHealth}=await mod;
 assert.equal(sessionHealth({data:{valid:true,user:{id:'qa',role:'employee'}},error:null}),'valid');
});
test('revocation and expiry are both fatal (28000)',async()=>{
 const {sessionHealth}=await mod;
 assert.equal(sessionHealth({error:{code:'28000',message:'Sessão inválida'}}),'revoked');
 assert.equal(sessionHealth({error:{code:'28000',message:'invalid token'}}),'revoked');
 assert.equal(sessionHealth({error:{code:'PGRST999',message:'Sessão revogada'}}),'revoked');
 assert.equal(sessionHealth({data:{valid:false}}),'revoked');
});
test('temporary service failures must not be mistaken for a revoked account',async()=>{
 const {sessionHealth,SESSION_CHECK_INTERVAL_MS}=await mod;
 assert.equal(sessionHealth({error:{code:'PGRST502',message:'connection failed'}}),'unavailable');
 assert.equal(sessionHealth({error:{message:'Failed to fetch'}}),'unavailable');
 assert.ok(SESSION_CHECK_INTERVAL_MS>=750&&SESSION_CHECK_INTERVAL_MS<=1200,
   'heartbeat must leave time for RPC latency and UI navigation inside ~2.5 s');
});
