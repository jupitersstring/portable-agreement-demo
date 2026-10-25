import * as P from './protocol.mjs';
const $=id=>document.getElementById(id);
const nodes={};for(const id of ['reset','undo','message','offer-form','task','quantity','deadline','customer-key','provider-key','propose','mode','signed-status','review','accept','tamper','tamper-result','evidence','deliver','dispute','receipt','evidence-note','record-summary','fingerprint','timeline','include-content','export','download','export-output','export-details','import-file','import-json','expected-id','import','import-result'])nodes[id]=$(id);
let state={roles:null,orders:[],selected:null,evidence:new Map(),imported:false},backup=null,busy=false,prepared=null;
const friendly={ASCII_PROFILE:'This profile uses printable ASCII terms. Keep the work description to one paragraph with ordinary ASCII punctuation.',SIGNATURE:'A carried signature does not approve these bytes. Request the original signed record or fresh acceptance.',OPEN_WORK_CHANGED:'The terms no longer match their signed fingerprint. Original acceptance cannot be carried across a price or scope change.',OPEN_WORK_NOT_BOUND:'Both parties must accept the exact agreement before recording events.',OPEN_WORK_EVENT_CHAIN:'The evidence order or parent link has changed.',DEMO_PIN_MISMATCH:'This is not the agreement fingerprint you expected. Nothing has been loaded.',DEMO_EVIDENCE_CHANGED:'Included evidence text does not match its signed hash. Nothing has been loaded.',DEMO_VIEW_ONLY:'This record is view-only here. Its signing keys were not exported; verify or share the public record instead.',DEMO_NO_CHANGE:'Change the price, work or deadline before proposing a revision. The existing agreement is unchanged.',DEMO_DEADLINE:'Choose a future UTC deadline.',DEMO_SELECTED_UNKNOWN:'The selected agreement is not included.',INPUT_LIMIT:'Keep an imported record below 512 KB.',CONTENT_LIMIT:'Keep each evidence note below 32 KB.',DUPLICATE_KEY:'This JSON repeats a field name. Request an unambiguous export.',NONINTEGER_NUMBER:'Amounts and timestamps must be exact integers.',DEMO_STORAGE_LIMIT:'This small demo keeps up to 16 versions and 128 evidence items. Export and start a new demo for more.'};
function notice(text,error=false){nodes.message.textContent=text;nodes.message.classList.toggle('error',error);}
function problem(error){const code=error.code||error.name||'DEMO_OPERATION_FAILED';notice((code==='NotSupportedError'?'This browser does not support the required Ed25519 signing. Try a current browser over HTTPS or localhost.':friendly[code]||'The record or input was refused. Check its exact fields and signatures; your prior record is unchanged.')+'\n'+code,true);}
async function run(fn){if(busy)return;busy=true;document.documentElement.setAttribute('aria-busy','true');try{await fn();}catch(error){problem(error);}finally{busy=false;document.documentElement.removeAttribute('aria-busy');await render();}}
const selected=()=>state.orders.find(order=>order.id===state.selected)||null;
const who=role=>{P.need(state.roles?.[role]?.private,'DEMO_VIEW_ONLY');return state.roles[role];};
const stamp=value=>new Date(value*1000).toISOString().replace('.000Z',' UTC').replace('T',' ');
const short=value=>value.slice(0,10)+'…'+value.slice(-8);
function para(parent,text,cls=''){const p=document.createElement('p');p.textContent=text;if(cls)p.className=cls;parent.append(p);return p;}
function setForm(order){nodes.task.value=order.body.terms.task;nodes.quantity.value=String(order.body.terms.quantity);nodes.deadline.value=new Date(order.body.terms.deadline*1000).toISOString().slice(0,16);}
function invalidateExport(){prepared=null;nodes['export-output'].value='';nodes.download.disabled=true;}
async function fresh(){const roles={customer:await P.identity(),provider:await P.identity()};backup=state.roles||state.orders.length?state:null;state={roles,orders:[],selected:null,evidence:new Map(),imported:false};nodes.task.value='Produce a research report on battery recycling. Include three publicly cited sources, a one-page summary, and a table comparing costs. Delivery is a claim; the customer reviews quality separately.';nodes.quantity.value='90';nodes.deadline.value=new Date(Date.now()+86400000).toISOString().slice(0,16);nodes['include-content'].checked=false;invalidateExport();nodes['tamper-result'].hidden=true;notice('Ready. Create an offer as the customer, then accept it as the provider. You control both demo roles; neither is a real autonomous agent.');}
async function render(){
 const order=selected(),info=order?await P.inspect(order,order.id):null;const own=!!state.roles?.customer?.private&&!!state.roles?.provider?.private;
 nodes.undo.hidden=!backup;
 nodes['customer-key'].textContent=order?short(order.body.customer):state.roles?short(state.roles.customer.public):'—';nodes['provider-key'].textContent=order?short(order.body.provider):state.roles?short(state.roles.provider.public):'—';
 nodes.mode.textContent=order?'Revision '+(state.orders.indexOf(order)+1):'New agreement';
 nodes.propose.textContent=order?'Propose changed terms · customer':'Create and sign offer · customer';nodes.propose.disabled=!own||state.orders.length>=16;
 nodes.accept.disabled=!own||!order||info.approved.includes(order.body.provider);nodes.tamper.disabled=!order||order.assents.length===0;
 const bound=info?.status==='BOUND';for(const id of ['deliver','dispute','receipt'])nodes[id].disabled=!own||!bound||order.events.length>=128;
 nodes.export.disabled=!order;
 nodes['signed-status'].textContent=!order?'No agreement yet':bound?'Both parties signed':info.approved.length===1?'Customer signed · provider pending':'Awaiting signatures';
 nodes.review.replaceChildren();
 if(order){
  para(nodes.review,order.body.terms.quantity+' demo credits · deadline '+stamp(order.body.terms.deadline));
  para(nodes.review,order.body.terms.task,'exact-task');
  para(nodes.review,'Signed fingerprint: '+order.id);
  const parent=order.body.terms.context?.amends;
  if(parent)para(nodes.review,'Linked parent: '+short(parent)+'. This proposal needs its own acceptance; old signatures are not reused.');
  nodes['record-summary'].textContent=bound?'Exact agreement accepted by two keys. Performance and payment remain separate questions.':'A proposal is retained. It is not yet a two-party agreement.';
  nodes.fingerprint.textContent=order.id;
  const counts=order.events.reduce((a,e)=>(a[e.body.action]=(a[e.body.action]||0)+1,a),{});
  nodes['evidence-note'].textContent=(counts.DELIVERY_CLAIM?'A delivery claim is recorded. ':'No delivery claim is recorded. ')+(counts.DISPUTE?'A dispute is recorded. ':'')+'No automatic quality decision, dispute resolution or payment takes place.';
 }else{para(nodes.review,'Create an offer to see exactly what the provider is accepting.');nodes['record-summary'].textContent='No signatures yet.';nodes.fingerprint.textContent='—';nodes['evidence-note'].textContent='Nothing has been delivered. No funds have been reserved or moved.';}
 nodes.timeline.replaceChildren();
 if(!state.orders.length){const li=document.createElement('li');li.textContent='Your signed records will appear here.';nodes.timeline.append(li);}
 for(const [index,item]of state.orders.entries()){
  const li=document.createElement('li'),button=document.createElement('button');button.type='button';button.textContent='Version '+(index+1)+' · '+item.body.terms.quantity+' credits · '+item.assents.length+'/2 signatures';button.setAttribute('aria-pressed',String(item.id===state.selected));button.addEventListener('click',()=>run(async()=>{state.selected=item.id;setForm(item);invalidateExport();notice('Viewing version '+(index+1)+'. The selected version is a local view, not a proof of globally current authority.');}));li.append(button);
  for(const event of item.events){const line=document.createElement('span');line.className='event';line.textContent=event.body.action.replaceAll('_',' ')+' · '+short(event.body.evidence)+' · '+stamp(event.body.at);li.append(line);}
  nodes.timeline.append(li);
 }
}
nodes['offer-form'].addEventListener('submit',event=>{event.preventDefault();run(async()=>{
 const old=selected(),quantity=Number(nodes.quantity.value),deadline=Date.parse(nodes.deadline.value+'Z')/1000;
 P.need(Number.isSafeInteger(quantity)&&quantity>=0&&quantity<=1000000,'OPEN_WORK_INTEGER');P.need(Number.isSafeInteger(deadline)&&deadline>Math.floor(Date.now()/1000),'DEMO_DEADLINE');P.need(state.orders.length<16,'DEMO_STORAGE_LIMIT');
 if(old)P.need(old.body.terms.task!==nodes.task.value||old.body.terms.quantity!==quantity||old.body.terms.deadline!==deadline,'DEMO_NO_CHANGE');
 const context=old?{amends:old.id,rule:'Fresh assent binds this proposal. Prior records and accrued obligations are not automatically released.'}:null;
 let order=await P.draft({task:nodes.task.value,customer:who('customer').public,provider:who('provider').public,quantity,deadline,context});order=await P.assent(order,who('customer'));
 state.orders=[...state.orders,order];state.selected=order.id;invalidateExport();nodes['tamper-result'].hidden=true;
 notice(old?'A new proposal is signed by the customer. The provider must accept it separately. The earlier signed record is unchanged.':'Offer signed by the customer. Review the exact terms, then accept as the provider.');
 });});
nodes.accept.addEventListener('click',()=>run(async()=>{const old=selected(),next=await P.assent(old,who('provider'));state.orders=state.orders.map(x=>x.id===next.id?next:x);invalidateExport();notice('Both keys accepted these exact terms. Nothing was paid, reserved or externally authorised.');}));
nodes.tamper.addEventListener('click',()=>run(async()=>{
 const original=selected(),before=JSON.stringify(original),changed=structuredClone(original);changed.body.terms.quantity+=10;
 let first='NOT_REFUSED',second='NOT_REFUSED';try{await P.inspect(changed,original.id);}catch(error){first=error.code;}
 changed.id=await P.digest(P.LABEL,changed.body);try{await P.inspect(changed,changed.id);}catch(error){second=error.code;}
 P.need(first==='OPEN_WORK_CHANGED'&&second==='SIGNATURE'&&JSON.stringify(original)===before,'DEMO_TAMPER_CONTROL');
 nodes['tamper-result'].textContent='Changed price with original fingerprint: REFUSED ('+first+').\nNew fingerprint with the old signature: REFUSED ('+second+').\nThe original record still verifies and has not been altered.';nodes['tamper-result'].hidden=false;notice('The tamper test was refused. To negotiate a new price, edit the offer form and propose a separate revision.');
}));
async function record(action,role){const original=selected(),text=nodes.evidence.value;P.need(text.length>0,'CONTENT_LIMIT');P.need(state.evidence.size<128,'DEMO_STORAGE_LIMIT');const hash=await P.contentHash(text);const at=Math.max(Math.floor(Date.now()/1000),original.events.at(-1)?.body.at||0),next=await P.event(original,who(role),action,hash,at);state.orders=state.orders.map(x=>x.id===next.id?next:x);state.evidence.set(hash,text);invalidateExport();notice(action==='DISPUTE'?'Dispute recorded with its evidence hash and signer. The event does not appoint an arbitrator or decide who is right.':action==='RECEIPT'?'Evidence acknowledged by the customer. This is not a payment receipt or independent quality finding.':'Delivery claim signed by the provider and linked to the preceding event. Its content hash is retained; quality remains for the customer to assess.');}
for(const [id,action,role]of [['deliver','DELIVERY_CLAIM','provider'],['dispute','DISPUTE','customer'],['receipt','RECEIPT','customer']])nodes[id].addEventListener('click',()=>run(()=>record(action,role)));
async function prepare(){const bundle={format:P.BUNDLE,selected:state.selected,agreements:state.orders,evidence:nodes['include-content'].checked?[...state.evidence].map(([sha256,text])=>({sha256,text})):[]};P.need(new TextEncoder().encode(JSON.stringify(bundle)).length<=P.LIMIT,'INPUT_LIMIT');await P.verifyBundle(bundle);prepared=JSON.stringify(bundle,null,2);nodes['export-output'].value=prepared;nodes['export-details'].open=true;nodes.download.disabled=false;}
nodes.export.addEventListener('click',()=>run(async()=>{await prepare();notice('Portable record prepared. It always includes exact terms, public keys, signatures and event hashes. Evidence text is included only if selected. No private signing key is exported.');}));
nodes['include-content'].addEventListener('change',invalidateExport);
nodes.download.addEventListener('click',()=>run(async()=>{await prepare();const url=URL.createObjectURL(new Blob([prepared],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='portable-agreement.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);notice('Public record downloaded. Open a second tab and import it to verify without this tab’s private keys.');}));
nodes['import-file'].addEventListener('change',()=>run(async()=>{const file=nodes['import-file'].files[0];if(!file)return;P.need(file.size<=P.LIMIT,'INPUT_LIMIT');nodes['import-json'].value=await file.text();notice('File loaded into the verifier. Click Verify and load record; no signatures or files have been accepted yet.');}));
nodes.import.addEventListener('click',()=>run(async()=>{
 const bundle=P.parseJSON(nodes['import-json'].value),pin=nodes['expected-id'].value.trim();if(pin)P.need(/^[0-9a-f]{64}$/.test(pin),'OPEN_WORK_HASH');const checked=await P.verifyBundle(bundle,{expectedId:pin||null});
 backup=state;const own=state.roles,order=bundle.agreements.find(x=>x.id===bundle.selected),keep=own&&order.body.customer===own.customer.public&&order.body.provider===own.provider.public;
 state={roles:keep?own:null,orders:structuredClone(bundle.agreements),selected:bundle.selected,evidence:new Map(bundle.evidence.map(item=>[item.sha256,item.text])),imported:true};setForm(order);invalidateExport();nodes['tamper-result'].hidden=true;
 const note='Verified '+checked.results.length+' agreement version(s), signatures and event links. '+(pin?'The selected fingerprint matches your independent pin. ':'No independent fingerprint supplied; identity and latest status are not established. ')+(keep?'Original signing keys remain in this tab.':'Read-only import: no private signing keys were carried.');nodes['import-result'].textContent=note;notice(note);
}));
nodes.reset.addEventListener('click',()=>run(fresh));nodes.undo.addEventListener('click',()=>run(async()=>{P.need(backup,'DEMO_NO_UNDO');const current=state;state=backup;backup=current;nodes['tamper-result'].hidden=true;if(selected())setForm(selected());else{nodes.quantity.value='90';nodes.deadline.value=new Date(Date.now()+86400000).toISOString().slice(0,16);}invalidateExport();notice('Previous local session restored. No signatures were rewritten.');}));
async function start(){if(!globalThis.isSecureContext||!globalThis.crypto?.subtle){notice('Local signing needs HTTPS or localhost with WebCrypto. Run python3 run_demo.py and open the printed localhost URL.',true);return;}try{await run(fresh);}catch(error){problem(error);}}
start();
