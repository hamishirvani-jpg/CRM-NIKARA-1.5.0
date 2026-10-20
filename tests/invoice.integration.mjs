import fs from 'fs';
import vm from 'vm';

class Req { constructor(){ this.result=null; this.error=null; this.onsuccess=null; this.onerror=null; this.onupgradeneeded=null; } }
class Tx {
  constructor(db,name,mode){ this.db=db; this.name=name; this.mode=mode; this.oncomplete=null; this.onerror=null; this.error=null; this._pending=0; this._completed=false; }
  objectStore(name){
    const tx=this; const map=this.db._stores.get(name); if(!map) throw new Error('missing store '+name);
    return {
      getAll(){ const r=new Req(); setTimeout(()=>{r.result=[...map.values()].map(x=>structuredClone(x)); r.onsuccess?.();},0); return r; },
      get(id){ const r=new Req(); setTimeout(()=>{r.result=map.has(id)?structuredClone(map.get(id)):undefined; r.onsuccess?.();},0); return r; },
      put(v){ tx._pending++; setTimeout(()=>{map.set(v.id,structuredClone(v)); tx._pending--; tx._maybeComplete();},0); return new Req(); },
      clear(){ tx._pending++; setTimeout(()=>{map.clear(); tx._pending--; tx._maybeComplete();},0); return new Req(); },
      delete(id){ tx._pending++; setTimeout(()=>{map.delete(id); tx._pending--; tx._maybeComplete();},0); return new Req(); },
    };
  }
  _maybeComplete(){ if(this._pending===0&&!this._completed){ this._completed=true; setTimeout(()=>this.oncomplete?.(),0); } }
}
class DB {
  constructor(){ this._stores=new Map(); this.objectStoreNames={contains:(n)=>this._stores.has(n)}; }
  createObjectStore(n){ if(!this._stores.has(n))this._stores.set(n,new Map()); }
  transaction(name,mode){ return new Tx(this,name,mode); }
}
const dbs=new Map();
globalThis.indexedDB={open(name,version){ const r=new Req(); setTimeout(()=>{ let db=dbs.get(name); let created=false; if(!db){db=new DB();dbs.set(name,db);created=true;} r.result=db; if(created||version>1)r.onupgradeneeded?.(); setTimeout(()=>r.onsuccess?.(),0);},0); return r; }};
globalThis.window=globalThis;
const projectRoot = new URL('../', import.meta.url);
const code=fs.readFileSync(new URL('frontend/offline-store.js', projectRoot),'utf8');
vm.runInThisContext(code,{filename:'offline-store.js'});
const DBAPI=globalThis.OfflineDB;
const api=DBAPI.api;
function assert(cond,msg){ if(!cond) throw new Error('ASSERT: '+msg); }
await DBAPI.resetAll();
const { computeInvoiceTotals, numberToPersianWords, formatInvoiceNumber } = DBAPI;
await DBAPI.resetAll();
assert(numberToPersianWords(1250000)==='یک میلیون و دویست و پنجاه هزار','words 1250000');
assert(numberToPersianWords(115)==='یکصد و پانزده','words 115');
assert(numberToPersianWords(0)==='صفر','words zero');
assert(formatInvoiceNumber('F-{YYYY}-{SEQ}',7,'2026-10-06',4)==='F-1405-0007','pattern with jalali year');
const t=computeInvoiceTotals({tax_rate:10,discount:0,items:[{name:'a',qty:2,unit_price:1000000},{name:'b',qty:1,unit_price:500000,discount:100000},{name:'c',qty:3,unit_price:100,tax_exempt:true}]});
assert(t.subtotal===2500300,'subtotal '+t.subtotal);
assert(t.net_sum===2400300,'net');
assert(t.tax_total===240000,'tax excludes exempt line '+t.tax_total);
assert(t.grand_total===2640300,'grand '+t.grand_total);
const t2=computeInvoiceTotals({tax_rate:10,discount:200000,shipping:50000,items:[{name:'a',qty:1,unit_price:1000000},{name:'b',qty:1,unit_price:1000000}]});
assert(t2.tax_total===180000&&t2.grand_total===2030000,'invoice-level discount reduces tax base '+JSON.stringify(t2));

const org=await api('/api/organizations',{method:'POST',body:{name:'شرکت نیکان',legal_name:'شرکت نیکان پارس',national_id:'10101010',economic_code:'4111',address:'تهران'}});
await api('/api/invoice-settings',{method:'PUT',body:{numbering:{invoice:{pattern:'F-{SEQ}',start_number:1001,digits:4},proforma:{pattern:'P{YY}-{SEQ}',start_number:1,digits:3}}}});
const prod=await api('/api/products',{method:'POST',body:{code:'A-100',name:'پمپ آب',specs:'۱ اسب',unit:'دستگاه',unit_price:'۱۲,۰۰۰,۰۰۰'}});
assert(prod.unit_price===12000000,'persian digit price parsing');
let dupCode=false; try{await api('/api/products',{method:'POST',body:{code:'a-100',name:'x'}})}catch(e){dupCode=true}
assert(dupCode,'duplicate product code blocked');
const imp=await api('/api/products/import',{method:'POST',body:{csv:'کد کالا,نام کالا,واحد,قیمت\nB-1,شیر فلکه,عدد,250000\nA-100,پمپ آب ویژه,دستگاه,13000000\n'}});
assert(imp.created===1&&imp.updated===1,'product csv import '+JSON.stringify(imp));
const next=await api('/api/invoices/next-number?type=invoice');
assert(next.number==='F-1001','next preview '+next.number);
const inv1=await api('/api/invoices',{method:'POST',body:{type:'invoice',status:'issued',party_type:'organization',party_id:org.id,post_to_ledger:true,tax_rate:10,items:[{product_id:prod.id,code:'A-100',name:'پمپ آب',qty:2,unit:'دستگاه',unit_price:13000000}]}});
assert(inv1.number==='F-1001','first invoice number');
assert(inv1.buyer.name==='شرکت نیکان پارس'&&inv1.buyer.economic_code==='4111','buyer hydrated from CRM');
assert(inv1.grand_total===28600000,'grand total');
let fin=await api('/api/finance/summary?party_type=organization&party_id='+org.id);
assert(fin.receivable_rial===28600000,'ledger receivable posted '+fin.receivable_rial);
const inv2=await api('/api/invoices',{method:'POST',body:{type:'invoice',buyer:{name:'خریدار دستی',phone:'0912'},items:[{name:'خدمات نصب',qty:1,unit:'خدمت',unit_price:500000}],tax_enabled:false}});
assert(inv2.number==='F-1002'&&inv2.grand_total===500000,'second number sequential, manual buyer');
let dupNo=false; try{await api('/api/invoices',{method:'POST',body:{type:'invoice',number:'F-1001',buyer:{name:'x'},items:[{name:'y',qty:1,unit_price:1}]}})}catch(e){dupNo=true}
assert(dupNo,'duplicate invoice number blocked');
const manual=await api('/api/invoices',{method:'POST',body:{type:'invoice',number:'F-1003',buyer:{name:'x'},items:[{name:'y',qty:1,unit_price:1}]}});
const after=await api('/api/invoices/next-number?type=invoice');
assert(after.number==='F-1004','manual number advances counter '+after.number);
const edited=await api('/api/invoices/'+inv1.id,{method:'PATCH',body:{items:[{name:'پمپ آب',qty:1,unit_price:13000000}]}});
assert(edited.number==='F-1001'&&edited.grand_total===14300000,'edit keeps number, recomputes');
fin=await api('/api/finance/summary?party_type=organization&party_id='+org.id);
assert(fin.receivable_rial===14300000,'ledger follows edit '+fin.receivable_rial);
const pf=await api('/api/invoices',{method:'POST',body:{type:'proforma',party_type:'organization',party_id:org.id,items:[{name:'پمپ',qty:1,unit_price:1000}]}});
assert(/^P\d\d-001$/.test(pf.number),'proforma own sequence '+pf.number);
const conv=await api('/api/invoices/'+pf.id+'/convert',{method:'POST',body:{}});
assert(conv.type==='invoice'&&conv.number==='F-1004'&&conv.source_proforma_id===pf.id,'convert proforma');
const pf2=await api('/api/invoices/'+pf.id);
assert(pf2.status==='converted','proforma marked converted');
const list=await api('/api/invoices?q=پمپ');
assert(list.length>=3,'search by item name');
const backup=await DBAPI.exportBackup();
assert(backup.invoices.length===5&&backup.products.length===2&&backup.app_settings.length===1,'backup includes invoices');
await DBAPI.resetAll();
const res=await DBAPI.importBackup(JSON.parse(JSON.stringify(backup)),true);
assert(res.invoices===5,'restore invoices');
const afterRestore=await api('/api/invoices/next-number?type=invoice');
assert(afterRestore.number==='F-1005','counter restored '+afterRestore.number);
await api('/api/invoices/'+inv2.id,{method:'DELETE'});
assert((await api('/api/invoices?type=invoice')).length===3,'delete invoice');
// v1.5.0: marking an invoice "paid" settles it in the ledger automatically, and un-paying reverts it.
const org2=await api('/api/organizations',{method:'POST',body:{name:'شرکت تسویه'}});
const pinv=await api('/api/invoices',{method:'POST',body:{type:'invoice',status:'issued',party_type:'organization',party_id:org2.id,post_to_ledger:true,tax_rate:0,items:[{name:'خدمات',qty:1,unit_price:1000000}]}});
let fs2=await api('/api/finance/summary?party_type=organization&party_id='+org2.id);
assert(fs2.receivable_rial===1000000,'issued invoice receivable '+fs2.receivable_rial);
await api('/api/invoices/'+pinv.id,{method:'PATCH',body:{status:'paid'}});
fs2=await api('/api/finance/summary?party_type=organization&party_id='+org2.id);
assert(fs2.receivable_rial===0,'paid invoice settles receivable '+fs2.receivable_rial);
await api('/api/invoices/'+pinv.id,{method:'PATCH',body:{status:'paid',items:[{name:'خدمات',qty:2,unit_price:1000000}]}});
fs2=await api('/api/finance/summary?party_type=organization&party_id='+org2.id);
assert(fs2.receivable_rial===0,'edited paid invoice stays settled '+fs2.receivable_rial);
await api('/api/invoices/'+pinv.id,{method:'PATCH',body:{status:'issued'}});
fs2=await api('/api/finance/summary?party_type=organization&party_id='+org2.id);
assert(fs2.receivable_rial===2000000,'un-paid invoice reopens receivable '+fs2.receivable_rial);
await api('/api/invoices/'+pinv.id,{method:'PATCH',body:{status:'paid'}});
await api('/api/invoices/'+pinv.id,{method:'DELETE'});
fs2=await api('/api/finance/summary?party_type=organization&party_id='+org2.id);
assert(fs2.receivable_rial===0&&!(await api('/api/finance?party_type=organization&party_id='+org2.id)).length,'delete paid invoice cleans ledger');
const projInv=await api('/api/projects',{method:'POST',body:{title:'پروژه فاکتور',customer_organization_id:org2.id}});
await api('/api/invoices',{method:'POST',body:{type:'proforma',project_id:projInv.id,party_type:'organization',party_id:org2.id,items:[{name:'x',qty:1,unit_price:5}]}});
assert((await api('/api/invoices?project_id='+projInv.id)).length===1,'project invoice filter');
console.log('INVOICE_INTEGRATION_PASS');

// A multiline legacy text must remain one editable block after migration.
let settings=await api('/api/invoice-settings',{method:'PUT',body:{default_terms:{invoice:'بند قدیمی\nخط دوم',proforma:'شرط اولیه'}}});
assert(settings.default_term_rows.invoice.length===1&&settings.default_term_rows.invoice[0]==='بند قدیمی\nخط دوم','legacy paragraph stays one block');
settings=await api('/api/invoice-settings',{method:'PUT',body:{default_term_rows:{invoice:['بند اول\nادامه','بند دوم','','بند آخر'],proforma:['شرط پیش‌فاکتور']}}});
settings=await api('/api/invoice-settings');
assert(settings.default_term_rows.invoice.length===4&&settings.default_term_rows.invoice[2]==='','blank settings row persists');
assert(settings.default_terms.invoice==='بند اول\nادامه\nبند دوم\nبند آخر','rows-only settings update keeps print text in sync');
const appCode=fs.readFileSync(new URL('frontend/app.js',projectRoot),'utf8');
const textUi=appCode.slice(appCode.indexOf('// Text blocks are copied into each invoice.'),appCode.indexOf('function blankInvoiceItem('));
const ui={invDraft:{term_rows:[]},invSettingsDraft:settings,$:()=>null};vm.createContext(ui);vm.runInContext(textUi,ui);
ui.invDraft.term_rows=ui.invoiceDefaultRows(settings,'invoice');ui.removeInvoiceTextRow(1);
assert(settings.default_term_rows.invoice[1]==='بند دوم','removal affects only document draft');
const item=[{name:'آزمایش',qty:1,unit_price:100}];
let saved=await api('/api/invoices',{method:'POST',body:{type:'invoice',buyer:{name:'خریدار'},items:item,term_rows:ui.invDraft.term_rows}});
saved=await api('/api/invoices/'+saved.id);
assert(saved.term_rows.length===3&&saved.term_rows[0]==='بند اول\nادامه','document keeps row boundary and multiline text');
assert(saved.terms==='بند اول\nادامه\nبند آخر','preview/PDF text omits blank and removed row');
assert((await api('/api/invoice-settings')).default_term_rows.invoice[1]==='بند دوم','new document still gets permanent default');
ui.invDraft.term_rows=[];ui.syncInvoiceText();
saved=await api('/api/invoices/'+saved.id,{method:'PATCH',body:{term_rows:ui.invDraft.term_rows,terms:ui.invDraft.terms}});
assert(saved.terms===''&&saved.term_rows.length===0,'remove all rows persists');
saved=await api('/api/invoices/'+saved.id,{method:'PATCH',body:{notes:'اصلاح دیگر'}});
assert(saved.term_rows.length===0,'unrelated edits do not restore removed rows');
const pfRow=await api('/api/invoices',{method:'POST',body:{type:'proforma',buyer:{name:'خریدار'},items:item,term_rows:['فقط پیش‌فاکتور']}});
const converted=await api('/api/invoices/'+pfRow.id+'/convert',{method:'POST',body:{}});
assert(converted.term_rows[0]==='بند اول\nادامه'&&converted.terms.includes('بند دوم'),'conversion uses invoice defaults, not proforma text');
const backupWithRows=await DBAPI.exportBackup();
await DBAPI.resetAll();await DBAPI.importBackup(JSON.parse(JSON.stringify(backupWithRows)),true);
assert((await api('/api/invoice-settings')).default_term_rows.invoice[1]==='بند دوم','backup restores permanent defaults');
assert((await api('/api/invoices/'+saved.id)).term_rows.length===0,'backup restores per-document deletion');
console.log('INVOICE_TERM_ROWS_PASS');
