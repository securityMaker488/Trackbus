import {build} from 'esbuild';
import sharp from 'sharp';
import {readFileSync,writeFileSync} from 'node:fs';
await build({entryPoints:['node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs'],outfile:'public/map-worker-v6.mjs',bundle:true,format:'esm',platform:'browser',minify:true,legalComments:'eof'});
const svg=readFileSync('public/favicon.svg');
await Promise.all([192,512].map(size=>sharp(svg).resize(size,size).png().toFile(`public/icon-${size}.png`)));
const manifest=JSON.parse(readFileSync('public/manifest.webmanifest','utf8'));
manifest.icons=[{src:'/icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},{src:'/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any'},{src:'/favicon.svg',sizes:'any',type:'image/svg+xml'}];
writeFileSync('public/manifest.webmanifest',JSON.stringify(manifest,null,2)+'\n');
