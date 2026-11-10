// Exercise the unchanged production routing engine against Campina's snapshot.
// No network. Uses the repository's existing esbuild development dependency.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
import { build } from "esbuild";
const here = dirname(fileURLToPath(import.meta.url));
const engine = readFileSync(join(here, "index.ts"), "utf8").replace('import snapshot from "./salvador.json";', 'import snapshot from "./campina.json";');
if (!engine.includes("./campina.json")) throw Error("Routing engine import changed; review the verification adapter.");
const compiled = await build({stdin:{contents:engine,loader:"ts",resolveDir:here},bundle:true,write:false,format:"esm",platform:"node"});
const {calculateLocalRoute} = await import("data:text/javascript;base64,"+Buffer.from(compiled.outputFiles[0].text).toString("base64"));
const demo = JSON.parse(readFileSync(join(here,"campina-demo.json"),"utf8"));
for (const mode of ["bus","pedestrian"]) {
 const result = calculateLocalRoute(demo.points,mode);
 assert.ok(result);
 assert.ok(result.meters>500 && result.meters<2000);
 assert.ok(result.geometry.length>20);
 assert.deepEqual(result.snapMeters,[0,0,0]);
 assert.equal(result.source,"osm-local");
 console.log(JSON.stringify({mode,meters:result.meters,seconds:result.seconds,vertices:result.geometry.length,snapMeters:result.snapMeters}));
}
const reverse=calculateLocalRoute([...demo.points].reverse(),"bus");
assert.ok(!reverse || reverse.meters>1000,"One-way route must not silently reverse the same road");
assert.equal(calculateLocalRoute([demo.points[0],{lat:-7.1688,lng:-34.8638}],"bus"),null);
console.log("Campina graph validation passed; outside coverage correctly rejected.");
