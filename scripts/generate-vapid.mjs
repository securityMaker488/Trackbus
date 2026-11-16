import { mkdir,writeFile } from 'node:fs/promises';
import { resolve,dirname } from 'node:path';
const target=resolve('work/vapid-secrets.json');
const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
const privateJwk=await crypto.subtle.exportKey('jwk',pair.privateKey);
const publicKey=Buffer.from(await crypto.subtle.exportKey('raw',pair.publicKey)).toString('base64url');
await mkdir(dirname(target),{recursive:true});
await writeFile(target,JSON.stringify({VAPID_PUBLIC_KEY:publicKey,VAPID_PRIVATE_JWK:JSON.stringify(privateJwk),VAPID_SUBJECT:'https://trackbus-demonstracao.goldensla6.workers.dev'},null,2),{flag:'wx',mode:0o600});
console.log('Segredos VAPID gerados em work/vapid-secrets.json. Conteúdo não exibido; preserve este arquivo privado.');
