/** Pure offline operations; no requests, clipboard reads, eval or dynamically compiled code. */
export function cleanLink(input: string): { url: string; removed: number; signed: boolean } {
  const original=input.trim();if(original.length>8192)throw new Error("utility_invalid_url");
  let url:URL;try{url=new URL(original);}catch{throw new Error("utility_invalid_url");}
  if(!["http:","https:"].includes(url.protocol)||url.username||url.password)throw new Error("utility_invalid_url");
  const keys=[...url.searchParams.keys()];
  if(keys.some(key=>/^(sig(nature)?|token|access_token|auth|x-amz-.+|x-goog-.+)$/i.test(key)))return {url:original,removed:0,signed:true};
  let removed=0;
  for(const key of new Set(keys))if(/^utm_/i.test(key)||/^(fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid|ttclid|yclid|_ga|_gl)$/i.test(key)){removed+=url.searchParams.getAll(key).length;url.searchParams.delete(key);}
  return {url:removed?url.toString():original,removed,signed:false};
}
export function calculate(input:string):number {
  if(!input.trim()||input.length>512)throw new Error("utility_invalid_expression");
  const tokens=input.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[A-Za-z]+|[^\s]/g)??[];
  if(tokens.length>256)throw new Error("utility_invalid_expression");
  let offset=0,depth=0,budget=1024;
  const fail=():never=>{throw new Error("utility_invalid_expression");};
  const check=(value:number)=>{if(!Number.isFinite(value)||Math.abs(value)>1e100)return fail();return Object.is(value,-0)?0:value;};
  const functions:Record<string,(v:number)=>number>={sqrt:Math.sqrt,abs:Math.abs,round:Math.round,floor:Math.floor,ceil:Math.ceil,sin:Math.sin,cos:Math.cos,tan:Math.tan,log:Math.log10,ln:Math.log};
  const atom=():number=>{
    if(--budget<0||++depth>32)return fail();
    const token=tokens[offset++];let result:number;
    if(token==='('){result=sum();if(tokens[offset++]!==')')return fail();}
    else if(token==='pi')result=Math.PI;
    else if(token==='e')result=Math.E;
    else if(Object.prototype.hasOwnProperty.call(functions,token)){if(tokens[offset++]!=='(')return fail();result=check(functions[token](sum()));if(tokens[offset++]!==')')return fail();}
    else if(token&&/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(token))result=check(Number(token));
    else return fail();
    depth--;return result;
  };
  const power=():number=>{const left=atom();if(tokens[offset]==='^'){offset++;return check(left**unary());}return left;};
  const unary=():number=>{if(--budget<0)return fail();if(tokens[offset]==='+'){offset++;return unary();}if(tokens[offset]==='-'){offset++;return check(-unary());}return power();};
  const product=():number=>{let value=unary();while(['*','/','%'].includes(tokens[offset])){const op=tokens[offset++];const right=unary();value=check(op==='*'?value*right:op==='/'?value/right:value%right);}return value;};
  const sum=():number=>{let value=product();while(['+','-'].includes(tokens[offset])){const op=tokens[offset++];const right=product();value=check(op==='+'?value+right:value-right);}return value;};
  const value=sum();if(offset!==tokens.length)return fail();return check(value);
}
