import {readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
const findings=[];
const rules=[['dynamic-code',/\beval\s*\(|new\s+Function\s*\(/],['unsafe-html',/dangerouslySetInnerHTML|\.innerHTML\s*=/],['client-session-storage',/localStorage\.(?:setItem|getItem)\([^\n]*(?:token|session|password)/i],['private-key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],['credential-literal',/(?:api[_-]?key|password|secret)\s*[:=]\s*["'][A-Za-z0-9_\-]{24,}["']/i]];
function scan(dir){for(const f of readdirSync(dir,{withFileTypes:true})){const p=join(dir,f.name);if(f.isDirectory()){if(!["node_modules","android","ios","dist",".expo",".gradle","build"].includes(f.name))scan(p);}else if(/\.(tsx?|m?js|json|ya?ml)$/.test(f.name)){const content=readFileSync(p,'utf8');for(const [rule,re] of rules)if(re.test(content))findings.push({file:p,rule});}}}
for(const dir of ['apps','packages','db','worker','.github'])scan(dir);
console.log(JSON.stringify({scanner:'TrackBus bounded static/secret rules',files:'apps, packages, db, worker, .github',findings},null,2));
if(findings.length)process.exitCode=1;
