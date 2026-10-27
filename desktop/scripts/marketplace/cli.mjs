#!/usr/bin/env node
// Offline publisher/reviewer operations. Never include private keys in the hosted directory.
import {generateKeyPairSync, createPrivateKey} from 'node:crypto';
import {readFile, writeFile, mkdir, readdir, lstat, realpath} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {envelope, openEnvelope, rawPublicKey, sha256, validatePackage, validPath, httpsURL, MAX_PACKAGE} from './protocol.mjs';
async function bounded(path,limit=MAX_PACKAGE) {const s=await lstat(path);if(!s.isFile()||s.isSymbolicLink()||s.size>limit)throw new Error('Expected bounded ordinary file');return readFile(path);}
async function newFile(path,data,mode=0o600) {await writeFile(path,data,{flag:'wx',mode});}
export async function run(args) {
  const [command,...a]=args;
  if(command==='keygen') {
    if(a.length!==1)throw new Error('keygen NEW_PRIVATE_DIRECTORY');
    const dir=resolve(a[0]);await mkdir(dir,{mode:0o700});const keys=generateKeyPairSync('ed25519');
    await newFile(join(dir,'private.pem'),keys.privateKey.export({format:'pem',type:'pkcs8'}));
    await newFile(join(dir,'public.txt'),rawPublicKey(keys.privateKey)+'\n');return 'Created Ed25519 key pair; keep private.pem offline.';
  }
  if(command==='package') {
    if(a.length!==3)throw new Error('package WIDGET_DIRECTORY PUBLISHER_PRIVATE_PEM NEW_PACKAGE.pwx');
    const root=await realpath(a[0]);if((await lstat(a[0])).isSymbolicLink())throw new Error('Symlink source rejected');
    const files=[];let size=0,dirs=0;const names=new Set();
    async function walk(dir,prefix='') {for(const item of (await readdir(dir,{withFileTypes:true})).sort((x,y)=>x.name.localeCompare(y.name))) {
      const path=prefix+item.name;
      if(item.isDirectory()) {if(++dirs>128||!/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(item.name)||path.split('/').length>=8)throw new Error('Unsafe directory');await walk(join(dir,item.name),path+'/');}
      else {if(!item.isFile()||!validPath(path)||names.has(path.toLowerCase())||files.length>=128)throw new Error('Unsafe file');const bytes=await bounded(join(dir,item.name),2*1024*1024);size+=bytes.length;if(size>6*1024*1024)throw new Error('Package budget exceeded');names.add(path.toLowerCase());files.push({path,data:bytes.toString('base64')});}
    }}await walk(root);
    const manifest=JSON.parse((await bounded(join(root,'widget.json'),65536)).toString());
    const pkg={schemaVersion:1,id:manifest.id,version:manifest.version,files};validatePackage(pkg);
    const signed=envelope(pkg,createPrivateKey(await bounded(a[1],16384)));if(signed.length>MAX_PACKAGE)throw new Error('Signed package budget exceeded');await newFile(a[2],signed);return `Signed ${pkg.id} ${pkg.version}; sha256 ${sha256(signed)}`;
  }
  if(command==='inspect') {
    if(a.length!==3)throw new Error('inspect PACKAGE.pwx PUBLISHER_PUBLIC.txt NEW_DIRECTORY');
    const bytes=await bounded(a[0]),key=(await bounded(a[1],128)).toString().trim(),pkg=openEnvelope(bytes,key),m=validatePackage(pkg);
    const out=resolve(a[2]);await mkdir(out,{mode:0o700});
    for(const file of pkg.files){const parts=file.path.split('/');let dir=out;for(const part of parts.slice(0,-1)){dir=join(dir,part);try{await mkdir(dir,{mode:0o700});}catch(error){if(error.code!=='EEXIST')throw error;}if((await lstat(dir)).isSymbolicLink())throw new Error('Symlink destination rejected');}await newFile(join(out,file.path),Buffer.from(file.data,'base64'));}
    return `Extracted signed source for human review: ${m.id} ${m.version}; digest ${sha256(bytes)}; permissions ${m.permissions.join(', ')||'none'}`;
  }
  if(command==='review') {
    if(a.length!==7||a[5]!=='--approve'||!a[6].trim()||a[6].length>120)throw new Error('review PACKAGE.pwx PUBLISHER_ID PUBLISHER_PUBLIC.txt HTTPS_PACKAGE_URL NEW_APPROVAL.json --approve REVIEWER_NAME (only after inspecting the package source)');
    if(!/^[a-zA-Z0-9_.-]{1,80}$/.test(a[1]))throw new Error('Invalid publisher ID');
    httpsURL(a[3]);const bytes=await bounded(a[0]),key=(await bounded(a[2],128)).toString().trim();const pkg=openEnvelope(bytes,key);const m=validatePackage(pkg);
    const approval={schemaVersion:1,reviewedAt:Math.floor(Date.now()/1000),reviewer:a[6],publisher:{id:a[1],key},entry:{id:m.id,version:m.version,name:m.name,description:m.description,publisher:a[1],permissions:m.permissions,packageUrl:a[3],sha256:sha256(bytes)}};
    await newFile(a[4],JSON.stringify(approval,null,2)+'\n');return `Approved exact digest ${approval.entry.sha256}; permissions: ${m.permissions.join(', ')||'none'}`;
  }
  if(command==='catalog') {
    if(a.length<5)throw new Error('catalog ROOT_PRIVATE_PEM REVISION TTL_SECONDS NEW_CATALOG.json APPROVAL.json... (empty: -)');
    const revision=Number(a[1]),ttl=Number(a[2]);if(!Number.isSafeInteger(revision)||revision<1||!Number.isSafeInteger(ttl)||ttl<60||ttl>30*86400)throw new Error('Invalid revision or TTL');
    const approvals=a.slice(4).filter(p=>p!=='-');if(approvals.length>100)throw new Error('Too many approvals');
    const entries=[],publishers=new Map(),ids=new Set();
    for(const path of approvals) {const r=JSON.parse(await bounded(path,32768));if(r.schemaVersion!==1||!r.reviewer||!r.reviewedAt||ids.has(r.entry.id)||r.entry.publisher!==r.publisher.id||!/^[a-f0-9]{64}$/.test(r.entry.sha256))throw new Error('Invalid approval');ids.add(r.entry.id);httpsURL(r.entry.packageUrl);if(publishers.has(r.publisher.id)&&publishers.get(r.publisher.id).key!==r.publisher.key)throw new Error('Publisher key conflict');publishers.set(r.publisher.id,r.publisher);entries.push(r.entry);}
    const issuedAt=Math.floor(Date.now()/1000);const data={schemaVersion:1,revision,issuedAt,expiresAt:issuedAt+ttl,publishers:[...publishers.values()],entries};
    const signed=envelope(data,createPrivateKey(await bounded(a[0],16384)));if(signed.length>1024*1024)throw new Error('Catalog budget exceeded');await newFile(a[3],signed);return `Root signed catalog revision ${revision}, ${entries.length} approved packages.`;
  }
  throw new Error('Commands: keygen, package, inspect, review, catalog. See MARKETPLACE_TRUST.md. Outputs must be new paths; use a larger catalog revision for every change.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)run(process.argv.slice(2)).then(message=>console.log(message)).catch(error=>{console.error(error instanceof Error?error.message:'Marketplace operation failed');process.exitCode=1;});
