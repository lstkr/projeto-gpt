'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const manifest=require('./fixtures/private-real-images-20261022.json');
const golden=require('./fixtures/user-thermal-golden-20261021.json');
const fs=require('node:fs');

test('private real-image catalog has unique 13 photos and minimum 14 independent documents',()=>{
  assert.equal(manifest.photos,13);
  assert.equal(manifest.minimum_documents,14);
  assert.equal(manifest.fixtures.length,13);
  assert.equal(new Set(manifest.fixtures.map(x=>x.name)).size,13);
  assert.equal(manifest.fixtures.filter(x=>x.type==='cash_closing').length,7);
  assert.equal(manifest.fixtures.filter(x=>x.type==='fiscal_document').length,6);
  assert.equal(manifest.fixtures.reduce((n,x)=>n+x.documents,0),14);
  const multi=manifest.fixtures.filter(x=>x.documents===2);
  assert.equal(multi.length,1);
  assert.equal(multi[0].name,'fiscal-03-duas-notas.jpeg');
});

test('all 13 private photos have reviewed, anonymized textual goldens',()=>{
  const photos=new Set([...golden.cash,...golden.fiscal].map(x=>x.photo));
  assert.equal(photos.size,13);
  assert.equal(golden.documents,14);
  const mapped=manifest.fixtures.filter(x=>x.golden);
  assert.equal(mapped.length,13);
  assert.deepEqual(new Set(mapped.map(x=>x.name)),photos);
  assert.deepEqual(manifest.fixtures.filter(x=>!x.golden),[]);
});

test('each entry has immutable source fingerprint and safe private path',()=>{
  assert.equal(manifest.library_path,'/Estoque+/Testes OCR');
  assert.ok(!fs.existsSync('tests/fixtures/private-images'),'do not check in private photos');
  for(const item of manifest.fixtures){
    assert.match(item.name,/^[a-z0-9-]+\.jpeg$/);
    assert.match(item.sha256,/^[a-f0-9]{64}$/);
    assert.ok(item.bytes>100000);
    assert.ok(item.width>=800&&item.height>=1400);
    assert.ok(item.focus.length>3);
    assert.ok(item.documents>=1);
  }
});
