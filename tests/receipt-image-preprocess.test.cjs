const test=require('node:test');
const assert=require('node:assert/strict');

test('adaptive binarization preserves dark text under a brightness gradient',async()=>{
  const {adaptiveBinarizeImageData}=await import('../lib/receipt-image-preprocess.mjs');
  const width=128,height=64,data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*4;
    const background=Math.round(175+x*0.45);
    const isText=x>=48&&x<80&&y>=24&&y<40;
    const value=isText?65:background;
    data[i]=value;data[i+1]=value;data[i+2]=value;data[i+3]=255;
  }
  const output=adaptiveBinarizeImageData({width,height,data},{blockSize:8,windowRadius:2,thresholdOffset:12});
  const valueAt=(x,y)=>output.data[(y*width+x)*4];
  assert.equal(valueAt(60,30),0,'dark text should remain dark');
  assert.equal(valueAt(30,30),255,'bright paper on the darker side should remain white');
  assert.equal(valueAt(100,30),255,'bright paper on the lighter side should remain white');
});

test('adaptive binarization rejects invalid image data and unsafe settings',async()=>{
  const {adaptiveBinarizeImageData}=await import('../lib/receipt-image-preprocess.mjs');
  assert.throws(()=>adaptiveBinarizeImageData({width:0,height:1,data:new Uint8ClampedArray(0)}),TypeError);
  assert.throws(()=>adaptiveBinarizeImageData({width:1,height:1,data:new Uint8ClampedArray(4)},{blockSize:1}),RangeError);
});