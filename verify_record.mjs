#!/usr/bin/env node
// Optional independent command-line verification. Node.js with WebCrypto Ed25519.
import {readFile,stat} from 'node:fs/promises';
import {parseJSON,verifyBundle,need,LIMIT} from './site/protocol.mjs';
const [file,pin,...extra]=process.argv.slice(2);
if(file==='--help'||!file){
 process.stdout.write('Usage: node verify_record.mjs RECORD.json [EXPECTED_FINGERPRINT]\nVerifies exact signed bytes and carried evidence. Does not prove identity, currentness or payment.\n');
 process.exitCode=file?0:2;
}else try{
 need(!extra.length,'ARGUMENTS');if(pin)need(/^[0-9a-f]{64}$/.test(pin),'OPEN_WORK_HASH');
 need((await stat(file)).size<=LIMIT,'INPUT_LIMIT');
 const result=await verifyBundle(parseJSON(await readFile(file,'utf8')),{expectedId:pin||null});
 process.stdout.write(JSON.stringify({...result,independent_fingerprint_supplied:!!pin},null,2)+'\n');
}catch(error){process.stderr.write('REFUSED '+(error.code||error.name||'INVALID_RECORD')+'\n');process.exitCode=1;}
