import {build} from 'esbuild';
import {copyFileSync,readFileSync,writeFileSync} from 'node:fs';
await build({entryPoints:['src/app.js'],bundle:true,minify:true,outfile:'dist/app.js',format:'esm',loader:{'.png':'dataurl'}});
copyFileSync('node_modules/leaflet/dist/leaflet.css','dist/leaflet.css');
writeFileSync('dist/operation.css',['src/operation.css','src/location.css','src/records-extra.css'].map(file=>readFileSync(file,'utf8')).join('\n'));
