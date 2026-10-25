/* Portable work-order /0.3 browser example. No network, storage or payment effects.
 * Canonical UTF-8/ASCII framing matches covenant_agent.open_work.
 * WebCrypto verifies a strict Ed25519 subset; this is not the general historical verifier.
 */
export const PROFILE='covenant-bilateral/0.3', LABEL='COVENANT-OPEN-WORK-0.3';
export const BUNDLE='portable-commitment-demo/0.1';
export const LIMIT=512000;
const HEX=/^[0-9a-f]{64}$/, SIG=/^[0-9a-f]{128}$/;
const encoder=new TextEncoder();
export class Refused extends Error{constructor(code){super(code);this.name='Refused';this.code=code;}}
export function need(value,code){if(!value)throw new Refused(code);}
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export function exact(value,names){need(object(value)&&Object.keys(value).sort().join(' ')===names.split(' ').sort().join(' '),'FIELDS');}
function check(value,depth=0,budget={left:20000}){
 need(depth<=24&&--budget.left>=0,'DEMO_STRUCTURE_LIMIT');
 if(value===null||typeof value==='boolean')return;
 if(typeof value==='number'){need(Number.isSafeInteger(value)&&!Object.is(value,-0),'INTEGER_RANGE');return;}
 if(typeof value==='string'){need(value.length<=64000&&/^[\x20-\x7e]*$/.test(value),'ASCII_PROFILE');return;}
 if(Array.isArray(value)){need(value.length<=2048,'ARRAY_LIMIT');for(const item of value)check(item,depth+1,budget);return;}
 need(object(value)&&Object.keys(value).length<=128,'MAP_LIMIT');
 for(const [key,item]of Object.entries(value)){need(key.length<=256&&/^[\x20-\x7e]*$/.test(key),'MAP_KEY');check(item,depth+1,budget);}
}
function encode(value){
 if(Array.isArray(value))return '['+value.map(encode).join(',')+']';
 if(object(value))return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+encode(value[key])).join(',')+'}';
 return JSON.stringify(value);
}
export function canonical(value){check(value);const text=encode(value);need(text.length<=LIMIT,'INPUT_LIMIT');return text;}
export const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
export function unhex(text){need(typeof text==='string'&&/^(?:[0-9a-f]{2})+$/.test(text),'HEX');return Uint8Array.from(text.match(/../g),byte=>parseInt(byte,16));}
const shaBytes=async bytes=>hex(await crypto.subtle.digest('SHA-256',bytes));
export async function contentHash(text){need(typeof text==='string'&&encoder.encode(text).length<=32768,'CONTENT_LIMIT');return shaBytes(encoder.encode(text));}
export async function digest(label,value){return shaBytes(encoder.encode(label+'\0'+canonical(value)));}
export function nonce(){return hex(crypto.getRandomValues(new Uint8Array(32)));}
export async function identity(){
 const key=await crypto.subtle.generateKey({name:'Ed25519'},false,['sign','verify']);
 return {public:hex(await crypto.subtle.exportKey('raw',key.publicKey)),private:key.privateKey};
}
export async function signature(privateKey,label,body){return hex(await crypto.subtle.sign('Ed25519',privateKey,encoder.encode(label+'\0'+canonical(body))));}
function validKey(encoded){
 // Same point admission as the reference for canonical non-small-order Ed25519 keys.
 if(typeof encoded!=='string'||!HEX.test(encoded))return false;
 const P=(1n<<255n)-19n;
 const pow=(a,n)=>{let r=1n;a=(a%P+P)%P;for(;n;n>>=1n,a=a*a%P)if(n&1n)r=r*a%P;return r;};
 const mod=n=>(n%P+P)%P,inv=n=>pow(n,P-2n),D=mod(-121665n*inv(121666n)),I=pow(2n,(P-1n)/4n);
 let n=0n;const bytes=unhex(encoded);for(let i=31;i>=0;i--)n=n*256n+BigInt(bytes[i]);
 const sign=n>>255n,y0=n&((1n<<255n)-1n);if(y0>=P)return false;
 const yy=y0*y0%P,den=mod(D*yy+1n);if(den===0n)return false;
 const xx=mod((yy-1n)*inv(den));let x=pow(xx,(P+3n)/8n),y=y0;
 if(x*x%P!==xx)x=x*I%P;if(x*x%P!==xx||(x===0n&&sign!==0n))return false;
 if((x&1n)!==sign)x=P-x;
 for(let i=0;i<3;i++){const product=mod(D*x*x*y*y),dx=mod(1n+product),dy=mod(1n-product);if(dx===0n||dy===0n)return false;[x,y]=[mod(2n*x*y*inv(dx)),mod((y*y+x*x)*inv(dy))];}
 return !(x===0n&&y===1n);
}
export async function verifySignature(publicKey,label,body,sig){
 need(validKey(publicKey),'PUBLIC_KEY');need(typeof sig==='string'&&SIG.test(sig),'SIGNATURE_ENCODING');
 let ok=false;try{const key=await crypto.subtle.importKey('raw',unhex(publicKey),'Ed25519',false,['verify']);ok=await crypto.subtle.verify('Ed25519',key,unhex(sig),encoder.encode(label+'\0'+canonical(body)));}catch{}
 need(ok,'SIGNATURE');return true;
}
function text(value,max=256){need(typeof value==='string'&&value.length>0&&value.length<=max,'OPEN_WORK_TEXT');canonical(value);}
function uint(value){need(Number.isSafeInteger(value)&&value>=0&&!Object.is(value,-0),'OPEN_WORK_INTEGER');}
function hash(value){need(typeof value==='string'&&HEX.test(value),'OPEN_WORK_HASH');}
export async function draft({task,customer,provider,quantity,deadline,context=null,orderNonce=nonce()}){
 text(task,16000);uint(quantity);uint(deadline);hash(orderNonce);
 need(validKey(customer)&&validKey(provider),'OPEN_WORK_KEY');need(customer!==provider,'OPEN_WORK_DISTINCT_PARTIES');
 const payment={identifier:'MANUAL',network:'demo-only',asset:'demo-credit',unit:'credits',payee:provider,adapter:null,instructions:null};
 const body={profile:PROFILE,terms:{version:'covenant-work-order/0.3',task,quantity,payment,nonce:orderNonce,deadline,clock:'OWNER_ADOPTED_UNIX_SECONDS',context},customer,provider};
 return {body,id:await digest(LABEL,body),assents:[],events:[],execution_authorized:false,funds_reserved:false};
}
export async function inspect(order,expectedId){
 exact(order,'body id assents events execution_authorized funds_reserved');hash(expectedId);
 const body=order.body;exact(body,'profile terms customer provider');const t=body.terms;
 exact(t,'version task quantity payment nonce deadline clock context');
 need(body.profile===PROFILE&&t.version==='covenant-work-order/0.3'&&t.clock==='OWNER_ADOPTED_UNIX_SECONDS','OPEN_WORK_PROFILE');
 text(t.task,16000);uint(t.quantity);uint(t.deadline);hash(t.nonce);need(validKey(body.customer)&&validKey(body.provider)&&body.customer!==body.provider,'OPEN_WORK_DISTINCT_PARTIES');
 exact(t.payment,'identifier network asset unit payee adapter instructions');
 for(const name of ['identifier','network','asset','unit','payee'])text(t.payment[name]);
 need(t.payment.identifier.startsWith('urn:')||t.payment.identifier.startsWith('https:')||['NONE','MANUAL'].includes(t.payment.identifier),'OPEN_WORK_RAIL');
 if(t.payment.adapter!==null)hash(t.payment.adapter);canonical(t.payment.instructions);canonical(t.context);
 need(order.id===expectedId&&await digest(LABEL,body)===expectedId,'OPEN_WORK_CHANGED');
 need(order.execution_authorized===false&&order.funds_reserved===false,'OPEN_WORK_CLAIMS');
 need(Array.isArray(order.assents)&&order.assents.length<=2&&Array.isArray(order.events)&&order.events.length<=128,'OPEN_WORK_RECORDS');
 const approved=new Set();for(const assent of order.assents){exact(assent,'signer signature');need([body.customer,body.provider].includes(assent.signer)&&!approved.has(assent.signer),'OPEN_WORK_ASSENT');await verifySignature(assent.signer,LABEL+'-ASSENT',{agreement:expectedId},assent.signature);approved.add(assent.signer);}
 let head=expectedId,last=0;
 for(const event of order.events){need(approved.size===2,'OPEN_WORK_NOT_BOUND');exact(event,'body signer signature');const value=event.body;exact(value,'agreement previous action evidence at');need(value.agreement===expectedId&&value.previous===head,'OPEN_WORK_EVENT_CHAIN');uint(value.at);need(value.at>=last,'OPEN_WORK_CLOCK_ORDER');last=value.at;
  need(['DELIVERY_CLAIM','PAYMENT_CLAIM','DISPUTE','RECEIPT'].includes(value.action),'OPEN_WORK_ACTION');hash(value.evidence);
  need([body.customer,body.provider].includes(event.signer),'OPEN_WORK_EVENT_AUTHORITY');if(value.action==='DELIVERY_CLAIM')need(event.signer===body.provider,'OPEN_WORK_EVENT_AUTHORITY');if(value.action==='PAYMENT_CLAIM')need(event.signer===body.customer,'OPEN_WORK_EVENT_AUTHORITY');
  await verifySignature(event.signer,LABEL+'-EVENT',value,event.signature);head=await digest(LABEL+'-EVENT',event);
 }
 return {id:expectedId,status:approved.size===2?'BOUND':'PROPOSED',head,approved:[...approved].sort(),events:order.events.length,payment_verified:false,delivery_verified:false,funds_reserved:false,execution_authorized:false,chain_required:false};
}
export async function assent(order,who){const state=await inspect(order,order.id);need([order.body.customer,order.body.provider].includes(who.public)&&!state.approved.includes(who.public),'OPEN_WORK_ASSENT');const next=structuredClone(order);next.assents.push({signer:who.public,signature:await signature(who.private,LABEL+'-ASSENT',{agreement:order.id})});await inspect(next,next.id);return next;}
export async function event(order,who,action,evidence,at=Math.floor(Date.now()/1000)){
 const state=await inspect(order,order.id);need(state.status==='BOUND','OPEN_WORK_NOT_BOUND');const next=structuredClone(order);const body={agreement:order.id,previous:state.head,action,evidence,at};next.events.push({body,signer:who.public,signature:await signature(who.private,LABEL+'-EVENT',body)});await inspect(next,next.id);return next;
}
// Untrusted files are parsed before shape checking. Duplicate names are refused,
// rather than silently choosing a later member as JSON.parse would do.
export function parseJSON(raw){
 need(typeof raw==='string'&&encoder.encode(raw).length<=LIMIT,'INPUT_LIMIT');let i=0,nodes=0;
 const ws=()=>{while(i<raw.length&&/[\t\r\n ]/.test(raw[i]))i++;};
 function value(depth=0){need(depth<=24&&++nodes<=20000,'DEMO_STRUCTURE_LIMIT');ws();const c=raw[i];
  if(c==='"'){const start=i++;let ended=false;while(i<raw.length){if(raw[i]==='\\'){i+=2;continue;}if(raw[i++]==='"'){ended=true;break;}}need(ended,'INVALID_JSON');try{return JSON.parse(raw.slice(start,i));}catch{throw new Refused('INVALID_JSON');}}
  if(c==='['){i++;const a=[];ws();if(raw[i]===']'){i++;return a;}while(true){a.push(value(depth+1));ws();if(raw[i]===']'){i++;return a;}need(raw[i++]===',','INVALID_JSON');}}
  if(c==='{'){i++;const out=Object.create(null);ws();if(raw[i]==='}'){i++;return out;}while(true){ws();need(raw[i]==='"','INVALID_JSON');const key=value(depth+1);need(!Object.hasOwn(out,key),'DUPLICATE_KEY');ws();need(raw[i++]===':','INVALID_JSON');out[key]=value(depth+1);ws();if(raw[i]==='}'){i++;return out;}need(raw[i++]===',','INVALID_JSON');}}
  for(const [word,result]of [['true',true],['false',false],['null',null]])if(raw.startsWith(word,i)){i+=word.length;return result;}
  const found=/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(raw.slice(i));need(found,'INVALID_JSON');i+=found[0].length;need(!/[.eE]/.test(found[0]),'NONINTEGER_NUMBER');const n=Number(found[0]);need(Number.isSafeInteger(n)&&!Object.is(n,-0),'INTEGER_RANGE');return n;
 }
 const result=value();ws();need(i===raw.length,'INVALID_JSON');return result;
}
export async function verifyBundle(bundle,{expectedId=null}={}){
 exact(bundle,'format selected agreements evidence');need(bundle.format===BUNDLE,'DEMO_BUNDLE_VERSION');
 need(Array.isArray(bundle.agreements)&&bundle.agreements.length>=1&&bundle.agreements.length<=16,'DEMO_AGREEMENT_LIMIT');need(Array.isArray(bundle.evidence)&&bundle.evidence.length<=128,'DEMO_EVIDENCE_LIMIT');
 const ids=new Set(),results=[];for(const order of bundle.agreements){need(!ids.has(order.id),'DEMO_DUPLICATE_AGREEMENT');results.push(await inspect(order,order.id));ids.add(order.id);}
 need(ids.has(bundle.selected),'DEMO_SELECTED_UNKNOWN');if(expectedId)need(bundle.selected===expectedId,'DEMO_PIN_MISMATCH');
 const evidence=new Set();for(const item of bundle.evidence){exact(item,'sha256 text');hash(item.sha256);need(!evidence.has(item.sha256),'DEMO_DUPLICATE_EVIDENCE');need(await contentHash(item.text)===item.sha256,'DEMO_EVIDENCE_CHANGED');evidence.add(item.sha256);}
 return {results,selected:results.find(row=>row.id===bundle.selected),includedEvidence:evidence.size,identity:'KEY_SIGNATURES_ONLY',payment_verified:false,delivery_quality_verified:false};
}
