import {createHash, createPublicKey, sign, verify} from 'node:crypto';
export const MAX_PACKAGE = 8 * 1024 * 1024;
export const MAX_FILE = 2 * 1024 * 1024;
export const sha256 = data => createHash('sha256').update(data).digest('hex');
export function rawPublicKey(key) { return createPublicKey(key).export({format:'der', type:'spki'}).subarray(-32).toString('base64'); }
export function publicKey(raw) {
  const bytes = decode(raw);
  if(bytes.length !== 32) throw new Error('Expected raw 32-byte Ed25519 public key');
  return createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),bytes]),format:'der',type:'spki'});
}
export function decode(raw) {
  if(typeof raw !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(raw)) throw new Error('Invalid base64');
  return Buffer.from(raw,'base64');
}
export function envelope(payload, key) {
  const data = Buffer.from(JSON.stringify(payload));
  return Buffer.from(JSON.stringify({payload:data.toString('base64'),signature:sign(null,data,key).toString('base64')}));
}
export function openEnvelope(bytes, rawKey, limit=MAX_PACKAGE) {
  if(bytes.length > limit) throw new Error('Package exceeds size limit');
  const value = JSON.parse(bytes);
  if(Object.keys(value).sort().join(',') !== 'payload,signature') throw new Error('Invalid envelope');
  const data=decode(value.payload), signature=decode(value.signature);
  if(signature.length!==64 || !verify(null,data,publicKey(rawKey),signature)) throw new Error('Invalid signature');
  return JSON.parse(data);
}
export const validPath = path => typeof path === 'string' && path.length<=240 && path.split('/').length<=8 && path.split('/').every(p=>p.length>0&&p.length<=80&&!p.startsWith('.')&&/^[a-zA-Z0-9_.-]+$/.test(p)) && /\.(json|html|js|css|svg|png|jpg|jpeg|webp|woff2?)$/.test(path);
export const validId = id => typeof id==='string' && id.length>=5 && id.length<=120 && /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.){2,}[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(id) && !id.startsWith('com.pinwall.');
export function validatePackage(pkg) {
  if(!pkg||Object.keys(pkg).sort().join(',')!=='files,id,schemaVersion,version'||pkg.schemaVersion!==1||!validId(pkg.id)||!/^\d[a-zA-Z0-9_.-]{0,63}$/.test(pkg.version)||!Array.isArray(pkg.files)||pkg.files.length<1||pkg.files.length>128) throw new Error('Invalid package');
  const paths=new Set(); let size=0;
  for(const file of pkg.files) {
    if(Object.keys(file).sort().join(',')!=='data,path'||!validPath(file.path)||paths.has(file.path.toLowerCase())) throw new Error('Unsafe or duplicate file path');
    paths.add(file.path.toLowerCase());const data=decode(file.data);size+=data.length;
    if(data.length>MAX_FILE||size>6*1024*1024) throw new Error('Package file budget exceeded');
  }
  for(const path of paths) { const p=path.split('/');for(let n=1;n<p.length;n++)if(paths.has(p.slice(0,n).join('/')))throw new Error('File/directory conflict'); }
  const file=pkg.files.find(f=>f.path==='widget.json');if(!file||decode(file.data).length>65536)throw new Error('Missing manifest');
  const m=JSON.parse(decode(file.data));
  const allowed=new Set(['storage','theme','notify','cards','events','app','network','i18n']);
  if(m.id!==pkg.id||m.version!==pkg.version||m.type!=='community'||m.defaultEnabled!==false||m.installedPath!==undefined||typeof m.name!=='string'||!m.name||m.name.length>256||typeof m.description!=='string'||Buffer.byteLength(m.description)>2048||!Array.isArray(m.permissions)||new Set(m.permissions).size!==m.permissions.length||m.permissions.some(p=>!allowed.has(p))||!pkg.files.some(f=>f.path===m.entry)||!pkg.files.some(f=>f.path===m.icon))throw new Error('Invalid community manifest or permissions');
  return m;
}
export function httpsURL(value) {const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.hash||url.port&&url.port!=='443')throw new Error('Expected public HTTPS URL');return url;}
