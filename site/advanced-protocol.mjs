/* SPDX-License-Identifier: MIT
 * Original public workflow examples, independent of the private Covenant core.
 * Every amount is an integer unit (minor units for currency; credits in the UI).
 * Nothing here executes a payment, gives
 * legal authority, authenticates a person, or proves an independently timed act.
 */
import * as P from './protocol.mjs';

export const PROFILE='covenant-public-advanced-demo/0.1';
export const FORMAT='covenant-public-advanced-record/0.1';
export const FORMAT_HISTORY='covenant-public-advanced-history/0.1';
export const LABEL='COVENANT-PUBLIC-ADVANCED-DEMO-0.1';
export const LIMIT=P.LIMIT, MAX_AMOUNT=1_000_000_000_000, MAX_RECORDS=128;
export const identity=P.identity, nonce=P.nonce;
export const REVISION_RULE_TEXT=Object.freeze({
 ADDITIONAL_PROPOSAL:'This version is an additional proposal. Approving it does not replace earlier agreed scope or price.',
 REPLACE_REMAINING_TERMS:'If all required parties approve this exact version, its scope and price replace earlier scope and price for remaining work. Past work and payment claims are not released or determined. This demo does not certify legal effect.'
});
const {need}=P, encoder=new TextEncoder(), HEX=/^[0-9a-f]{64}$/;
const CLOCK='SELF_DECLARED_UNIX_SECONDS', MAX_TIME=4_102_444_800;
const admittedKeys=new Set();
const fields={
 delegation:{actors:'owner delegate provider',terms:'budget currency purpose expires'},
 multiparty:{actors:'customer provider reviewer',terms:'title description amount currency deadline'},
 quotes:{actors:'customer bidderA bidderB',terms:'title purpose currency budget expires'},
 arbitration:{actors:'customer provider arbitrator',terms:'title description amount currency deadline providerDuty customerDuty rules'}
};
const nowSeconds=()=>Math.floor(Date.now()/1000);
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
function shape(value,names){
 need(plain(value),'ADV_OBJECT');const actual=Object.keys(value).sort(),expected=names?names.split(' ').sort():[];
 // Compare keys as separate values: joining with a delimiter admits a malicious
 // single name such as "deadline description" in place of two required members.
 need(actual.length===expected.length&&actual.every((name,index)=>name===expected[index]),'FIELDS');
}
function uint(value,max=MAX_AMOUNT){need(Number.isSafeInteger(value)&&value>=0&&value<=max&&!Object.is(value,-0),'ADV_INTEGER');}
function amount(value){uint(value);need(value>0,'ADV_AMOUNT');}
function time(value){uint(value,MAX_TIME);}
function hash(value){need(typeof value==='string'&&HEX.test(value),'ADV_HASH');}
function unicode(value){
 need(typeof value==='string','ADV_TEXT');
 for(let i=0;i<value.length;i++){
  const c=value.charCodeAt(i);
  if(c>=0xd800&&c<=0xdbff){const next=value.charCodeAt(++i);need(next>=0xdc00&&next<=0xdfff,'ADV_UNICODE');}
  else need(c<0xdc00||c>0xdfff,'ADV_UNICODE');
 }
}
function text(value,max=4096){unicode(value);need(value.trim().length>0&&encoder.encode(value).length<=max,'ADV_TEXT');need(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),'ADV_TEXT');}
function currency(value){need(typeof value==='string'&&(/^[A-Z]{3}$/.test(value)||value==='credits'),'ADV_CURRENCY');}

// Canonical JSON uses sorted names, safe integers, exact Unicode code points,
// and ASCII \uXXXX escapes. No Unicode normalization or locale collation occurs.
// The signed bytes are the public helper's UTF-8 encoding of:
// LABEL + '-RECORD' + NUL + publicCanonical(signingFrame(body)). The canonical
// JSON is split into fixed 16,000-character chunks to retain public helper limits.
export function canonical(value){
 let nodes=0;
 const string=value=>{unicode(value);need(encoder.encode(value).length<=64000,'ADV_TEXT_LIMIT');return JSON.stringify(value).replace(/[\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));};
 function encode(item,depth){
  need(++nodes<=20000&&depth<=24,'DEMO_STRUCTURE_LIMIT');
  if(item===null||typeof item==='boolean')return JSON.stringify(item);
  if(typeof item==='number'){need(Number.isSafeInteger(item)&&!Object.is(item,-0),'INTEGER_RANGE');return JSON.stringify(item);}
  if(typeof item==='string')return string(item);
  if(Array.isArray(item)){
   need(item.length<=2048,'ARRAY_LIMIT');need(Reflect.ownKeys(item).length===item.length+1,'ADV_ARRAY');
   return '['+Array.from({length:item.length},(_,index)=>{const descriptor=Object.getOwnPropertyDescriptor(item,String(index));need(descriptor&&Object.hasOwn(descriptor,'value'),'ADV_ACCESSOR');return encode(descriptor.value,depth+1);}).join(',')+']';
  }
  need(plain(item)&&Object.keys(item).length<=128,'MAP_LIMIT');
  need(Reflect.ownKeys(item).length===Object.keys(item).length,'ADV_OBJECT');
  return '{'+Object.keys(item).sort().map(key=>{
   const descriptor=Object.getOwnPropertyDescriptor(item,key);need(descriptor&&Object.hasOwn(descriptor,'value'),'ADV_ACCESSOR');
   need(key.length<=256,'MAP_KEY');return string(key)+':'+encode(descriptor.value,depth+1);
  }).join(',')+'}';
 }
 const out=encode(value,0);need(out.length<=LIMIT,'INPUT_LIMIT');return out;
}
export function signingFrame(value){const json=canonical(value),chunks=[];for(let i=0;i<json.length;i+=16000)chunks.push(json.slice(i,i+16000));return {canonical_json_chunks:chunks};}
const frame=signingFrame;
const digest=(label,value)=>P.digest(label,frame(value));
const sign=(key,label,value)=>P.signature(key,label,frame(value));
const verify=(key,label,value,sig)=>P.verifySignature(key,label,frame(value),sig);
function copy(value){canonical(value);const raw=JSON.stringify(value);need(encoder.encode(raw).length<=LIMIT,'INPUT_LIMIT');return P.parseJSON(raw);}
function frozen(value){if(value&&typeof value==='object'){for(const part of Object.values(value))frozen(part);Object.freeze(value);}return value;}
async function validActor(key){
 hash(key);if(admittedKeys.has(key))return;
 // Use the public verifier's canonical, non-small-order point admission. A
 // deliberately invalid signature must reach SIGNATURE, never PUBLIC_KEY.
 try{await P.verifySignature(key,LABEL+'-KEY-CHECK',{},'00'.repeat(64));}catch(error){need(error.code==='SIGNATURE','PUBLIC_KEY');if(admittedKeys.size>=256)admittedKeys.clear();admittedKeys.add(key);return;}
 need(false,'PUBLIC_KEY');
}
export const manifestId=body=>digest(LABEL+'-MANIFEST',body);
export const recordId=record=>digest(LABEL+'-RECORD-ID',record);

async function manifest(body){
 // Before portable histories existed this same demo profile omitted the optional
 // parent member. Those independently verifiable initial snapshots remain readable.
 need(plain(body),'ADV_OBJECT');shape(body,'profile kind nonce created clock actors terms'+(Object.hasOwn(body,'previousRecord')?' previousRecord':'')+(Object.hasOwn(body,'revisionRule')?' revisionRule':''));need(body.profile===PROFILE&&body.clock===CLOCK&&Object.hasOwn(fields,body.kind),'ADV_PROFILE');
 if(Object.hasOwn(body,'previousRecord')&&body.previousRecord!==null)hash(body.previousRecord);
 const rule=Object.hasOwn(body,'revisionRule')?body.revisionRule:'ADDITIONAL_PROPOSAL';need(typeof rule==='string'&&Object.hasOwn(REVISION_RULE_TEXT,rule),'ADV_REVISION_RULE');
 if(rule==='REPLACE_REMAINING_TERMS')need(body.kind==='multiparty'&&typeof body.previousRecord==='string'&&HEX.test(body.previousRecord),'ADV_REPLACEMENT_PARENT');
 hash(body.nonce);time(body.created);const spec=fields[body.kind];shape(body.actors,spec.actors);shape(body.terms,spec.terms);
 const keys=Object.values(body.actors);need(new Set(keys).size===keys.length,'ADV_DISTINCT_ACTORS');for(const key of keys)await validActor(key);
 const t=body.terms;currency(t.currency);
 if(Object.hasOwn(t,'budget'))amount(t.budget);if(Object.hasOwn(t,'amount'))amount(t.amount);
 for(const name of ['title','description','purpose','providerDuty','customerDuty','rules'])if(Object.hasOwn(t,name))text(t[name]);
 for(const name of ['expires','deadline'])if(Object.hasOwn(t,name)){time(t[name]);need(t[name]>body.created,'ADV_DEADLINE');}
}

export async function create({kind,actors,terms,at=nowSeconds(),previousRecord=null,revisionRule='ADDITIONAL_PROPOSAL'}){
 const body=copy({profile:PROFILE,kind,nonce:nonce(),created:at,clock:CLOCK,actors,terms,previousRecord,revisionRule});await manifest(body);
 const log={format:FORMAT,body,id:await manifestId(body),records:[],evidence:[]};await inspect(log);return frozen(log);
}

function authority(record,key){need(record.signer===key,'ADV_AUTHORITY');}
function agreement(data,id){need(data.agreement===id,'ADV_AGREEMENT_CHANGED');}
function evidenceRef(value,evidence){hash(value);need(evidence.has(value),'ADV_EVIDENCE_MISSING');}

function delegation(state,record,t,a,id){
 const {type,data,at}=record.body;
 if(type==='GRANT'){
  shape(data,'');authority(record,a.owner);need(!state.grant,'ADV_GRANT_EXISTS');need(at<t.expires,'ADV_GRANT_EXPIRED');
  state.grant={id:record.id,budget:t.budget,currency:t.currency,purpose:t.purpose,expires:t.expires,revoked:false};state.status='ACTIVE';
 }else if(type==='REVOKE'){
  shape(data,'');authority(record,a.owner);need(state.grant&&!state.grant.revoked,'ADV_GRANT_INACTIVE');state.grant.revoked=true;state.status='REVOKED';
 }else if(type==='SPEND'){
  shape(data,'amount currency purpose payee');authority(record,a.delegate);need(state.grant&&!state.grant.revoked,'ADV_GRANT_INACTIVE');need(at<t.expires,'ADV_GRANT_EXPIRED');
  amount(data.amount);currency(data.currency);text(data.purpose);hash(data.payee);
  need(data.currency===t.currency&&data.purpose===t.purpose&&data.payee===a.provider,'ADV_GRANT_SCOPE');need(data.amount<=state.remaining,'ADV_GRANT_BUDGET');
  state.spent+=data.amount;state.remaining=t.budget-state.spent;
 }else need(false,'ADV_ACTION');
}
function approval(state,record,id,actors){
 shape(record.body.data,'agreement');agreement(record.body.data,id);need(Object.values(actors).includes(record.signer),'ADV_AUTHORITY');need(!state.approved.includes(record.signer),'ADV_DUPLICATE_APPROVAL');
 state.approved.push(record.signer);state.status=state.approved.length===Object.keys(actors).length?'AGREED':'AWAITING_APPROVALS';
}
function quotes(state,record,t,a,id){
 const {type,data,at}=record.body;
 if(type==='REQUEST'){
  shape(data,'');authority(record,a.customer);need(!state.request,'ADV_REQUEST_EXISTS');need(at<t.expires,'ADV_REQUEST_EXPIRED');state.request=record.id;state.status='REQUESTED';
 }else if(type==='BID'){
  shape(data,'request amount currency description validUntil bidNonce');need(state.request,'ADV_REQUEST_MISSING');need([a.bidderA,a.bidderB].includes(record.signer),'ADV_AUTHORITY');need(!state.selected,'ADV_SELECTION_FINAL');
  need(data.request===id,'ADV_REQUEST_BINDING');amount(data.amount);currency(data.currency);text(data.description);time(data.validUntil);hash(data.bidNonce);
  need(at<t.expires&&data.validUntil>at&&data.validUntil<=t.expires,'ADV_BID_EXPIRED');need(data.currency===t.currency&&data.amount<=t.budget,'ADV_BID_SCOPE');
  need(!state.bids.some(bid=>bid.bidNonce===data.bidNonce||bid.signer===record.signer),'ADV_DUPLICATE_BID');state.bids.push({id:record.id,signer:record.signer,...data});state.status='BIDS_RECEIVED';
 }else if(type==='SELECT'){
  shape(data,'bid');authority(record,a.customer);hash(data.bid);need(!state.contract,'ADV_SELECTION_FINAL');const bid=state.bids.find(item=>item.id===data.bid);need(bid,'ADV_BID_UNKNOWN');need(state.selected?.id!==bid.id,'ADV_DUPLICATE_SELECTION');need(at<bid.validUntil&&at<t.expires,'ADV_BID_EXPIRED');state.selected=bid;state.status='SELECTED_ONLY';
 }else if(type==='CONTRACT'){
  shape(data,'bid');authority(record,a.customer);need(state.selected&&data.bid===state.selected.id,'ADV_SELECTED_BID_BINDING');need(!state.contract,'ADV_CONTRACT_EXISTS');need(at<state.selected.validUntil&&at<t.expires,'ADV_BID_EXPIRED');
  const bid=state.selected;state.contract={id:record.id,bid:bid.id,customer:a.customer,provider:bid.signer,terms:{title:t.title,purpose:t.purpose,amount:bid.amount,currency:bid.currency,description:bid.description,validUntil:bid.validUntil}};state.status='AWAITING_SUPPLIER';
 }else if(type==='CONTRACT_APPROVE'){
  shape(data,'agreement');need(state.contract,'ADV_CONTRACT_MISSING');authority(record,state.contract.provider);agreement(data,state.contract.id);need(!state.contractApproved,'ADV_DUPLICATE_APPROVAL');need(at<state.contract.terms.validUntil,'ADV_BID_EXPIRED');state.contractApproved=true;state.status='AGREED';
 }else need(false,'ADV_ACTION');
}
function arbitration(state,record,t,a,id,evidence){
 const {type,data}=record.body;
 if(type==='APPROVE'){need(!state.delivery&&!state.problem&&!state.award,'ADV_APPROVAL_CLOSED');approval(state,record,id,a);return;}
 need(state.approved.length===3,'ADV_APPROVALS_MISSING');
 if(['CORRECTION','REVIEW','PAYMENT_REPORT','PAYMENT_ACK'].includes(type)){
  need(state.award,'ADV_AWARD_MISSING');
  if(type==='CORRECTION'){
   shape(data,'agreement award evidence');authority(record,a.provider);agreement(data,id);need(data.award===state.award.id,'ADV_AWARD_BINDING');evidenceRef(data.evidence,evidence);
   need(!state.review?.accepted,'ADV_CORRECTION_CLOSED');need(!state.correction||state.review?.correction===state.correction.id,'ADV_REVIEW_REQUIRED');
   state.correction={id:record.id,award:data.award,evidence:data.evidence};state.corrections.push(state.correction);state.review=null;
  }else if(type==='REVIEW'){
   shape(data,'agreement award correction evidence accepted');authority(record,a.customer);agreement(data,id);need(data.award===state.award.id,'ADV_AWARD_BINDING');need(state.correction&&data.correction===state.correction.id,'ADV_CORRECTION_BINDING');
   evidenceRef(data.evidence,evidence);need(typeof data.accepted==='boolean','ADV_REVIEW_BOOLEAN');need(!state.review,'ADV_DUPLICATE_REVIEW');
   state.review={id:record.id,award:data.award,correction:data.correction,evidence:data.evidence,accepted:data.accepted};state.reviews.push(state.review);
  }else if(type==='PAYMENT_REPORT'){
   shape(data,'agreement award amount currency evidence');authority(record,a.customer);agreement(data,id);need(data.award===state.award.id,'ADV_AWARD_BINDING');amount(data.amount);currency(data.currency);
   need(data.amount===state.award.providerAmount&&data.currency===state.award.currency,'ADV_PAYMENT_MISMATCH');evidenceRef(data.evidence,evidence);need(!state.paymentReport,'ADV_PAYMENT_REPORT_EXISTS');state.paymentReport={id:record.id,...data};
  }else{
   shape(data,'agreement award report evidence');authority(record,a.provider);agreement(data,id);need(data.award===state.award.id,'ADV_AWARD_BINDING');need(state.paymentReport,'ADV_PAYMENT_REPORT_MISSING');need(data.report===state.paymentReport.id,'ADV_PAYMENT_REPORT_BINDING');evidenceRef(data.evidence,evidence);need(!state.paymentAck,'ADV_PAYMENT_ACK_EXISTS');state.paymentAck={id:record.id,...data};
  }
  return;
 }
 need(!state.award,'ADV_AWARD_FINAL');
 if(type==='DELIVER'){
  shape(data,'agreement evidence');authority(record,a.provider);agreement(data,id);evidenceRef(data.evidence,evidence);need(!state.delivery,'ADV_DELIVERY_EXISTS');state.delivery={id:record.id,evidence:data.evidence};state.status='DELIVERY_RECORDED';
 }else if(type==='PROBLEM'){
  shape(data,'agreement evidence');authority(record,a.customer);agreement(data,id);evidenceRef(data.evidence,evidence);need(state.delivery,'ADV_DELIVERY_MISSING');need(!state.problem,'ADV_PROBLEM_EXISTS');state.problem={id:record.id,evidence:data.evidence};state.status='PROBLEM_RECORDED';
 }else if(type==='AWARD'){
  shape(data,'agreement delivery problem evidence providerBps reason providerDuty customerDuty');authority(record,a.arbitrator);agreement(data,id);need(state.delivery&&state.problem,'ADV_AWARD_EVIDENCE');
  need(data.delivery===state.delivery.id&&data.problem===state.problem.id,'ADV_AWARD_BINDING');need(Array.isArray(data.evidence)&&data.evidence.length>=1&&data.evidence.length<=16&&new Set(data.evidence).size===data.evidence.length,'ADV_AWARD_EVIDENCE');
  for(const item of data.evidence)evidenceRef(item,evidence);need(data.evidence.includes(state.delivery.evidence)&&data.evidence.includes(state.problem.evidence),'ADV_AWARD_EVIDENCE');
  uint(data.providerBps,10000);need(data.providerBps>0&&data.providerBps<10000,'ADV_PARTIAL_AWARD');for(const name of ['reason','providerDuty','customerDuty'])text(data[name]);
  const providerAmount=Number(BigInt(t.amount)*BigInt(data.providerBps)/10000n),customerAmount=t.amount-providerAmount;
  need(providerAmount>0&&customerAmount>0,'ADV_PARTIAL_AWARD');state.award={id:record.id,...data,providerAmount,customerAmount,currency:t.currency,rounding:'FLOOR_PROVIDER_REMAINDER_CUSTOMER'};state.status='PARTIAL_AWARD_RECORDED';
 }else need(false,'ADV_ACTION');
}

function followup(state){
 if(!state.award)return;
 const work_status=!state.correction?'CORRECTION_REQUIRED':!state.review?'AWAITING_CUSTOMER_REVIEW':state.review.accepted?'CORRECTION_ACCEPTED':'CORRECTION_REJECTED';
 const payment_status=state.paymentAck?'ACKNOWLEDGED_BY_PROVIDER':state.paymentReport?'REPORTED_BY_CUSTOMER':'REPORT_REQUIRED';
 const outstanding=[];if(!state.correction||state.review&&!state.review.accepted)outstanding.push('provider_correction');else if(!state.review)outstanding.push('customer_review');if(!state.paymentReport)outstanding.push('customer_payment_report');
 state.followup={work_status,payment_status,outstanding,optional:state.paymentReport&&!state.paymentAck?['provider_payment_ack']:[],performance_verified:false,payment_verified:false};
 if(state.correction||state.paymentReport)state.status=outstanding.length?'FOLLOWUP_REQUIRED':'FOLLOWUP_CLAIMS_RECORDED';
}

export async function inspect(input,{expectedId=null,now=nowSeconds()}={}){
 // Snapshot before the first await so concurrent caller mutation cannot change
 // the bytes checked halfway through validation.
 const log=copy(input);time(now);shape(log,'format body id records evidence');need(log.format===FORMAT,'ADV_FORMAT');await manifest(log.body);hash(log.id);need(await manifestId(log.body)===log.id,'ADV_TERMS_CHANGED');
 need(log.body.created<=now+60,'ADV_FUTURE_TIME');need(Array.isArray(log.records)&&log.records.length<=MAX_RECORDS,'ADV_RECORD_LIMIT');need(Array.isArray(log.evidence)&&log.evidence.length<=32,'ADV_EVIDENCE_LIMIT');
 const evidence=new Set();for(const item of log.evidence){shape(item,'sha256 text');hash(item.sha256);unicode(item.text);need(!evidence.has(item.sha256),'ADV_DUPLICATE_EVIDENCE');need(await P.contentHash(item.text)===item.sha256,'ADV_EVIDENCE_CHANGED');evidence.add(item.sha256);}
 const {kind,actors:a,terms:t}=log.body;
 const declaredRule=log.body.revisionRule??'ADDITIONAL_PROPOSAL';
 const state={profile:PROFILE,kind,termsId:log.id,head:log.id,status:'DRAFT',approved:[],records:log.records.length,events:[],grant:null,spent:0,remaining:t.budget??null,request:null,bids:[],selected:null,contract:null,contractApproved:false,delivery:null,problem:null,award:null,
  correction:null,review:null,corrections:[],reviews:[],paymentReport:null,paymentAck:null,followup:null,
  previousRecord:log.body.previousRecord??null,history_status:log.body.previousRecord?'PARENT_NOT_INCLUDED':'INITIAL_RECORD',prior_obligations_cancelled:false,
  declared_revision_rule:declaredRule,revision_rule_text:REVISION_RULE_TEXT[declaredRule],replacement_agreed:false,replacement_approval_complete:false,past_work_or_payment_claims_released:false,past_claims_determined:false,legal_effect_certified:false,
  payment_verified:false,performance_verified:false,delivery_quality_verified:false,execution_authorized:false,funds_reserved:false,identity:'EPHEMERAL_SAMPLE_KEY_SIGNATURES_ONLY',clock:CLOCK,latest_version_known:false};
 const seen=new Set();let last=log.body.created;
 for(let i=0;i<log.records.length;i++){
  const record=log.records[i];shape(record,'id body signer signature');shape(record.body,'profile workflow previous index at type data');const b=record.body;
  hash(record.id);hash(record.signer);need(!seen.has(record.id),'ADV_DUPLICATE_RECORD');need(b.profile===PROFILE&&b.workflow===log.id,'ADV_WORKFLOW_BINDING');need(b.previous===state.head&&b.index===i,'ADV_CHAIN');time(b.at);need(b.at>=last&&b.at<=now+60,'ADV_TIME_ORDER');last=b.at;text(b.type,40);
  need(plain(b.data),'ADV_OBJECT');await verify(record.signer,LABEL+'-RECORD',b,record.signature);need(await recordId({body:b,signer:record.signer,signature:record.signature})===record.id,'ADV_RECORD_CHANGED');
  if(kind==='delegation')delegation(state,record,t,a,log.id);
  else if(kind==='multiparty'){need(b.type==='APPROVE','ADV_ACTION');approval(state,record,log.id,a);}
  else if(kind==='quotes')quotes(state,record,t,a,log.id);
  else arbitration(state,record,t,a,log.id,evidence);
  state.head=record.id;state.events.push({id:record.id,type:b.type,signer:record.signer,at:b.at});seen.add(record.id);
 }
 state.approved.sort();state.includedEvidence=evidence.size;
 state.replacement_approval_complete=kind==='multiparty'&&declaredRule==='REPLACE_REMAINING_TERMS'&&state.approved.length===Object.keys(a).length;
 followup(state);
 if(kind==='delegation'&&state.grant){state.grant.usableNow=!state.grant.revoked&&now<t.expires;state.grant.expiredNow=now>=t.expires;if(state.grant.expiredNow&&!state.grant.revoked)state.status='EXPIRED';}
 state.recordCode=await digest(LABEL+'-SNAPSHOT',log);
 if(expectedId!==null){hash(expectedId);need(expectedId===state.recordCode,'ADV_PIN_MISMATCH');}
 return frozen(state);
}

export async function act(input,who,type,data={},at=nowSeconds()){
 const log=copy(input),value=copy(data);const state=await inspect(log);need(who&&typeof who.public==='string'&&who.private,'ADV_SIGNING_KEY');time(at);
 const now=nowSeconds();need(at>=now-60&&at<=now+60,'ADV_LIVE_TIME');
 if(log.body.kind==='delegation'&&['GRANT','SPEND'].includes(type))need(now<log.body.terms.expires,'ADV_GRANT_EXPIRED');
 if(log.body.kind==='quotes'){
  need(now<log.body.terms.expires,'ADV_REQUEST_EXPIRED');
  if(['CONTRACT','CONTRACT_APPROVE'].includes(type)&&state.selected)need(now<state.selected.validUntil,'ADV_BID_EXPIRED');
  if(type==='SELECT'){const bid=state.bids.find(item=>item.id===value.bid);if(bid)need(now<bid.validUntil,'ADV_BID_EXPIRED');}
 }
 const body={profile:PROFILE,workflow:log.id,previous:state.head,index:log.records.length,at,type,data:value};
 const record={body,signer:who.public,signature:await sign(who.private,LABEL+'-RECORD',body)};record.id=await recordId(record);log.records.push(record);await inspect(log);return frozen(log);
}
export async function attachEvidence(input,value){
 const log=copy(input);await inspect(log);text(value,32768);const sha256=await P.contentHash(value);need(!log.evidence.some(item=>item.sha256===sha256),'ADV_DUPLICATE_EVIDENCE');log.evidence.push({sha256,text:value});await inspect(log);return {log:frozen(log),sha256};
}
export async function exportLog(input){const log=copy(input);await inspect(log);const raw=JSON.stringify(log,null,2);need(encoder.encode(raw).length<=LIMIT,'INPUT_LIMIT');return raw;}
export async function importLog(raw,options={}){const log=P.parseJSON(raw),state=await inspect(log,options);return {log:frozen(log),state};}

// A portable history pins every earlier signed snapshot. A unanimous, explicitly
// declared replacement affects only the demo's remaining scope and price. It
// never releases or decides past work/payment claims or certifies legal effect.
export async function inspectHistory(input,{expectedId=null,now=nowSeconds()}={}){
 const bundle=copy(input);shape(bundle,'format selected logs');need(bundle.format===FORMAT_HISTORY,'ADV_HISTORY_FORMAT');
 need(Array.isArray(bundle.logs)&&bundle.logs.length>=1&&bundle.logs.length<=16,'ADV_HISTORY_LIMIT');hash(bundle.selected);
 const states=[],ids=new Set(),replacementEffects=[];let previous=null,kind=null,actors=null,created=0,declaredRemainingTerms=[];
 for(const log of bundle.logs){
  const state=await inspect(log,{now});need(!ids.has(log.id),'ADV_HISTORY_DUPLICATE');ids.add(log.id);
  if(kind===null){kind=log.body.kind;actors=canonical(log.body.actors);}else need(log.body.kind===kind&&canonical(log.body.actors)===actors,'ADV_HISTORY_ACTORS');
  need((log.body.previousRecord??null)===previous,'ADV_HISTORY_PARENT');need(log.body.created>=created,'ADV_HISTORY_ORDER');
  created=log.body.created;previous=state.recordCode;
  const replacement_agreed=state.replacement_approval_complete;
  if(replacement_agreed){
   const effect={replacement_terms_id:log.id,parent_record_code:log.body.previousRecord,replaces_remaining_terms_of:states.map(prior=>prior.termsId),scope:'REMAINING_SCOPE_AND_PRICE_ONLY',past_work_or_payment_claims_released:false,past_claims_determined:false,legal_effect_certified:false};
   replacementEffects.push(effect);for(const prior of states)prior.remaining_terms_replaced_by=log.id;
  }
  if(kind==='multiparty'&&state.status==='AGREED')declaredRemainingTerms=replacement_agreed?[log.id]:[...declaredRemainingTerms,log.id];
  states.push({...state,replacement_agreed,remaining_terms_replaced_by:null,history_status:'COMPLETE_INCLUDED_HISTORY',history_index:states.length});
 }
 need(bundle.selected===bundle.logs.at(-1).id,'ADV_HISTORY_SELECTED');
 const recordCode=await digest(LABEL+'-HISTORY-SNAPSHOT',bundle);if(expectedId!==null){hash(expectedId);need(expectedId===recordCode,'ADV_PIN_MISMATCH');}
 const selected=states.at(-1);
 return frozen({format:FORMAT_HISTORY,kind,count:states.length,recordCode,selected,results:states,history_status:'COMPLETE_INCLUDED_HISTORY',latest_version_known:false,prior_obligations_cancelled:false,declared_revision_rule:selected.declared_revision_rule,replacement_agreed:selected.replacement_agreed,replacement_effects:replacementEffects,latest_agreed_replacement_id:replacementEffects.at(-1)?.replacement_terms_id??null,declared_remaining_terms_ids:declaredRemainingTerms,past_work_or_payment_claims_released:false,past_claims_determined:false,legal_effect_certified:false});
}
export async function exportHistory(input){const bundle=copy(input);await inspectHistory(bundle);const raw=JSON.stringify(bundle,null,2);need(encoder.encode(raw).length<=LIMIT,'INPUT_LIMIT');return raw;}
export async function importHistory(raw,options={}){const bundle=P.parseJSON(raw),state=await inspectHistory(bundle,options);return {bundle:frozen(bundle),state};}
