import * as P from './protocol.mjs';
import {example} from './examples.mjs';
const $=id=>document.getElementById(id);
const nodes={};for(const id of ['error-details','error-code','reset','undo','message','next-action','restore-draft','copy-fingerprint','copy-record','offer-form','task','quantity','deadline','customer-key','provider-key','propose','mode','signed-status','review','accept','tamper','tamper-result','delivery-status','evidence','deliver','dispute','receipt','evidence-note','resolution-note','record-summary','fingerprint','timeline','include-content','export','download','export-output','export-details','import-file','import-json','expected-id','import','import-result'])nodes[id]=$(id);
let state={roles:null,orders:[],selected:null,evidence:new Map(),noteDrafts:new Map(),imported:false},backup=null,draftBackup=null,busy=false,prepared=null;
const friendly={"ASCII_PROFILE":"For this demo, use one paragraph with English letters, numbers and simple punctuation. Try straight quotes instead of curly quotes.","SIGNATURE":"The old approval does not cover this version. Ask for the original file or a new acceptance.","OPEN_WORK_CHANGED":"These terms have changed since they were signed. A changed deal needs a new approval.","OPEN_WORK_NOT_BOUND":"Both sides need to accept the deal before adding updates.","OPEN_WORK_EVENT_CHAIN":"The saved updates no longer fit together. Ask for the original record.","DEMO_PIN_MISMATCH":"This is not the agreement code you expected. Nothing was loaded.","DEMO_EVIDENCE_CHANGED":"The included notes have changed since they were signed. Nothing was loaded.","DEMO_VIEW_ONLY":"You can read this saved deal, but this tab does not have its signing keys.","DEMO_NO_CHANGE":"Change the price, work or deadline before proposing a new version. Your current deal is unchanged.","DEMO_DEADLINE":"Choose a future deadline in UTC.","DEMO_SELECTED_UNKNOWN":"The selected deal is missing from this file.","INPUT_LIMIT":"Use a saved file smaller than 512 KB.","CONTENT_LIMIT":"Add a note and keep it below 32 KB.","DUPLICATE_KEY":"This file repeats a field name. Ask for a fresh copy.","NONINTEGER_NUMBER":"Use whole numbers for amounts and dates.","DEMO_STORAGE_LIMIT":"This demo can keep 16 versions and 128 updates. Save your record before starting a new demo.","OPEN_WORK_INTEGER":"Enter a whole number of credits from zero to one million.","OPEN_WORK_HASH":"Copy the complete agreement code into the box."};
function notice(text,error=false){nodes.message.textContent=text;nodes.message.classList.toggle('error',error);if(!error)nodes['error-details'].hidden=true;}
function problem(error){const code=error.code||error.name||'DEMO_OPERATION_FAILED';nodes['error-code'].textContent=code;nodes['error-details'].hidden=false;notice((code==='NotSupportedError'?'This browser cannot sign the demo records. Try a current browser using the published website or the local launcher.':friendly[code]||'This file or entry could not be used. Check it and try again; your previous deal is unchanged.'),true);}
async function run(fn){if(busy)return;busy=true;document.documentElement.setAttribute('aria-busy','true');try{await fn();}catch(error){problem(error);}finally{busy=false;document.documentElement.removeAttribute('aria-busy');await render();}}
const selected=()=>state.orders.find(order=>order.id===state.selected)||null;
const canSign=order=>!!state.roles?.customer?.private&&!!state.roles?.provider?.private&&(!order||(state.roles.customer.public===order.body.customer&&state.roles.provider.public===order.body.provider));
const changedDraft=order=>!!order&&(nodes.task.value!==order.body.terms.task||String(Number(nodes.quantity.value))!==String(order.body.terms.quantity)||nodes.deadline.value!==new Date(order.body.terms.deadline*1000).toISOString().slice(0,16));
const who=role=>{P.need(canSign(selected())&&state.roles?.[role]?.private,'DEMO_VIEW_ONLY');return state.roles[role];};
const stamp=value=>new Date(value*1000).toISOString().replace('.000Z',' UTC').replace('T',' ');
const short=value=>value.slice(0,10)+'…'+value.slice(-8);
function para(parent,text,cls=''){const p=document.createElement('p');p.textContent=text;if(cls)p.className=cls;parent.append(p);return p;}
function setForm(order){nodes.task.value=order.body.terms.task;nodes.quantity.value=String(order.body.terms.quantity);nodes.deadline.value=new Date(order.body.terms.deadline*1000).toISOString().slice(0,16);}
function draft(){return {task:nodes.task.value,quantity:nodes.quantity.value,deadline:nodes.deadline.value,evidence:nodes.evidence.value,includeContent:nodes['include-content'].checked};}
function restoreDraft(value){nodes.task.value=value.task;nodes.quantity.value=value.quantity;nodes.deadline.value=value.deadline;nodes.evidence.value=value.evidence;nodes['include-content'].checked=value.includeContent;}
// Unsigned editor drafts stay local and are never part of the portable bundle.
function rememberNoteDraft(){if(canSign(selected()))state.noteDrafts.set(state.selected,nodes.evidence.value);}
function showNoteDraft(order){nodes.evidence.value=canSign(order)?state.noteDrafts.get(order?.id??null)??'':'';}
function snapshot(){rememberNoteDraft();return {state,draft:draft(),draftBackup,importResult:nodes['import-result'].textContent};}
function invalidateExport(){prepared=null;nodes['export-output'].value='';nodes.download.disabled=true;}
async function fresh(){const roles={customer:await P.identity(),provider:await P.identity()};backup=state.roles||state.orders.length?snapshot():null;state={roles,orders:[],selected:null,evidence:new Map(),noteDrafts:new Map(),imported:false};draftBackup=null;const first=example('report');nodes.task.value=first.task;nodes.quantity.value=String(first.quantity);nodes.evidence.value=first.evidence;nodes.deadline.value=new Date(Date.now()+86400000).toISOString().slice(0,16);nodes['include-content'].checked=false;nodes['import-result'].textContent="Checking a file does not confirm the sender's real identity. Compare its agreement code with the sender before relying on it.";invalidateExport();nodes['tamper-result'].hidden=true;notice("Ready. Choose a sample job, make an offer as the customer, then accept it as the supplier.");}
async function render(){
 const order=selected(),info=order?await P.inspect(order,order.id):null;const own=canSign(order),changed=changedDraft(order);
 nodes.undo.hidden=!backup;
 nodes['restore-draft'].hidden=!draftBackup;
 for(const button of document.querySelectorAll('[data-example]'))button.disabled=!own;
 for(const field of [nodes.task,nodes.quantity,nodes.deadline])field.readOnly=!own;
 nodes.evidence.disabled=!own;
 nodes.evidence.placeholder=own?'Add a delivery note, feedback or a receipt.':'Read the saved notes in Versions and updates.';
 nodes['copy-fingerprint'].disabled=!order;nodes['copy-record'].disabled=!order;
 nodes['next-action'].textContent=!order?"Next: make an offer as the customer.":!own?"Next: read or share this saved deal. This tab does not have its signing keys.":changed?"Next: propose your changes, then accept the new version as the supplier. Your earlier deal stays unchanged.":info.status!=='BOUND'?"Next: check the terms, then accept as the supplier.":order.events.some(e=>e.body.action==='DISPUTE')?"Next: review the recorded problem and any later notes, then save the deal. Resolving the problem is outside this demo.":order.events.length?"Next: review the updates, then prepare a file to save or share.":"Next: add a delivery note as the supplier, or save the accepted deal.";
 nodes['customer-key'].textContent=order?short(order.body.customer):state.roles?short(state.roles.customer.public):'—';nodes['provider-key'].textContent=order?short(order.body.provider):state.roles?short(state.roles.provider.public):'—';
 nodes.mode.textContent=order?'Version '+(state.orders.indexOf(order)+1):"New deal";
 nodes.propose.textContent=order?"Propose changes · customer":"Make offer · customer";nodes.propose.disabled=!own||state.orders.length>=16;
 nodes.accept.disabled=!own||!order||changed||info.approved.includes(order.body.provider);nodes.tamper.disabled=!order||order.assents.length===0;
 const bound=info?.status==='BOUND';for(const id of ['deliver','dispute','receipt'])nodes[id].disabled=!own||!bound||changed||order.events.length>=128;
 nodes.export.disabled=!order;
 nodes['signed-status'].textContent=!order?"No offer yet":bound?"Both sides accepted":info.approved.length===1?"One side accepted · other pending":"Waiting for acceptance";
 nodes.review.replaceChildren();
 if(order){
  para(nodes.review,order.body.terms.quantity+" example credits · deadline "+stamp(order.body.terms.deadline));
  para(nodes.review,order.body.terms.task,'exact-task');
  const parent=order.body.terms.context?.amends;
  if(parent)para(nodes.review,bound?'Both sides accepted this change to an earlier version. Keeping both versions does not mean both prices should be paid. For real work, state which earlier duties the new terms replace; this demo does not decide that.':'This changes an earlier version. The new terms need their own acceptance.');
  nodes['record-summary'].textContent=!own?(bound?'Both sides accepted this saved version. ':'This saved version still needs acceptance. ')+"Read-only: this tab does not have its signing keys.":bound?"Both sides accepted this version. You can now add updates.":"An offer is ready. The other side still needs to accept.";
  nodes.fingerprint.textContent=order.id;
  const counts=order.events.reduce((a,e)=>(a[e.body.action]=(a[e.body.action]||0)+1,a),{});
  nodes['delivery-status'].textContent=!own?'Saved record · read-only':changed?'Propose and accept changes first':!bound?'Both sides need to accept':counts.DISPUTE?'Problem recorded':counts.RECEIPT?'Receipt recorded':counts.DELIVERY_CLAIM?'Delivery note saved':'Ready for updates';
  nodes['resolution-note'].hidden=!counts.DISPUTE;
  nodes['evidence-note'].textContent=(counts.DELIVERY_CLAIM?"A delivery note is saved. ":"No delivery note yet. ")+(counts.DISPUTE?"A problem has been reported. ":'')+"The demo does not judge the work, settle the problem or make payments.";
 }else{para(nodes.review,"Make an offer to see what the supplier will accept.");nodes['record-summary'].textContent="No offer yet.";nodes.fingerprint.textContent='—';nodes['delivery-status'].textContent="Accept the deal first";nodes['resolution-note'].hidden=true;nodes['evidence-note'].textContent="No delivery recorded yet. This demo makes no payments.";}
 nodes.timeline.replaceChildren();
 if(!state.orders.length){const li=document.createElement('li');li.textContent="Your deal will appear here.";nodes.timeline.append(li);}
 for(const [index,item]of state.orders.entries()){
  const li=document.createElement('li'),button=document.createElement('button');button.type='button';button.textContent='Version '+(index+1)+' · '+item.body.terms.quantity+' credits · '+item.assents.length+"/2 approvals";button.setAttribute('aria-pressed',String(item.id===state.selected));button.addEventListener('click',()=>run(async()=>{rememberNoteDraft();state.selected=item.id;setForm(item);showNoteDraft(item);invalidateExport();notice('Viewing version '+(index+1)+". Ask the other side if there is a newer version before relying on a saved deal.");}));li.append(button);
  for(const event of item.events){
   const line=document.createElement('div');line.className='event';
   const role=event.signer===item.body.provider?'supplier':event.signer===item.body.customer?'customer':'signer '+short(event.signer);
   para(line,({DELIVERY_CLAIM:'Delivery note',DISPUTE:'Problem reported',RECEIPT:'Receipt confirmed'}[event.body.action]||event.body.action)+' · '+role+' · '+stamp(event.body.at),'event-label');
   para(line,state.evidence.has(event.body.evidence)?state.evidence.get(event.body.evidence):'Note text was not included in this saved record.','event-note');
   const details=document.createElement('details'),summary=document.createElement('summary'),hash=document.createElement('code');summary.textContent='Note hash';hash.textContent=event.body.evidence;details.append(summary,hash);line.append(details);li.append(line);
  }
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
 notice(old?"Changes proposed by the customer. Accept the new version as the supplier. The earlier deal stays in the record.":"Offer made. Check the terms, then accept as the supplier.");
 });});
nodes.accept.addEventListener('click',()=>run(async()=>{const old=selected(),next=await P.assent(old,who('provider'));state.orders=state.orders.map(x=>x.id===next.id?next:x);invalidateExport();notice("Both sides accepted the deal. You can add a delivery note or save a copy. No money moved.");}));
nodes.tamper.addEventListener('click',()=>run(async()=>{
 const original=selected(),before=JSON.stringify(original),changed=structuredClone(original);changed.body.terms.quantity+=10;
 let first='NOT_REFUSED',second='NOT_REFUSED';try{await P.inspect(changed,original.id);}catch(error){first=error.code;}
 changed.id=await P.digest(P.LABEL,changed.body);try{await P.inspect(changed,changed.id);}catch(error){second=error.code;}
 P.need(first==='OPEN_WORK_CHANGED'&&second==='SIGNATURE'&&JSON.stringify(original)===before,'DEMO_TAMPER_CONTROL');
 nodes['tamper-result'].textContent='Unapproved price change: rejected.\nReusing the old approval: rejected.\nYour original deal is unchanged.';nodes['tamper-result'].hidden=false;notice("The unapproved change was rejected. To agree a new price, edit the offer and propose the change.");
}));
async function record(action,role){const original=selected(),text=nodes.evidence.value;P.need(text.length>0,'CONTENT_LIMIT');P.need(state.evidence.size<128,'DEMO_STORAGE_LIMIT');const hash=await P.contentHash(text);const at=Math.max(Math.floor(Date.now()/1000),original.events.at(-1)?.body.at||0),next=await P.event(original,who(role),action,hash,at);state.orders=state.orders.map(x=>x.id===next.id?next:x);state.evidence.set(hash,text);invalidateExport();notice(action==='DISPUTE'?"Problem recorded. This keeps your note; it does not decide who is right.":action==='RECEIPT'?"Receipt confirmed by the customer. This confirms the note was received, not that the work is good or paid for.":"Delivery note saved by the supplier. The customer can now review the work.");}
for(const [id,action,role]of [['deliver','DELIVERY_CLAIM','provider'],['dispute','DISPUTE','customer'],['receipt','RECEIPT','customer']])nodes[id].addEventListener('click',()=>run(()=>record(action,role)));
async function prepare(){const bundle={format:P.BUNDLE,selected:state.selected,agreements:state.orders,evidence:nodes['include-content'].checked?[...state.evidence].map(([sha256,text])=>({sha256,text})):[]};P.need(new TextEncoder().encode(JSON.stringify(bundle)).length<=P.LIMIT,'INPUT_LIMIT');await P.verifyBundle(bundle);prepared=JSON.stringify(bundle,null,2);nodes['export-output'].value=prepared;nodes.download.disabled=false;}
nodes.export.addEventListener('click',()=>run(async()=>{await prepare();notice("File ready. Save it or copy the record to share. Notes are included only if you selected them.");}));
nodes['include-content'].addEventListener('change',invalidateExport);
nodes.download.addEventListener('click',()=>run(async()=>{await prepare();const url=URL.createObjectURL(new Blob([prepared],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='portable-agreement.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);notice("Download started. Check your browser's downloads, then open the demo in a second tab and load the file.");}));
nodes['import-file'].addEventListener('change',()=>run(async()=>{const file=nodes['import-file'].files[0];if(!file)return;P.need(file.size<=P.LIMIT,'INPUT_LIMIT');nodes['import-json'].value=await file.text();notice("File selected. Click Open and check file to read it.");}));
nodes.import.addEventListener('click',()=>run(async()=>{
 const bundle=P.parseJSON(nodes['import-json'].value),pin=nodes['expected-id'].value.trim();if(pin)P.need(/^[0-9a-f]{64}$/.test(pin),'OPEN_WORK_HASH');const checked=await P.verifyBundle(bundle,{expectedId:pin||null});
 backup=snapshot();const own=state.roles,order=bundle.agreements.find(x=>x.id===bundle.selected),keep=own&&order.body.customer===own.customer.public&&order.body.provider===own.provider.public;
 state={roles:keep?own:null,orders:structuredClone(bundle.agreements),selected:bundle.selected,evidence:new Map(bundle.evidence.map(item=>[item.sha256,item.text])),noteDrafts:keep?new Map(state.noteDrafts):new Map(),imported:true};draftBackup=null;setForm(order);showNoteDraft(order);invalidateExport();nodes['tamper-result'].hidden=true;
 const note='Opened and checked '+checked.results.length+" version(s) and their updates. "+(pin?"The agreement code matches the one you supplied. ":"Without a code from the sender, this check does not confirm who they are or whether this is their latest version. ")+(keep?"This tab still has the original signing keys.":"Read-only: the signing keys were not in the file.");nodes['import-result'].textContent=note;notice(note);
}));
for(const button of document.querySelectorAll('[data-example]'))button.addEventListener('click',()=>run(async()=>{
 const chosen=example(button.dataset.example);
 draftBackup={task:nodes.task.value,quantity:nodes.quantity.value,evidence:nodes.evidence.value};
 nodes.task.value=chosen.task;nodes.quantity.value=String(chosen.quantity);nodes.evidence.value=chosen.evidence;
 notice("Example filled in. Your saved deals and updates are unchanged. "+(selected()?"Propose the change, then accept it as the supplier.":"Make an offer when ready.")+" You can restore the previous draft.");
}));
for(const field of [nodes.task,nodes.quantity,nodes.deadline])field.addEventListener('input',()=>{void render().catch(problem);});
nodes['restore-draft'].addEventListener('click',()=>run(async()=>{
 if(!draftBackup)return;
 const current={task:nodes.task.value,quantity:nodes.quantity.value,evidence:nodes.evidence.value};
 nodes.task.value=draftBackup.task;nodes.quantity.value=draftBackup.quantity;nodes.evidence.value=draftBackup.evidence;draftBackup=current;
 notice("Previous draft restored. Your saved deals and updates are unchanged.");
}));
async function copyText(text,element,label){
 try{if(!navigator.clipboard?.writeText)throw Error('COPY_UNAVAILABLE');await navigator.clipboard.writeText(text);notice(label+" copied. Share it only with the people you choose. No private signing key was copied.");}
 catch{if(nodes['export-details'].contains(element))nodes['export-details'].open=true;if(element.select){element.focus();element.select();}else{const range=document.createRange();range.selectNodeContents(element);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);}notice(label+" selected. Copy it manually. Nothing was sent.");}
}
nodes['copy-fingerprint'].addEventListener('click',()=>run(async()=>{if(selected())await copyText(selected().id,nodes.fingerprint,"Agreement code");}));
nodes['copy-record'].addEventListener('click',()=>run(async()=>{await prepare();await copyText(prepared,nodes['export-output'],"Agreement record");}));
nodes.reset.addEventListener('click',()=>run(fresh));nodes.undo.addEventListener('click',()=>run(async()=>{P.need(backup,'DEMO_NO_UNDO');const current=snapshot(),previous=backup;state=previous.state;restoreDraft(previous.draft);draftBackup=previous.draftBackup;nodes['import-result'].textContent=previous.importResult;backup=current;nodes['tamper-result'].hidden=true;invalidateExport();notice("Previous demo and draft restored. Your saved approvals are unchanged.");}));
async function start(){if(!globalThis.isSecureContext||!globalThis.crypto?.subtle){notice("Open the published website to use this demo, or follow the local setup in Help.",true);return;}try{await run(fresh);}catch(error){problem(error);}}
start();
