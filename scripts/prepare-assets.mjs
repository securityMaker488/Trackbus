import { build } from "esbuild";
import sharp from "sharp";
import { readFileSync } from "node:fs";
await build({
  entryPoints: ["node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs"],
  outfile: "public/map-worker-v6.mjs",
  bundle: true,
  format: "esm",
  platform: "browser",
  minify: true,
  legalComments: "eof",
});
const symbol = readFileSync("public/favicon.svg");
await Promise.all([
  sharp(symbol).resize(192, 192).png().toFile("public/icon-192.png"),
  sharp(symbol)
    .resize(420, 420)
    .extend({ top: 46, right: 46, bottom: 46, left: 46, background: "#FACC15" })
    .flatten({ background: "#FACC15" })
    .png()
    .toFile("public/icon-512.png"),
]);
