'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {isMergedPrForBranch, verify} = require('../scripts/check-main-provenance.cjs');
const sha = 'a'.repeat(40);
const valid = [{merged_at:'2026-10-21T00:00:00Z',base:{ref:'main'}}];
const sample = {repo:'lstkr/projeto-gpt',sha,token:'CI_TOKEN_FIXTURE'};
function fakeHttp(body, status = 200) {
  return async () => ({ok:status===200,status,json:async()=>body});
}
test('accept merged pull request targeting main',()=>assert.equal(isMergedPrForBranch(valid),true));
test('reject open PR, wrong branch and commits with no PR',()=>{
  assert.equal(isMergedPrForBranch([]),false);
  assert.equal(isMergedPrForBranch([{merged_at:null,base:{ref:'main'}}]),false);
  assert.equal(isMergedPrForBranch([{merged_at:'now',base:{ref:'develop'}}]),false);
});
test('API validates original PR association',async()=>await verify({...sample,fetchImpl:fakeHttp(valid)}));
test('direct commits fail closed',async()=>await assert.rejects(
  verify({...sample,fetchImpl:fakeHttp([])}),/lacks a merged PR/
));
test('provider failure cannot be mistaken for a clean push',async()=>await assert.rejects(
  verify({...sample,fetchImpl:fakeHttp([],403)}),/HTTP 403/
));
