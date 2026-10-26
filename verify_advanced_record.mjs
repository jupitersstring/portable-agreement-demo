#!/usr/bin/env node
/* SPDX-License-Identifier: MIT
 * Separate process verification for the original public advanced demo profile.
 */
import {readFile,stat} from 'node:fs/promises';
import {importLog,importHistory,FORMAT_HISTORY,LIMIT} from './site/advanced-protocol.mjs';
import {need,parseJSON} from './site/protocol.mjs';
const [file,pin,...extra]=process.argv.slice(2);
if(file==='--help'||!file){
 process.stdout.write('Usage: node verify_advanced_record.mjs RECORD.json [EXPECTED_FULL_RECORD_CODE]\nChecks the original public advanced-demo signatures, scopes, event order and included evidence. The optional code commits to the whole snapshot. No identity, latest-version, payment, delivery or legal-effect proof.\n');
 process.exitCode=file?0:2;
}else try{
 need(!extra.length,'ARGUMENTS');if(pin)need(/^[0-9a-f]{64}$/.test(pin),'ADV_HASH');need((await stat(file)).size<=LIMIT,'INPUT_LIMIT');
 const raw=await readFile(file,'utf8'),history=parseJSON(raw).format===FORMAT_HISTORY;
 const {state}=await(history?importHistory:importLog)(raw,{expectedId:pin||null}),selected=history?state.selected:state;
 process.stdout.write(JSON.stringify({verified:true,profile:selected.profile,kind:state.kind,status:selected.status,terms_id:selected.termsId,record_code:state.recordCode,head:selected.head,version_count:history?state.count:1,history_status:state.history_status,signed_events:history?state.results.reduce((sum,item)=>sum+item.records,0):state.records,approvals:selected.approved.length,included_evidence:history?state.results.reduce((sum,item)=>sum+item.includedEvidence,0):state.includedEvidence,independent_fingerprint_supplied:!!pin,declared_revision_rule:selected.declared_revision_rule,replacement_agreed:state.replacement_agreed??false,replacement_approval_complete:selected.replacement_approval_complete,work_status:selected.followup?.work_status??null,payment_status:selected.followup?.payment_status??null,outstanding:selected.followup?.outstanding??[],payment_verified:false,performance_verified:false,delivery_quality_verified:false,execution_authorized:false,funds_reserved:false,identity:selected.identity,clock:selected.clock,latest_version_known:false,prior_obligations_cancelled:false,past_work_or_payment_claims_released:false,past_claims_determined:false,legal_effect_certified:false},null,2)+'\n');
}catch(error){process.stderr.write('REFUSED '+(error.code||error.name||'INVALID_RECORD')+'\n');process.exitCode=1;}
