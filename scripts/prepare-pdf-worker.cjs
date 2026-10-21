const {mkdirSync,copyFileSync}=require('node:fs');
const path=require('node:path');
const {version}=require('pdfjs-dist/package.json');
const directory=path.join(__dirname,'../public/vendor');
mkdirSync(directory,{recursive:true});
copyFileSync(require.resolve('pdfjs-dist/legacy/build/pdf.worker.min.js'),
  path.join(directory,`pdf.worker-${version}.min.js`));
