// Static, read-only origin for a TLS reverse proxy. No upload, shell, or administrative HTTP API.
import {createServer} from 'node:http';
import {readFile,lstat,realpath} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
export async function startServer(directory,port=8932) {
 const root=await realpath(directory);if((await lstat(directory)).isSymbolicLink())throw new Error('Symlink host directory rejected');
 const server=createServer(async(req,res)=>{
  res.setHeader('x-content-type-options','nosniff');res.setHeader('cache-control','no-store');
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
  const url=req.url??'';if(url!=='/catalog.json'&&!/^\/packages\/[a-f0-9]{64}\.pwx$/.test(url)){res.writeHead(404);res.end();return;}
  try {
   const path=join(root,url.slice(1)),meta=await lstat(path),canonical=await realpath(path),limit=url==='/catalog.json'?1024*1024:8*1024*1024;
   if(!meta.isFile()||meta.isSymbolicLink()||!canonical.startsWith(root+'/')||meta.size>limit)throw new Error('Unsafe resource');
   if(url.startsWith('/packages/')&&(await lstat(join(root,'packages'))).isSymbolicLink())throw new Error('Unsafe directory');
   const bytes=await readFile(path);if(bytes.length>limit)throw new Error('Resource budget');
   res.setHeader('content-type','application/json');res.setHeader('content-length',bytes.length);res.writeHead(200);res.end(req.method==='HEAD'?undefined:bytes);
  }catch{res.writeHead(404);res.end();}
 });server.requestTimeout=10000;server.headersTimeout=10000;server.maxConnections=32;server.maxRequestsPerSocket=20;
 await new Promise((done,fail)=>{server.once('error',fail);server.listen(port,'127.0.0.1',done);});return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const port=Number(process.argv[3]??8932);if(!process.argv[2]||!Number.isInteger(port)||port<1||port>65535)throw new Error('server.mjs HOST_DIRECTORY [PORT]');await startServer(process.argv[2],port);console.log(`Read-only marketplace origin on 127.0.0.1:${port}; configure HTTPS externally.`);}
