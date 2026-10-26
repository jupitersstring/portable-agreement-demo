/* SPDX-License-Identifier: MIT */
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import * as A from '../site/advanced-protocol.mjs';
import * as P from '../site/protocol.mjs';

const code=name=>error=>error.code===name;
const clone=structuredClone;
const now=()=>Math.floor(Date.now()/1000);
const later=()=>now()+3600;
async function identities(names){const out={};for(const name of names.split(' '))out[name]=await A.identity();return out;}
const publicActors=keys=>Object.fromEntries(Object.entries(keys).map(([name,key])=>[name,key.public]));
async function delegation(){const keys=await identities('owner delegate provider');const log=await A.create({kind:'delegation',actors:publicActors(keys),terms:{budget:10000,currency:'GBP',purpose:'Independent research — café supply',expires:later()}});return {keys,log};}
async function multiparty(){const keys=await identities('customer provider reviewer');const log=await A.create({kind:'multiparty',actors:publicActors(keys),terms:{title:'Three people approve one version',description:'Two-page research and a review.',amount:10001,currency:'GBP',deadline:later()}});return {keys,log};}
async function quotes(){const keys=await identities('customer bidderA bidderB');let log=await A.create({kind:'quotes',actors:publicActors(keys),terms:{title:'Research request',purpose:'Source a short report',currency:'GBP',budget:10000,expires:later()}});log=await A.act(log,keys.customer,'REQUEST');return {keys,log};}
const bid=(log,amount=6500)=>({request:log.id,amount,currency:'GBP',description:'Two pages, three sources — exact terms.',validUntil:log.body.terms.expires-60,bidNonce:A.nonce()});
async function arbitration(){const keys=await identities('customer provider arbitrator');let log=await A.create({kind:'arbitration',actors:publicActors(keys),terms:{title:'Research and review',description:'Deliver the agreed report.',amount:10001,currency:'GBP',deadline:later(),providerDuty:'Finish the appendix.',customerDuty:'Review the corrected appendix.',rules:'The named reviewer may record one partial award, with both evidence notes and remaining duties; no real transfer.'}});return {keys,log};}
async function approveAll(log,keys){for(const key of Object.values(keys))log=await A.act(log,key,'APPROVE',{agreement:log.id});return log;}
async function disputed(){const x=await arbitration();x.log=await approveAll(x.log,x.keys);let added=await A.attachEvidence(x.log,'Supplier delivery: report and appendix attached.');x.log=await A.act(added.log,x.keys.provider,'DELIVER',{agreement:x.log.id,evidence:added.sha256});added=await A.attachEvidence(x.log,'Customer problem: two citations are missing.');x.log=await A.act(added.log,x.keys.customer,'PROBLEM',{agreement:x.log.id,evidence:added.sha256});return x;}
function award(log,state,providerBps=6750){return {agreement:log.id,delivery:state.delivery.id,problem:state.problem.id,evidence:[state.delivery.evidence,state.problem.evidence],providerBps,reason:'Two citations require correction.',providerDuty:'Supply the two missing citations.',customerDuty:'Review the two corrected citations.'};}
// Deliberately bypass the action API to prove imported, freshly signed attacks
// are rejected by the independent verifier rather than just by UI affordances.
async function forge(log,who,type,data={},at=now()){
 const out=clone(log),body={profile:A.PROFILE,workflow:out.id,previous:out.records.at(-1)?.id??out.id,index:out.records.length,at,type,data};
 const record={body,signer:who.public,signature:await P.signature(who.private,A.LABEL+'-RECORD',A.signingFrame(body))};record.id=await A.recordId(record);out.records.push(record);return out;
}

test('advanced profile uses exact Unicode and deterministic ASCII byte framing',async()=>{
 assert.equal(A.canonical({'2':'café 😀','10':'first',b:true,a:null}),'{'+'"10":"first","2":"caf\\u00e9 \\ud83d\\ude00","a":null,"b":true'+'}');
 assert.notEqual(A.canonical('é'),A.canonical('e\u0301'));assert.throws(()=>A.canonical('\ud800'),code('ADV_UNICODE'));
 assert.throws(()=>A.canonical({a:1.5}),code('INTEGER_RANGE'));assert.throws(()=>A.canonical({a:-0}),code('INTEGER_RANGE'));
 let called=false;const access={get value(){called=true;return 1;}};assert.throws(()=>A.canonical(access),code('ADV_ACCESSOR'));assert.equal(called,false);
 const x=await delegation(),state=await A.inspect(x.log);assert.equal(state.profile,A.PROFILE);assert.notEqual(A.PROFILE,P.PROFILE);assert.equal(state.payment_verified,false);assert.equal(state.execution_authorized,false);
});
test('owner grant and exact scoped spending preserve immutable old snapshots',async()=>{
 const {keys,log}=await delegation();const original=await A.exportLog(log);let next=await A.act(log,keys.owner,'GRANT');assert.equal((await A.inspect(next)).grant.usableNow,true);
 next=await A.act(next,keys.delegate,'SPEND',{amount:6500,currency:'GBP',purpose:log.body.terms.purpose,payee:keys.provider.public});const state=await A.inspect(next);
 assert.equal(state.spent,6500);assert.equal(state.remaining,3500);assert.equal(await A.exportLog(log),original);assert.equal(log.records.length,0);assert.equal(Object.isFrozen(next.records[0].body),true);
 assert.throws(()=>{next.body.terms.budget=20000;},TypeError);
});
test('delegation refuses unsigned authority, wrong currency, purpose, payee and overspending',async()=>{
 const {keys,log}=await delegation(),other=await A.identity();await assert.rejects(A.act(log,keys.delegate,'GRANT'),code('ADV_AUTHORITY'));
 const granted=await A.act(log,keys.owner,'GRANT'),good={amount:6500,currency:'GBP',purpose:log.body.terms.purpose,payee:keys.provider.public};
 await assert.rejects(A.inspect(await forge(granted,other,'SPEND',good)),code('ADV_AUTHORITY'));
 for(const changed of [{currency:'USD'},{purpose:'Unrelated work'},{payee:other.public}])await assert.rejects(A.act(granted,keys.delegate,'SPEND',{...good,...changed}),code('ADV_GRANT_SCOPE'));
 const spent=await A.act(granted,keys.delegate,'SPEND',good);await assert.rejects(A.act(spent,keys.delegate,'SPEND',{...good,amount:3501}),code('ADV_GRANT_BUDGET'));
 await assert.rejects(A.act(granted,keys.provider,'SPEND',good),code('ADV_AUTHORITY'));assert.equal(granted.records.length,1);
});
test('revocation is owner-only and blocks later valid delegate signatures',async()=>{
 const {keys,log}=await delegation();let next=await A.act(log,keys.owner,'GRANT');await assert.rejects(A.act(next,keys.delegate,'REVOKE'),code('ADV_AUTHORITY'));
 next=await A.act(next,keys.owner,'REVOKE');const state=await A.inspect(next);assert.equal(state.status,'REVOKED');assert.equal(state.grant.usableNow,false);
 const malicious=await forge(next,keys.delegate,'SPEND',{amount:1,currency:'GBP',purpose:log.body.terms.purpose,payee:keys.provider.public});await assert.rejects(A.inspect(malicious),code('ADV_GRANT_INACTIVE'));
});
test('historic expiry is distinguished from signature validity; expired live actions fail',async()=>{
 const {keys}=await delegation(),at=now()-100;
 const body={profile:A.PROFILE,kind:'delegation',nonce:A.nonce(),created:at,clock:'SELF_DECLARED_UNIX_SECONDS',actors:publicActors(keys),terms:{budget:10000,currency:'GBP',purpose:'Historic sample',expires:at+50}};
 let log={format:A.FORMAT,body,id:await A.manifestId(body),records:[],evidence:[]};log=await forge(log,keys.owner,'GRANT',{},at+1);
 const state=await A.inspect(log);assert.equal(state.status,'EXPIRED');assert.equal(state.grant.expiredNow,true);assert.equal(state.grant.usableNow,false);
 await assert.rejects(A.act(log,keys.delegate,'SPEND',{amount:100,currency:'GBP',purpose:'Historic sample',payee:keys.provider.public},at+2),code('ADV_LIVE_TIME'));
 await assert.rejects(A.inspect(await forge(log,keys.delegate,'SPEND',{amount:100,currency:'GBP',purpose:'Historic sample',payee:keys.provider.public},at+51)),code('ADV_GRANT_EXPIRED'));
});
test('multiparty contract needs every required exact approval and has no payment effect',async()=>{
 const {keys,log}=await multiparty();let next=await A.act(log,keys.customer,'APPROVE',{agreement:log.id});next=await A.act(next,keys.provider,'APPROVE',{agreement:log.id});assert.equal((await A.inspect(next)).status,'AWAITING_APPROVALS');
 await assert.rejects(A.act(next,keys.customer,'APPROVE',{agreement:log.id}),code('ADV_DUPLICATE_APPROVAL'));
 const other=await A.identity();await assert.rejects(A.inspect(await forge(next,other,'APPROVE',{agreement:log.id})),code('ADV_AUTHORITY'));
 next=await A.act(next,keys.reviewer,'APPROVE',{agreement:log.id});const state=await A.inspect(next);assert.equal(state.status,'AGREED');assert.equal(state.approved.length,3);assert.equal(state.funds_reserved,false);
});
test('changed terms invalidate the terms identifier and all prior approvals',async()=>{
 const {keys,log}=await multiparty(),signed=await approveAll(log,keys),changed=clone(signed);changed.body.terms.amount++;
 await assert.rejects(A.inspect(changed),code('ADV_TERMS_CHANGED'));changed.id=await A.manifestId(changed.body);await assert.rejects(A.inspect(changed),code('ADV_WORKFLOW_BINDING'));
 let revised=await A.create({kind:'multiparty',actors:log.body.actors,terms:{...log.body.terms,amount:10002}});assert.equal((await A.inspect(revised)).approved.length,0);assert.equal((await A.inspect(signed)).status,'AGREED');
 await assert.rejects(A.act(revised,keys.customer,'APPROVE',{agreement:signed.id}),code('ADV_AGREEMENT_CHANGED'));
});
test('signed bids, selection and customer contract require a separate selected supplier approval',async()=>{
 const {keys,log}=await quotes();let next=await A.act(log,keys.bidderA,'BID',bid(log));next=await A.act(next,keys.bidderB,'BID',bid(log,7200));let state=await A.inspect(next);assert.equal(state.status,'BIDS_RECEIVED');assert.equal(state.contract,null);
 next=await A.act(next,keys.customer,'SELECT',{bid:state.bids[0].id});state=await A.inspect(next);assert.equal(state.status,'SELECTED_ONLY');assert.equal(state.contractApproved,false);
 next=await A.act(next,keys.customer,'CONTRACT',{bid:state.selected.id});state=await A.inspect(next);assert.equal(state.status,'AWAITING_SUPPLIER');assert.equal(state.contract.terms.amount,6500);
 await assert.rejects(A.act(next,keys.bidderB,'CONTRACT_APPROVE',{agreement:state.contract.id}),code('ADV_AUTHORITY'));
 next=await A.act(next,keys.bidderA,'CONTRACT_APPROVE',{agreement:state.contract.id});state=await A.inspect(next);assert.equal(state.status,'AGREED');assert.equal(state.contractApproved,true);assert.equal(state.payment_verified,false);
});
test('quotes reject duplicate bids, non-bidders, unknown selection and changed selection binding',async()=>{
 const {keys,log}=await quotes(),first=bid(log);let next=await A.act(log,keys.bidderA,'BID',first);const selected=(await A.inspect(next)).bids[0];
 await assert.rejects(A.act(next,keys.bidderA,'BID',bid(log)),code('ADV_DUPLICATE_BID'));await assert.rejects(A.act(next,keys.bidderB,'BID',{...first,amount:6200}),code('ADV_DUPLICATE_BID'));
 await assert.rejects(A.act(next,keys.customer,'BID',bid(log)),code('ADV_AUTHORITY'));await assert.rejects(A.act(next,keys.bidderA,'SELECT',{bid:selected.id}),code('ADV_AUTHORITY'));
 await assert.rejects(A.act(next,keys.customer,'SELECT',{bid:'a'.repeat(64)}),code('ADV_BID_UNKNOWN'));
 next=await A.act(next,keys.customer,'SELECT',{bid:selected.id});await assert.rejects(A.act(next,keys.customer,'CONTRACT',{bid:'b'.repeat(64)}),code('ADV_SELECTED_BID_BINDING'));
 await assert.rejects(A.act(next,keys.customer,'SELECT',{bid:selected.id}),code('ADV_DUPLICATE_SELECTION'));await assert.rejects(A.act(next,keys.bidderB,'BID',bid(log)),code('ADV_SELECTION_FINAL'));
});
test('quote signatures bind the exact workflow, request, currency and validity',async()=>{
 const {keys,log}=await quotes(),bad=bid(log);bad.request='f'.repeat(64);await assert.rejects(A.inspect(await forge(log,keys.bidderA,'BID',bad)),code('ADV_REQUEST_BINDING'));
 await assert.rejects(A.act(log,keys.bidderA,'BID',{...bid(log),currency:'USD'}),code('ADV_BID_SCOPE'));
 await assert.rejects(A.act(log,keys.bidderA,'BID',{...bid(log),amount:10001}),code('ADV_BID_SCOPE'));
 await assert.rejects(A.act(log,keys.bidderA,'BID',{...bid(log),validUntil:now()-1}),code('ADV_BID_EXPIRED'));
 const signed=await A.act(log,keys.bidderA,'BID',bid(log)),other=await A.create({kind:'quotes',actors:log.body.actors,terms:log.body.terms});const replay=clone(other);replay.records=clone(signed.records);await assert.rejects(A.inspect(replay),code('ADV_WORKFLOW_BINDING'));
});
test('arbitration requires agreed appointment/rules, complete approvals and delivery before a problem',async()=>{
 const {keys,log}=await arbitration();let added=await A.attachEvidence(log,'Delivery note');await assert.rejects(A.act(added.log,keys.provider,'DELIVER',{agreement:log.id,evidence:added.sha256}),code('ADV_APPROVALS_MISSING'));
 let approved=await approveAll(log,keys);added=await A.attachEvidence(approved,'Problem first');await assert.rejects(A.act(added.log,keys.customer,'PROBLEM',{agreement:log.id,evidence:added.sha256}),code('ADV_DELIVERY_MISSING'));
 const changed=clone(approved);changed.body.terms.rules='Different review rules';await assert.rejects(A.inspect(changed),code('ADV_TERMS_CHANGED'));
});
test('delivery/problem records require correct signers and exact available evidence',async()=>{
 const {keys,log}=await arbitration(),approved=await approveAll(log,keys);await assert.rejects(A.act(approved,keys.provider,'DELIVER',{agreement:log.id,evidence:'a'.repeat(64)}),code('ADV_EVIDENCE_MISSING'));
 const added=await A.attachEvidence(approved,'Delivery record');await assert.rejects(A.act(added.log,keys.customer,'DELIVER',{agreement:log.id,evidence:added.sha256}),code('ADV_AUTHORITY'));
 const delivered=await A.act(added.log,keys.provider,'DELIVER',{agreement:log.id,evidence:added.sha256});await assert.rejects(A.act(delivered,keys.provider,'PROBLEM',{agreement:log.id,evidence:added.sha256}),code('ADV_AUTHORITY'));
});
test('signed partial award uses exact integer arithmetic, links and remaining duties',async()=>{
 const {keys,log}=await disputed(),state=await A.inspect(log);const next=await A.act(log,keys.arbitrator,'AWARD',award(log,state));const result=await A.inspect(next);
 assert.equal(result.status,'PARTIAL_AWARD_RECORDED');assert.equal(result.award.providerAmount,6750);assert.equal(result.award.customerAmount,3251);assert.equal(result.award.providerAmount+result.award.customerAmount,10001);
 assert.equal(result.award.providerDuty,'Supply the two missing citations.');assert.equal(result.award.customerDuty,'Review the two corrected citations.');assert.equal(result.payment_verified,false);assert.equal(result.execution_authorized,false);
 await assert.rejects(A.act(next,keys.arbitrator,'AWARD',award(log,state)),code('ADV_AWARD_FINAL'));assert.equal(log.records.length,5);
});
test('arbitration rejects unauthorized, missing-evidence and incorrectly bound awards even when signed',async()=>{
 const {keys,log}=await disputed(),state=await A.inspect(log),good=award(log,state);await assert.rejects(A.inspect(await forge(log,keys.customer,'AWARD',good)),code('ADV_AUTHORITY'));
 await assert.rejects(A.act(log,keys.arbitrator,'AWARD',{...good,evidence:[state.delivery.evidence]}),code('ADV_AWARD_EVIDENCE'));
 await assert.rejects(A.act(log,keys.arbitrator,'AWARD',{...good,problem:'f'.repeat(64)}),code('ADV_AWARD_BINDING'));
 await assert.rejects(A.act(log,keys.arbitrator,'AWARD',{...good,agreement:'f'.repeat(64)}),code('ADV_AGREEMENT_CHANGED'));
 await assert.rejects(A.act(log,keys.arbitrator,'AWARD',{...good,providerBps:6750.5}),code('INTEGER_RANGE'));
 for(const bps of [0,10000])await assert.rejects(A.act(log,keys.arbitrator,'AWARD',{...good,providerBps:bps}),code('ADV_PARTIAL_AWARD'));
 const omitted=clone(log);omitted.evidence.pop();await assert.rejects(A.inspect(omitted),code('ADV_EVIDENCE_MISSING'));
});
test('record pin commits to the entire history and evidence, and detects tail truncation',async()=>{
 const {keys,log}=await delegation();let next=await A.act(log,keys.owner,'GRANT');const priorCode=(await A.inspect(next)).recordCode;next=await A.act(next,keys.owner,'REVOKE');const state=await A.inspect(next);assert.notEqual(state.recordCode,priorCode);
 const truncated=clone(next);truncated.records.pop();assert.equal((await A.inspect(truncated)).status,'ACTIVE');await assert.rejects(A.importLog(JSON.stringify(truncated),{expectedId:state.recordCode}),code('ADV_PIN_MISMATCH'));
 const added=await A.attachEvidence(next,'Plaintext note');assert.notEqual((await A.inspect(added.log)).recordCode,state.recordCode);await assert.rejects(A.inspect(added.log,{expectedId:state.recordCode}),code('ADV_PIN_MISMATCH'));
 assert.equal((await A.importLog(await A.exportLog(next),{expectedId:state.recordCode})).state.status,'REVOKED');assert.equal(state.latest_version_known,false);
});
test('changed, reordered, replayed and truncated signed records fail closed',async()=>{
 const {keys,log}=await delegation();let next=await A.act(log,keys.owner,'GRANT');next=await A.act(next,keys.delegate,'SPEND',{amount:100,currency:'GBP',purpose:log.body.terms.purpose,payee:keys.provider.public});
 let bad=clone(next);bad.records.reverse();await assert.rejects(A.inspect(bad),code('ADV_CHAIN'));
 bad=clone(next);bad.records.push(clone(bad.records[0]));await assert.rejects(A.inspect(bad),code('ADV_DUPLICATE_RECORD'));
 bad=clone(next);bad.records[1].body.data.amount=9000;await assert.rejects(A.inspect(bad),code('SIGNATURE'));
 bad=clone(next);bad.records[1].id='a'.repeat(64);await assert.rejects(A.inspect(bad),code('ADV_RECORD_CHANGED'));
 bad=clone(next);bad.records.shift();await assert.rejects(A.inspect(bad),code('ADV_CHAIN'));
 bad=await forge(next,keys.owner,'REVOKE',{},next.records[0].body.at-1);await assert.rejects(A.inspect(bad),code('ADV_TIME_ORDER'));
});
test('export/import preserves public signatures and exact Unicode, never private signing keys',async()=>{
 const {keys,log}=await multiparty(),signed=await approveAll(log,keys),added=await A.attachEvidence(signed,'A café note — 日本語 😀');const raw=await A.exportLog(added.log);assert.equal(raw.includes('private'),false);assert.equal(raw.includes('CryptoKey'),false);assert.equal(keys.customer.private.extractable,false);
 const imported=await A.importLog(raw,{expectedId:(await A.inspect(added.log)).recordCode});assert.equal(imported.state.status,'AGREED');assert.equal(imported.log.evidence[0].text,'A café note — 日本語 😀');assert.equal(Object.isFrozen(imported.log),true);
 const changed=clone(imported.log);changed.evidence[0].text+='!';await assert.rejects(A.inspect(changed),code('ADV_EVIDENCE_CHANGED'));
 const extra=clone(signed);extra.privateKey='fake-secret';await assert.rejects(A.exportLog(extra),code('FIELDS'));
});
test('malicious JSON, malformed Unicode, hostile keys and oversized data are refused',async()=>{
 await assert.rejects(A.importLog('{"format":"one","format":"two"}'),code('DUPLICATE_KEY'));
 await assert.rejects(A.importLog('{"value":1e3}'),code('NONINTEGER_NUMBER'));await assert.rejects(A.importLog('{"value":-0}'),code('INTEGER_RANGE'));
 await assert.rejects(A.importLog(' '.repeat(A.LIMIT+1)),code('INPUT_LIMIT'));await assert.rejects(A.importLog('['.repeat(30)+'0'+']'.repeat(30)),code('DEMO_STRUCTURE_LIMIT'));
 await assert.rejects(A.importLog('{"__proto__":{"polluted":true}}'),code('FIELDS'));assert.equal({}.polluted,undefined);
 const {keys,log}=await delegation(),bad=clone(log);bad.body.terms.purpose='\udfff';await assert.rejects(A.inspect(bad),code('ADV_UNICODE'));
 bad.body.terms.purpose='x'.repeat(64001);await assert.rejects(A.inspect(bad),code('ADV_TEXT_LIMIT'));
 const actors=publicActors(keys);actors.provider='00'.repeat(32);await assert.rejects(A.create({kind:'delegation',actors,terms:log.body.terms}),code('PUBLIC_KEY'));
 await assert.rejects(A.act(log,keys.owner,'GRANT',{execution_authorized:true}),code('FIELDS'));
});
test('large valid snapshots use bounded canonical chunks rather than one oversized signing string',async()=>{
 const {log}=await multiparty();let next=log;
 for(let i=0;i<3;i++)next=(await A.attachEvidence(next,'Evidence '+i+' '+'x'.repeat(25000))).log;
 const raw=await A.exportLog(next);assert.ok(raw.length>64000);assert.equal((await A.importLog(raw)).state.includedEvidence,3);
 assert.ok(A.signingFrame(next).canonical_json_chunks.every(chunk=>chunk.length<=16000));
});
test('quote selection can change before contract; the contract binds the final choice',async()=>{
 const {keys,log}=await quotes();let next=await A.act(log,keys.bidderA,'BID',bid(log));next=await A.act(next,keys.bidderB,'BID',bid(log,7200));const bids=(await A.inspect(next)).bids;
 next=await A.act(next,keys.customer,'SELECT',{bid:bids[0].id});next=await A.act(next,keys.customer,'SELECT',{bid:bids[1].id});assert.equal((await A.inspect(next)).selected.id,bids[1].id);
 await assert.rejects(A.act(next,keys.customer,'CONTRACT',{bid:bids[0].id}),code('ADV_SELECTED_BID_BINDING'));
 next=await A.act(next,keys.customer,'CONTRACT',{bid:bids[1].id});await assert.rejects(A.act(next,keys.customer,'SELECT',{bid:bids[0].id}),code('ADV_SELECTION_FINAL'));
});
test('separate command-line verifier accepts complete pinned records and rejects a truncated copy',async()=>{
 const {keys,log}=await delegation();let next=await A.act(log,keys.owner,'GRANT');next=await A.act(next,keys.owner,'REVOKE');const state=await A.inspect(next),dir=await mkdtemp(join(tmpdir(),'advanced-record-')),file=join(dir,'record.json'),cli=fileURLToPath(new URL('../verify_advanced_record.mjs',import.meta.url));
 try{
  await writeFile(file,await A.exportLog(next));const result=JSON.parse(execFileSync(process.execPath,[cli,file,state.recordCode],{encoding:'utf8'}));assert.equal(result.status,'REVOKED');assert.equal(result.independent_fingerprint_supplied,true);assert.equal(result.payment_verified,false);
  const truncated=clone(next);truncated.records.pop();await writeFile(file,JSON.stringify(truncated));assert.throws(()=>execFileSync(process.execPath,[cli,file,state.recordCode],{stdio:'pipe'}),error=>error.status===1&&error.stderr.toString().includes('ADV_PIN_MISMATCH'));
 }finally{await rm(dir,{recursive:true,force:true});}
});
async function revisionHistory(){
 const {keys,log}=await multiparty(),original=await approveAll(log,keys),priorCode=(await A.inspect(original)).recordCode;
 let revised=await A.create({kind:'multiparty',actors:log.body.actors,terms:{...log.body.terms,amount:12001},previousRecord:priorCode});
 revised=await A.act(revised,keys.customer,'APPROVE',{agreement:revised.id});
 return {keys,original,revised,bundle:{format:A.FORMAT_HISTORY,selected:revised.id,logs:[original,revised]}};
}
test('portable histories retain every earlier exact approval while a revision seeks fresh approvals',async()=>{
 const {original,revised,bundle}=await revisionHistory(),before=await A.exportLog(original),state=await A.inspectHistory(bundle),raw=await A.exportHistory(bundle);
 assert.equal(state.count,2);assert.equal(state.results[0].status,'AGREED');assert.equal(state.results[0].approved.length,3);assert.equal(state.selected.status,'AWAITING_APPROVALS');assert.equal(state.selected.approved.length,1);
 assert.equal(state.selected.previousRecord,state.results[0].recordCode);assert.equal(state.history_status,'COMPLETE_INCLUDED_HISTORY');assert.equal(state.prior_obligations_cancelled,false);assert.equal(state.latest_version_known,false);
 const reopened=await A.importHistory(raw,{expectedId:state.recordCode});assert.equal(reopened.bundle.logs[0].body.terms.amount,10001);assert.equal(reopened.bundle.logs[1].body.terms.amount,12001);assert.equal(await A.exportLog(original),before);assert.equal(Object.isFrozen(reopened.bundle.logs[0]),true);
 assert.equal(revised.records.length,1);assert.notEqual(state.recordCode,state.selected.recordCode);
});
test('single revision exports remain verifiable and explicitly identify missing parent history',async()=>{
 const {revised}=await revisionHistory(),state=await A.inspect(revised),imported=await A.importLog(await A.exportLog(revised),{expectedId:state.recordCode});
 assert.equal(imported.state.history_status,'PARENT_NOT_INCLUDED');assert.match(imported.state.previousRecord,/^[0-9a-f]{64}$/);assert.equal(imported.state.prior_obligations_cancelled,false);
 const initial=await multiparty();assert.equal((await A.inspect(initial.log)).history_status,'INITIAL_RECORD');assert.equal(initial.log.body.previousRecord,null);
 const legacy=clone(initial.log);delete legacy.body.previousRecord;legacy.id=await A.manifestId(legacy.body);assert.equal((await A.inspect(legacy)).history_status,'INITIAL_RECORD');
 await assert.rejects(A.create({kind:'multiparty',actors:revised.body.actors,terms:revised.body.terms,previousRecord:'not-a-hash'}),code('ADV_HASH'));
});
test('history verification refuses missing, reordered, changed and incorrectly referenced parents',async()=>{
 const {bundle,original,revised}=await revisionHistory();let bad=clone(bundle);bad.logs.shift();await assert.rejects(A.inspectHistory(bad),code('ADV_HISTORY_PARENT'));
 bad=clone(bundle);bad.logs.reverse();bad.selected=original.id;await assert.rejects(A.inspectHistory(bad),code('ADV_HISTORY_PARENT'));
 bad=clone(bundle);bad.logs[0].body.terms.amount++;await assert.rejects(A.inspectHistory(bad),code('ADV_TERMS_CHANGED'));
 const wrong=await A.create({kind:'multiparty',actors:revised.body.actors,terms:revised.body.terms,previousRecord:'f'.repeat(64)});await assert.rejects(A.inspectHistory({format:A.FORMAT_HISTORY,selected:wrong.id,logs:[original,wrong]}),code('ADV_HISTORY_PARENT'));
});
test('revision parent binds the entire earlier signed snapshot including its approvals',async()=>{
 const {keys,log}=await multiparty();let prior=await A.act(log,keys.customer,'APPROVE',{agreement:log.id});const revised=await A.create({kind:'multiparty',actors:log.body.actors,terms:{...log.body.terms,amount:14000},previousRecord:(await A.inspect(prior)).recordCode});
 const bundle={format:A.FORMAT_HISTORY,selected:revised.id,logs:[prior,revised]};assert.equal((await A.inspectHistory(bundle)).count,2);
 prior=await A.act(prior,keys.provider,'APPROVE',{agreement:log.id});await assert.rejects(A.inspectHistory({...bundle,logs:[prior,revised]}),code('ADV_HISTORY_PARENT'));
});
test('portable histories refuse changed actor sets, duplicate versions and invalid selection',async()=>{
 const {original,revised,bundle}=await revisionHistory(),other=await A.identity();const changed=await A.create({kind:'multiparty',actors:{...revised.body.actors,provider:other.public},terms:revised.body.terms,previousRecord:(await A.inspect(original)).recordCode});
 await assert.rejects(A.inspectHistory({format:A.FORMAT_HISTORY,selected:changed.id,logs:[original,changed]}),code('ADV_HISTORY_ACTORS'));
 await assert.rejects(A.inspectHistory({format:A.FORMAT_HISTORY,selected:original.id,logs:[original,original]}),code('ADV_HISTORY_DUPLICATE'));
 await assert.rejects(A.inspectHistory({...bundle,selected:original.id}),code('ADV_HISTORY_SELECTED'));
 await assert.rejects(A.inspectHistory({...bundle,logs:Array(17).fill(original)}),code('ADV_HISTORY_LIMIT'));
});
test('history fingerprint pins every version and refuses valid later approvals under an old pin',async()=>{
 const {keys,revised,bundle}=await revisionHistory(),pin=(await A.inspectHistory(bundle)).recordCode;const accepted=await A.act(revised,keys.provider,'APPROVE',{agreement:revised.id}),updated={...bundle,selected:accepted.id,logs:[bundle.logs[0],accepted]};
 assert.equal((await A.inspectHistory(updated)).selected.approved.length,2);await assert.rejects(A.importHistory(await A.exportHistory(updated),{expectedId:pin}),code('ADV_PIN_MISMATCH'));
 const single={format:A.FORMAT_HISTORY,selected:bundle.logs[0].id,logs:[bundle.logs[0]]};await assert.rejects(A.importHistory(await A.exportHistory(single),{expectedId:pin}),code('ADV_PIN_MISMATCH'));
});
test('separate verifier checks complete revision histories and their portable snapshot pins',async()=>{
 const {bundle}=await revisionHistory(),state=await A.inspectHistory(bundle),dir=await mkdtemp(join(tmpdir(),'advanced-history-')),file=join(dir,'history.json'),cli=fileURLToPath(new URL('../verify_advanced_record.mjs',import.meta.url));
 try{
  await writeFile(file,await A.exportHistory(bundle));const result=JSON.parse(execFileSync(process.execPath,[cli,file,state.recordCode],{encoding:'utf8'}));assert.equal(result.version_count,2);assert.equal(result.signed_events,4);assert.equal(result.approvals,1);assert.equal(result.history_status,'COMPLETE_INCLUDED_HISTORY');assert.equal(result.prior_obligations_cancelled,false);
  const missing={...bundle,logs:[bundle.logs[1]]};await writeFile(file,JSON.stringify(missing));assert.throws(()=>execFileSync(process.execPath,[cli,file],{stdio:'pipe'}),error=>error.status===1&&error.stderr.toString().includes('ADV_HISTORY_PARENT'));
 }finally{await rm(dir,{recursive:true,force:true});}
});
async function awarded(){const x=await disputed();x.log=await A.act(x.log,x.keys.arbitrator,'AWARD',award(x.log,await A.inspect(x.log)));return x;}
async function withNote(log,who,type,data,note){const added=await A.attachEvidence(log,note);return A.act(added.log,who,type,{...data,evidence:added.sha256});}
const followupData=(log,state)=>({agreement:log.id,award:state.award.id});
test('a partial decision leaves correction/review and payment claims outstanding separately',async()=>{
 const {log}=await awarded(),state=await A.inspect(log);assert.equal(state.status,'PARTIAL_AWARD_RECORDED');assert.equal(state.followup.work_status,'CORRECTION_REQUIRED');assert.equal(state.followup.payment_status,'REPORT_REQUIRED');
 assert.deepEqual(state.followup.outstanding,['provider_correction','customer_payment_report']);assert.equal(state.followup.performance_verified,false);assert.equal(state.followup.payment_verified,false);assert.equal(state.execution_authorized,false);
});
test('correction rejection allows a later correction; acceptance closes further correction without erasing history',async()=>{
 const {keys,log}=await awarded(),start=await A.exportLog(log),base=followupData(log,await A.inspect(log));let next=await withNote(log,keys.provider,'CORRECTION',base,'First correction adds one citation.');let state=await A.inspect(next);const first=state.correction.id;
 assert.equal(state.followup.work_status,'AWAITING_CUSTOMER_REVIEW');next=await withNote(next,keys.customer,'REVIEW',{...base,correction:first,accepted:false},'Still missing the second citation.');state=await A.inspect(next);assert.equal(state.followup.work_status,'CORRECTION_REJECTED');
 const rejectedSnapshot=await A.exportLog(next);next=await withNote(next,keys.provider,'CORRECTION',base,'Second correction adds both citations.');state=await A.inspect(next);assert.equal(state.review,null);assert.equal(state.corrections.length,2);assert.equal(state.reviews.length,1);assert.equal(state.reviews[0].accepted,false);
 next=await withNote(next,keys.customer,'REVIEW',{...base,correction:state.correction.id,accepted:true},'Both corrected citations received and accepted.');state=await A.inspect(next);assert.equal(state.followup.work_status,'CORRECTION_ACCEPTED');assert.equal(state.reviews.length,2);assert.equal(state.followup.payment_status,'REPORT_REQUIRED');
 const added=await A.attachEvidence(next,'Unneeded third correction');await assert.rejects(A.act(added.log,keys.provider,'CORRECTION',{...base,evidence:added.sha256}),code('ADV_CORRECTION_CLOSED'));assert.equal(await A.exportLog(log),start);assert.ok(rejectedSnapshot.includes('Still missing the second citation.'));
});
test('followup actions refuse absent awards, wrong authorities and missing evidence even with fresh signatures',async()=>{
 const {keys,log}=await arbitration(),approved=await approveAll(log,keys),missing={agreement:log.id,award:'a'.repeat(64),evidence:'b'.repeat(64)};
 for(const type of ['CORRECTION','REVIEW','PAYMENT_REPORT','PAYMENT_ACK'])await assert.rejects(A.inspect(await forge(approved,keys.customer,type,missing)),code('ADV_AWARD_MISSING'));
 const x=await awarded(),state=await A.inspect(x.log),base=followupData(x.log,state),added=await A.attachEvidence(x.log,'Followup evidence.');
 await assert.rejects(A.inspect(await forge(added.log,x.keys.customer,'CORRECTION',{...base,evidence:added.sha256})),code('ADV_AUTHORITY'));
 await assert.rejects(A.act(x.log,x.keys.provider,'CORRECTION',{...base,evidence:'f'.repeat(64)}),code('ADV_EVIDENCE_MISSING'));
 await assert.rejects(A.act(added.log,x.keys.provider,'CORRECTION',{...base,award:'f'.repeat(64),evidence:added.sha256}),code('ADV_AWARD_BINDING'));
 await assert.rejects(A.act(added.log,x.keys.provider,'PAYMENT_REPORT',{...base,amount:state.award.providerAmount,currency:state.award.currency,evidence:added.sha256}),code('ADV_AUTHORITY'));
 await assert.rejects(A.act(added.log,x.keys.customer,'PAYMENT_ACK',{...base,report:'f'.repeat(64),evidence:added.sha256}),code('ADV_AUTHORITY'));
});
test('reviews require a strict boolean, latest correction, customer signature and one review per correction',async()=>{
 const {keys,log}=await awarded(),base=followupData(log,await A.inspect(log));let next=await withNote(log,keys.provider,'CORRECTION',base,'Corrected report version one.');let state=await A.inspect(next),added=await A.attachEvidence(next,'Review note for corrected report.');const data={...base,correction:state.correction.id,evidence:added.sha256};
 for(const accepted of [0,1,'false',null,[],{}])await assert.rejects(A.act(added.log,keys.customer,'REVIEW',{...data,accepted}),code('ADV_REVIEW_BOOLEAN'));
 await assert.rejects(A.act(added.log,keys.customer,'REVIEW',data),code('FIELDS'));await assert.rejects(A.inspect(await forge(added.log,keys.provider,'REVIEW',{...data,accepted:true})),code('ADV_AUTHORITY'));
 await assert.rejects(A.act(added.log,keys.customer,'REVIEW',{...data,correction:'f'.repeat(64),accepted:true}),code('ADV_CORRECTION_BINDING'));
 await assert.rejects(A.act(added.log,keys.provider,'CORRECTION',{...base,evidence:added.sha256}),code('ADV_REVIEW_REQUIRED'));
 next=await A.act(added.log,keys.customer,'REVIEW',{...data,accepted:false});await assert.rejects(A.act(next,keys.customer,'REVIEW',{...data,accepted:true}),code('ADV_DUPLICATE_REVIEW'));
 next=await withNote(next,keys.provider,'CORRECTION',base,'Corrected report version two.');await assert.rejects(A.act(next,keys.customer,'REVIEW',{...data,accepted:true}),code('ADV_CORRECTION_BINDING'));
});
test('exact payment report and optional provider acknowledgement remain separate caller claims',async()=>{
 const {keys,log}=await awarded(),state=await A.inspect(log),base=followupData(log,state);let next=await withNote(log,keys.customer,'PAYMENT_REPORT',{...base,amount:state.award.providerAmount,currency:state.award.currency},'Customer reports paying the exact award share.');let result=await A.inspect(next);
 assert.equal(result.followup.payment_status,'REPORTED_BY_CUSTOMER');assert.equal(result.followup.work_status,'CORRECTION_REQUIRED');assert.deepEqual(result.followup.optional,['provider_payment_ack']);assert.equal(result.status,'FOLLOWUP_REQUIRED');
 next=await withNote(next,keys.provider,'PAYMENT_ACK',{...base,report:result.paymentReport.id},'Provider acknowledges the customer payment report.');result=await A.inspect(next);assert.equal(result.followup.payment_status,'ACKNOWLEDGED_BY_PROVIDER');assert.equal(result.payment_verified,false);assert.equal(result.performance_verified,false);assert.equal(result.execution_authorized,false);assert.deepEqual(result.followup.outstanding,['provider_correction']);
});
test('payment reports and acknowledgements reject wrong amounts/currency/award/report/evidence and replay',async()=>{
 const {keys,log}=await awarded(),state=await A.inspect(log),base=followupData(log,state),added=await A.attachEvidence(log,'Payment report evidence.'),good={...base,amount:state.award.providerAmount,currency:state.award.currency,evidence:added.sha256};
 for(const changed of [{amount:state.award.providerAmount+1},{currency:'USD'}])await assert.rejects(A.act(added.log,keys.customer,'PAYMENT_REPORT',{...good,...changed}),code('ADV_PAYMENT_MISMATCH'));
 await assert.rejects(A.act(added.log,keys.customer,'PAYMENT_REPORT',{...good,evidence:'f'.repeat(64)}),code('ADV_EVIDENCE_MISSING'));
 await assert.rejects(A.act(added.log,keys.provider,'PAYMENT_ACK',{...base,report:'f'.repeat(64),evidence:added.sha256}),code('ADV_PAYMENT_REPORT_MISSING'));
 let next=await A.act(added.log,keys.customer,'PAYMENT_REPORT',good);await assert.rejects(A.act(next,keys.customer,'PAYMENT_REPORT',good),code('ADV_PAYMENT_REPORT_EXISTS'));
 const report=(await A.inspect(next)).paymentReport.id;await assert.rejects(A.act(next,keys.provider,'PAYMENT_ACK',{...base,report:'f'.repeat(64),evidence:added.sha256}),code('ADV_PAYMENT_REPORT_BINDING'));
 await assert.rejects(A.act(next,keys.provider,'PAYMENT_ACK',{...base,report,award:'f'.repeat(64),evidence:added.sha256}),code('ADV_AWARD_BINDING'));
 next=await A.act(next,keys.provider,'PAYMENT_ACK',{...base,report,evidence:added.sha256});await assert.rejects(A.act(next,keys.provider,'PAYMENT_ACK',{...base,report,evidence:added.sha256}),code('ADV_PAYMENT_ACK_EXISTS'));
});
test('accepted correction plus payment report records followup claims without declaring verified performance/payment',async()=>{
 const {keys,log}=await awarded(),base=followupData(log,await A.inspect(log));let next=await withNote(log,keys.provider,'CORRECTION',base,'Finished appendix.');let state=await A.inspect(next);
 next=await withNote(next,keys.customer,'REVIEW',{...base,correction:state.correction.id,accepted:true},'Accepted corrected appendix.');state=await A.inspect(next);
 next=await withNote(next,keys.customer,'PAYMENT_REPORT',{...base,amount:state.award.providerAmount,currency:state.award.currency},'Customer payment report.');state=await A.inspect(next);assert.equal(state.status,'FOLLOWUP_CLAIMS_RECORDED');assert.deepEqual(state.followup.outstanding,[]);assert.deepEqual(state.followup.optional,['provider_payment_ack']);assert.equal(state.payment_verified,false);assert.equal(state.performance_verified,false);
 const bundle={format:A.FORMAT_HISTORY,selected:next.id,logs:[next]},pin=(await A.inspectHistory(bundle)).recordCode;const reopened=await A.importHistory(await A.exportHistory(bundle),{expectedId:pin});assert.equal(reopened.state.selected.review.accepted,true);
 const truncated=clone(bundle);truncated.logs[0].records.pop();await assert.rejects(A.importHistory(JSON.stringify(truncated),{expectedId:pin}),code('ADV_PIN_MISMATCH'));
});
async function replacementHistory(approvalCount=3){
 const {keys,log}=await multiparty(),original=await approveAll(log,keys);let revised=await A.create({kind:'multiparty',actors:log.body.actors,terms:{...log.body.terms,description:'Replace remaining work with a corrected scope.',amount:7000},previousRecord:(await A.inspect(original)).recordCode,revisionRule:'REPLACE_REMAINING_TERMS'});
 for(const key of Object.values(keys).slice(0,approvalCount))revised=await A.act(revised,key,'APPROVE',{agreement:revised.id});return {keys,original,revised,bundle:{format:A.FORMAT_HISTORY,selected:revised.id,logs:[original,revised]}};
}
test('replacement effect is explicit, signed and has no effect while any required approval is missing',async()=>{
 const {keys,original,revised,bundle}=await replacementHistory(2),state=await A.inspectHistory(bundle);assert.equal(state.declared_revision_rule,'REPLACE_REMAINING_TERMS');assert.equal(state.replacement_agreed,false);assert.equal(state.selected.replacement_approval_complete,false);assert.deepEqual(state.replacement_effects,[]);assert.deepEqual(state.declared_remaining_terms_ids,[original.id]);assert.equal(state.results[0].remaining_terms_replaced_by,null);
 const accepted=await A.act(revised,keys.reviewer,'APPROVE',{agreement:revised.id}),full=await A.inspectHistory({...bundle,logs:[original,accepted]});assert.equal(full.replacement_agreed,true);assert.equal(full.selected.replacement_agreed,true);assert.equal(full.results[0].remaining_terms_replaced_by,revised.id);assert.deepEqual(full.declared_remaining_terms_ids,[revised.id]);assert.equal(full.latest_agreed_replacement_id,revised.id);assert.equal(full.results[0].approved.length,3);assert.equal(full.results[0].status,'AGREED');assert.equal(full.prior_obligations_cancelled,false);assert.equal(full.past_work_or_payment_claims_released,false);assert.equal(full.past_claims_determined,false);assert.equal(full.legal_effect_certified,false);
 assert.equal(full.replacement_effects[0].scope,'REMAINING_SCOPE_AND_PRICE_ONLY');assert.deepEqual(full.replacement_effects[0].replaces_remaining_terms_of,[original.id]);assert.match(A.REVISION_RULE_TEXT.REPLACE_REMAINING_TERMS,/Past work and payment claims are not released or determined/);
});
test('replacement rules refuse missing/incorrect parents and adoption by other workflow kinds',async()=>{
 const {original,revised,bundle}=await replacementHistory();await assert.rejects(A.create({kind:'multiparty',actors:revised.body.actors,terms:revised.body.terms,revisionRule:'REPLACE_REMAINING_TERMS'}),code('ADV_REPLACEMENT_PARENT'));
 const x=await delegation();await assert.rejects(A.create({kind:'delegation',actors:x.log.body.actors,terms:x.log.body.terms,previousRecord:'f'.repeat(64),revisionRule:'REPLACE_REMAINING_TERMS'}),code('ADV_REPLACEMENT_PARENT'));
 const wrong=await A.create({kind:'multiparty',actors:revised.body.actors,terms:revised.body.terms,previousRecord:'f'.repeat(64),revisionRule:'REPLACE_REMAINING_TERMS'});await assert.rejects(A.inspectHistory({...bundle,selected:wrong.id,logs:[original,wrong]}),code('ADV_HISTORY_PARENT'));
 await assert.rejects(A.inspectHistory({...bundle,logs:[revised]}),code('ADV_HISTORY_PARENT'));await assert.rejects(A.create({kind:'multiparty',actors:revised.body.actors,terms:revised.body.terms,revisionRule:'CANCEL_EVERYTHING'}),code('ADV_REVISION_RULE'));
});
test('changing the signed revision rule invalidates existing approvals; standalone revision cannot claim included parent effect',async()=>{
 const {revised}=await replacementHistory(),changed=clone(revised);changed.body.revisionRule='ADDITIONAL_PROPOSAL';await assert.rejects(A.inspect(changed),code('ADV_TERMS_CHANGED'));changed.id=await A.manifestId(changed.body);await assert.rejects(A.inspect(changed),code('ADV_WORKFLOW_BINDING'));
 const single=await A.inspect(revised);assert.equal(single.replacement_approval_complete,true);assert.equal(single.replacement_agreed,false);assert.equal(single.history_status,'PARENT_NOT_INCLUDED');
 const {log}=await multiparty(),legacy=clone(log);delete legacy.body.revisionRule;legacy.id=await A.manifestId(legacy.body);assert.equal((await A.inspect(legacy)).declared_revision_rule,'ADDITIONAL_PROPOSAL');assert.equal((await A.inspect(legacy)).replacement_agreed,false);
});
test('later additional proposals retain earlier agreed replacement and approval history',async()=>{
 const {keys,original,revised,bundle}=await replacementHistory();let proposal=await A.create({kind:'multiparty',actors:revised.body.actors,terms:{...revised.body.terms,amount:8000},previousRecord:(await A.inspect(revised)).recordCode});const history={...bundle,selected:proposal.id,logs:[original,revised,proposal]};let state=await A.inspectHistory(history);
 assert.equal(state.declared_revision_rule,'ADDITIONAL_PROPOSAL');assert.equal(state.replacement_agreed,false);assert.equal(state.latest_agreed_replacement_id,revised.id);assert.deepEqual(state.declared_remaining_terms_ids,[revised.id]);assert.equal(state.results[1].replacement_agreed,true);
 proposal=await approveAll(proposal,keys);state=await A.inspectHistory({...history,logs:[original,revised,proposal]});assert.deepEqual(state.declared_remaining_terms_ids,[revised.id,proposal.id]);assert.equal(state.results[0].approved.length,3);assert.equal(state.results[1].approved.length,3);assert.equal(state.results[2].approved.length,3);assert.equal(state.prior_obligations_cancelled,false);
});
function mergedFields(value,first,second,replacement){const out=clone(value);delete out[first];delete out[second];out[first+' '+second]=replacement;return out;}
async function resealRecord(record,who){const out=clone(record);out.signature=await P.signature(who.private,A.LABEL+'-RECORD',A.signingFrame(out.body));out.id=await A.recordId({body:out.body,signer:out.signer,signature:out.signature});return out;}
test('manifest terms reject delimiter-colliding merged field names in drafts and freshly signed imports',async()=>{
 const {keys,log}=await arbitration(),terms=mergedFields(log.body.terms,'deadline','description','A forged merged field.');
 // This is the actual old delimiter collision, not just an arbitrary extra key.
 assert.equal(Object.keys(terms).sort().join(' '),Object.keys(log.body.terms).sort().join(' '));
 await assert.rejects(A.create({kind:'arbitration',actors:log.body.actors,terms}),code('FIELDS'));
 let bad=clone(log);bad.body.terms=terms;bad.id=await A.manifestId(bad.body);bad=await forge(bad,keys.customer,'APPROVE',{agreement:bad.id});await assert.rejects(A.importLog(JSON.stringify(bad)),code('FIELDS'));
});
test('manifest body and actor shapes refuse merged keys before signature or UI interpretation',async()=>{
 const {keys,log}=await arbitration();let bad=clone(log);bad.body=mergedFields(bad.body,'previousRecord','profile',A.PROFILE);bad.id=await A.manifestId(bad.body);bad=await forge(bad,keys.customer,'APPROVE',{agreement:bad.id});await assert.rejects(A.importLog(JSON.stringify(bad)),code('FIELDS'));
 const actors=mergedFields(log.body.actors,'arbitrator','customer',keys.customer.public);assert.equal(Object.keys(actors).sort().join(' '),Object.keys(log.body.actors).sort().join(' '));await assert.rejects(A.create({kind:'arbitration',actors,terms:log.body.terms}),code('FIELDS'));
 bad=clone(log);bad.body.actors=actors;bad.id=await A.manifestId(bad.body);bad=await forge(bad,keys.customer,'APPROVE',{agreement:bad.id});await assert.rejects(A.importLog(JSON.stringify(bad)),code('FIELDS'));
});
test('record/event/action-data exact shapes reject delimiter collisions even when freshly re-signed',async()=>{
 const {keys,log}=await multiparty(),signed=await A.act(log,keys.customer,'APPROVE',{agreement:log.id});let bad=clone(signed);bad.records[0]=mergedFields(bad.records[0],'body','id','merged record member');await assert.rejects(A.importLog(JSON.stringify(bad)),code('FIELDS'));
 bad=clone(signed);bad.records[0].body=mergedFields(bad.records[0].body,'at','data',now());bad.records[0]=await resealRecord(bad.records[0],keys.customer);await assert.rejects(A.importLog(JSON.stringify(bad)),code('FIELDS'));
 const x=await disputed(),state=await A.inspect(x.log),malicious=mergedFields(award(x.log,state),'customerDuty','delivery','Merged award terms');await assert.rejects(A.importLog(JSON.stringify(await forge(x.log,x.keys.arbitrator,'AWARD',malicious))),code('FIELDS'));
});
test('evidence and portable-history envelopes reject colliding merged fields',async()=>{
 const {log}=await multiparty(),added=await A.attachEvidence(log,'Evidence item before malicious merged fields.');let bad=clone(added.log);bad.evidence[0]=mergedFields(bad.evidence[0],'sha256','text','malicious merged evidence member');await assert.rejects(A.importLog(JSON.stringify(bad)),code('FIELDS'));
 const {bundle}=await revisionHistory(),envelope=mergedFields(bundle,'logs','selected','malicious merged history member');assert.equal(Object.keys(envelope).sort().join(' '),Object.keys(bundle).sort().join(' '));await assert.rejects(A.importHistory(JSON.stringify(envelope)),code('FIELDS'));
});

test('separately signed delivery and complaint may cite the same exact material without duplicating evidence',async()=>{
 const {keys,log}=await arbitration();const approved=await approveAll(log,keys),attached=await A.attachEvidence(approved,'The promised appendix is missing.');
 let next=await A.act(attached.log,keys.provider,'DELIVER',{agreement:log.id,evidence:attached.sha256});
 next=await A.act(next,keys.customer,'PROBLEM',{agreement:log.id,evidence:attached.sha256});
 const state=await A.inspect(next),decision=award(next,state,5500);decision.evidence=[...new Set(decision.evidence)];
 next=await A.act(next,keys.arbitrator,'AWARD',decision);const checked=await A.inspect(next);
 assert.equal(checked.includedEvidence,1);assert.equal(checked.delivery.evidence,checked.problem.evidence);assert.equal(checked.award.providerAmount+checked.award.customerAmount,log.body.terms.amount);assert.equal(checked.payment_verified,false);
});
