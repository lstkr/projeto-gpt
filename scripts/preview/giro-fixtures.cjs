// API local de demonstração: somente dados fictícios; gravações são recusadas.
const http = require('node:http');
const demoPdf = require('./giro-demo-pdf.cjs');
const HOST='127.0.0.1', PORT=4175, PREVIEW_ORIGIN='http://127.0.0.1:4174';
const ADMIN_TOKEN='a'.repeat(64), EMPLOYEE_TOKEN='e'.repeat(64);
const products=[
  {id:'demo-p1',name:'Café em grãos',sku:'CAF-001',unit:'kg',category:'Cafés',stock:8.5,min:3,cost:42.90},
  {id:'demo-p2',name:'Leite integral',sku:'LAT-001',unit:'L',category:'Laticínios',stock:12,min:15,cost:4.79},
  {id:'demo-p3',name:'Chocolate 40%',sku:'CHO-040',unit:'kg',category:'Confeitaria',stock:3.2,min:2,cost:31.50},
  {id:'demo-p4',name:'Açúcar refinado',sku:'ACO-001',unit:'kg',category:'Mercearia',stock:6,min:4,cost:4.20},
  {id:'demo-p5',name:'Copos 300 ml',sku:'EMB-300',unit:'un',category:'Embalagens',stock:84,min:100,cost:0.18},
];
const sale=(id,day,values={}) => ({id,day,register:'001',operator:'Equipe fictícia',revision:'0',
  cartaoCredito:'100.00',cartaoDebito:'80.00',credito:'120.00',debito:'50.00',outras:'40.00',
  dinheiroVendas:'100.00',cashCounted:'95.00',movements:[],createdBy:{displayName:'Gestor fictício'},...values});
const closings=[sale('demo-c1','2026-11-01'),sale('demo-c2','2026-11-02',{cashCounted:'105.00'}),
  sale('demo-c3','2026-10-01'),sale('demo-c4','2026-10-02'),sale('demo-c5','2026-10-03')];
const documents=[{id:'demo-nf1',supplier:'Fornecedor fictício',fileName:'exemplo.xml',date:'2026-11-01',
  invoiceNumber:'000101',total:134.08,status:'Conferido',checkedBy:'Equipe fictícia',items:[{name:'Leite integral',quantity:12,unit:'L',unitPrice:4.79,lineTotal:57.48}]}];
const pending=[{id:'demo-pending',fileName:'exemplo-ficticio.xml',mime:'application/xml',revision:'0',draft:{
  fileName:'exemplo-ficticio.xml',supplier:'Fornecedor fictício',supplierCnpj:'',source:'XML de NF-e',invoiceNumber:'000142',date:'2026-11-02',
  subtotal:57.48,total:57.48,discount:0,checkedBy:'',items:[{lineId:'demo-line',name:'Leite integral',code:'LAT-001',productId:'demo-p2',quantity:12,unit:'L',unitPrice:4.79,lineTotal:57.48}]}}];
pending.push({...structuredClone(pending[0]),id:'demo-pending-pdf',fileName:'exemplo-ficticio.pdf',mime:'application/pdf',
  draft:{...structuredClone(pending[0].draft),fileName:'exemplo-ficticio.pdf',source:'PDF de exemplo',invoiceNumber:'000143'}});
const permissions=Object.fromEntries(['read','create','review','confirm','cancel'].map(operation => [`fiscal.pending.${operation}`,true]));
const original='<?xml version="1.0" encoding="UTF-8"?>\n<exemplo semValidadeFiscal="true">\n  <fornecedor>Fornecedor fictício</fornecedor>\n  <numero>000142</numero>\n  <produto codigo="LAT-001">Leite integral</produto>\n  <quantidade unidade="L">12</quantidade>\n  <precoUnitario>4.79</precoUnitario>\n  <total>57.48</total>\n</exemplo>';

function identity(args) {
  const employee=String(args.p_token || args.p_session_token || '')===EMPLOYEE_TOKEN;
  return {id:'11111111-1111-4111-8111-111111111111',role:employee?'employee':'admin',username:employee?'equipe.demo':'gestor.demo',display_name:'Conta fictícia · preview'};
}

function responseFor(name,args) {
  const user=identity(args);
  if (name==='inventory_login') return {ok:true,session_token:args.p_username==='equipe.demo'?EMPLOYEE_TOKEN:ADMIN_TOKEN};
  if (name==='inventory_tenants') return {user,tenants:[{id:'demo-unit',name:'Café Aurora · dados fictícios'}],activeTenantId:'demo-unit',mustChangePassword:false};
  if (name==='inventory_get') {
    const {id,...inventoryUser}=user;
    return {user:inventoryUser,revision:0,products:user.role==='admin'?products:products.map(({cost,...product})=>product),documents,movements:[],suppliers:[]};
  }
  if (name==='inventory_validate_session') return {valid:true,user};
  if (name==='inventory_permissions_list') return {self:{...permissions,'fiscal.pending.cancel':user.role==='admin'},users:[]};
  if (name==='cash_closings_list') return closings;
  if (name==='pending_receipts_list') return pending;
  if (name==='pending_receipt_file') return args.p_id==='demo-pending-pdf' ?
    {mime:'application/pdf',fileName:'exemplo-ficticio.pdf',base64:demoPdf().toString('base64')} :
    {mime:'application/xml',fileName:'exemplo-ficticio.xml',base64:Buffer.from(original).toString('base64')};
  if (name==='cash_closing_audit_list') return [];
  if (name==='inventory_directory') return {users:[],establishments:[{id:'demo-unit',name:'Café Aurora · dados fictícios'}]};
  if (name==='inventory_logout') return {ok:true};
  return null;
}

/** Responde apenas aos RPCs de leitura enumerados e ao login fictício local. */
async function serve(request,response) {
  const origin=request.headers.origin;
  if (origin && origin!==PREVIEW_ORIGIN) { response.writeHead(403); response.end(); return; }
  response.setHeader('Access-Control-Allow-Origin',PREVIEW_ORIGIN);
  response.setHeader('Access-Control-Allow-Headers',request.headers['access-control-request-headers'] || 'apikey,authorization,content-type,x-client-info');
  response.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');
  response.setHeader('Cache-Control','no-store');
  if (request.method==='OPTIONS') { response.writeHead(204); response.end(); return; }
  if (request.method!=='POST' || !request.url.startsWith('/rest/v1/rpc/')) { response.writeHead(404); response.end(); return; }
  let body='';
  for await (const chunk of request) { body+=chunk; if (body.length>10_000) { response.writeHead(413); response.end(); return; } }
  try {
    const args=JSON.parse(body || '{}'), name=new URL(request.url,PREVIEW_ORIGIN).pathname.split('/').at(-1);
    const result=responseFor(name,args);
    response.setHeader('Content-Type','application/json');
    response.writeHead(result===null?403:200);
    response.end(JSON.stringify(result ?? {code:'PREVIEW_READ_ONLY',message:'Prévia local: gravações indisponíveis; nenhum dado real foi alterado.'}));
  } catch { response.writeHead(400); response.end('Requisição local inválida.'); }
}

http.createServer(serve).listen(PORT,HOST,() => console.log('API fictícia do Giro: http://127.0.0.1:4175 · sem gravações'));
