import fs from 'fs';
const app=fs.readFileSync(new URL('../frontend/app.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../frontend/index.html',import.meta.url),'utf8');
const bridge=fs.readFileSync(new URL('../mobile/src/native-entry.js',import.meta.url),'utf8');
function assert(c,m){if(!c)throw new Error('ASSERT: '+m);}
const more=app.slice(app.indexOf('function openMobileMore'),app.indexOf('function openQuickAdd'));
assert(more.includes("switchTab('invoices')"),'mobile More menu must open invoices');
const quick=app.slice(app.indexOf('function openQuickAdd'),app.indexOf('function addOrgPersonRow'));
assert(quick.includes("openInvoiceEditor('invoice')")&&quick.includes("openInvoiceEditor('proforma')"),'quick add must offer invoice + proforma');
assert(/mountInvoicePanel\('contact'/.test(app)&&/mountInvoicePanel\('organization'/.test(app)&&/mountInvoicePanel\('project'/.test(app),'profiles must show invoice panel');
assert(html.includes('id="invoices"'),'invoices page missing');
assert(bridge.includes("registerPlugin('NikaraPrint')")&&/NikaraPrint,\s*\n\};/.test(bridge),'NikaraPrint must be exposed on NativeBridge');
assert(!/saveInvoiceDraft\(false,true\)/.test(app),'preview must not save');
console.log('INVOICE_REACHABILITY_CONTRACT_PASS');
