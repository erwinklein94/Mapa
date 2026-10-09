import {build} from 'esbuild';
import {copyFileSync} from 'node:fs';
await build({entryPoints:['src/app.js'],bundle:true,minify:true,outfile:'dist/app.js',format:'esm',loader:{'.png':'dataurl'}});
copyFileSync('node_modules/leaflet/dist/leaflet.css','dist/leaflet.css');
copyFileSync('src/operation.css','dist/operation.css');
