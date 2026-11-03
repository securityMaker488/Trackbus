import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const source=JSON.parse(readFileSync('dist/server/wrangler.json','utf8'));
mkdirSync('.wrangler',{recursive:true});
const config={name:'trackbus-local-migrations',compatibility_date:source.compatibility_date,d1_databases:source.d1_databases.map(d=>({...d,migrations_dir:resolve('drizzle')}))};
writeFileSync('.wrangler/migrations.json',JSON.stringify(config));
const result=spawnSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','migrations','apply','DB','--local','--config','.wrangler/migrations.json','--persist-to','.wrangler/state'],{stdio:'inherit',env:{...process.env,CI:'1'}});
process.exit(result.status??1);
