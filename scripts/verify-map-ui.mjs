/** Browser integration checks on a local fixture using the real map, modal and records modules.
 * Run after build: MAPA_PLAYWRIGHT_PATH=<optional playwright directory> node scripts/verify-map-ui.mjs
 * Uses a temporary local server and no authentication or database writes.
 */
import {build} from 'esbuild';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.MAPA_PLAYWRIGHT_PATH||'playwright');
const root=path.resolve('.'),output=path.join(root,'.tmp/map-ui');
await mkdir(output,{recursive:true});
const fixture=`
 import L from 'leaflet';
 import {mountOperationMap,mountOperationRecords} from './src/operation.js';
 import {createLocationContext} from './src/location-context.js';
 import {openLocationDetails} from './src/location-modal.js';
 import {createMalhaIndex} from './src/malhas.js';
 const names=['rail-points','rail-sb','rail-pns','rail-stations','rail-malhas','operation/catalog','operation-2015/catalog'];
 const [base,sbSegments,pnPoints,stations,malhas,c1,c2]=await Promise.all(names.map(n=>fetch('assets/'+n+'.json').then(r=>r.json())));
 const points=base.map(p=>({...p,kind:'Ponto ferroviário',line_type:'Não classificada'}));
 const catalogs=[{...c1,id:'operation-2023',assetBase:'assets/operation'},{...c2,id:'rumo-2015',assetBase:'assets/operation-2015'}];
 const malhaIndex=createMalhaIndex(malhas),data={points,sbSegments,pnPoints,stations,catalogs,malhaIndex};
 const context=createLocationContext(data),root=document.querySelector('#content');let view,map;
 function dialog(title,body){const d=document.querySelector('#modal');d.classList.remove('location-dialog');d.innerHTML='<div class="modal-head"><h2></h2><button class="close" aria-label="Fechar">×</button></div><div class="modal-body">'+body+'</div>';d.querySelector('h2').textContent=title;d.querySelector('.close').onclick=()=>d.close();if(!d.open)d.showModal()}
 function inspect(reference,filters){openLocationDetails({reference,context,filters,dialog,onEdit:p=>{window.lastEdit=p.id;dialog('Editar cadastro','Formulário existente')},onMap:mountMap})}
 function mountMap(focus){view?.destroy();view=mountOperationMap({L,root,...data,catalog:catalogs[0],focus,onInspect:inspect,onPoint:p=>inspect({type:'point',id:p.id}),onMap:m=>map=m,onRecords:mountRecords,onPresentation:()=>{},onAdd:()=>{}})}
 function mountRecords(focus){view?.destroy();view=null;mountOperationRecords({root,...data,catalog:catalogs[0],focus,onInspect:inspect,onMap:mountMap,onPoint:p=>{window.lastEdit=p.id},onAdd:()=>{}})}
 document.querySelector('#test-records').onclick=()=>mountRecords();document.querySelector('#test-map').onclick=()=>mountMap();
 window.testApi={data,context,inspect,mountMap,mountRecords,get map(){return map}};mountMap();window.ready=true;
`;
await build({stdin:{contents:fixture,resolveDir:root,sourcefile:'map-ui-fixture.js'},bundle:true,format:'esm',outfile:path.join(output,'fixture.js')});
const html='<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/operation.css"><link rel="stylesheet" href="/leaflet.css"><style>body{margin:0}#test-nav{height:48px;padding:4px;display:flex;gap:8px}#content{height:calc(100dvh - 48px);overflow:auto}.present-only{display:none}</style><body><nav id="test-nav"><button id="test-map">Mapa</button><button id="test-records">Registros</button></nav><main id="content"></main><dialog id="modal"></dialog><script type="module" src="/fixture.js"></script></body></html>';
const server=createServer(async(req,res)=>{try{
 const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 if(name==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return}
 const file=name==='/fixture.js'?path.join(output,'fixture.js'):path.resolve(root,'dist','.'+name);
 if(!file.startsWith(path.join(root,'dist')+path.sep)&&file!==path.join(output,'fixture.js'))throw Error('Invalid path');
 const bytes=await readFile(file);res.setHeader('Content-Type',({'.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');res.end(bytes);
 }catch{res.writeHead(404);res.end('Not found')}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>{errors.push(e.message);console.error(e.stack)});
 // The fixture needs only repository assets; map tiles are external decoration.
 await page.route('https://**/*',r=>r.abort());
 await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>window.ready);
 const close=async()=>{if(await page.locator('#modal').evaluate(d=>d.open))await page.locator('#modal .close').click()};
 const expectText=async(selector,text)=>assert.ok((await page.locator(selector).innerText()).includes(text),`${selector} must contain ${text}`);
 await page.selectOption('#drawing-source','rumo-2015');
 await expectText('#operation-caption','1.421');
 await page.fill('#operation-search','ALTO ARAGUAIA');
 await page.locator('[data-result]').first().click();
 await expectText('#modal','26/06/2015');await expectText('#modal','KMs e indicações');
 assert.ok(await page.locator('#modal .maps-link').first().getAttribute('href'));
 assert.ok(await page.locator('.location-result').count()>0);
 await page.screenshot({path:path.join(output,'drawing-modal.png')});
 await page.selectOption('#location-radius','5000');
 await expectText('#modal','Informações nas proximidades');
 await close();
 await page.click('[data-mode="geographic"]');
 for(const id of ['points','sb','pn','stations','names'])assert.equal(await page.locator('#geo-'+id).inputValue(),'off');
 await page.selectOption('#geo-malha','RMN');
 for(const id of ['points','sb','pn','stations'])assert.equal(await page.locator('#geo-'+id).inputValue(),'on');
 // Fire a click on the real PN layer, then verify the same modal respects selected layers.
 await page.evaluate(()=>{let layer;testApi.map.eachLayer(l=>{if(!layer&&l.options?.fillColor==='#e86321')layer=l});if(!layer)throw Error('PN layer absent');layer.fire('click',{latlng:layer.getLatLng()})});
 assert.equal(await page.locator('#location-scope').inputValue(),'selected');
 await expectText('#modal','Passagem de nível');await expectText('#modal','Malha Norte');
 await page.click('[data-location-map]');
 assert.equal(await page.locator('#geo-malha').inputValue(),'RMN');
 assert.equal(await page.locator('#geo-pn').inputValue(),'on');
 // SB interior click uses the same modal and an actual coordinate from the line.
 await page.evaluate(()=>{let layer;testApi.map.eachLayer(l=>{if(!layer&&l.options?.color==='#007fa6')layer=l});if(!layer)throw Error('SB layer absent');layer.fire('click',{latlng:layer.getLatLngs()[0]})});
 await expectText('#modal','Segmento de SB');await close();
 await page.click('#test-records');
 await page.click('[data-tab="locations"]');
 await page.selectOption('#catalog-source','rumo-2015');await page.fill('#catalog-search','TPD');
 await expectText('#catalog-table','DORMENTES');
 await page.locator('[data-inspect]').first().click();
 await expectText('#modal','26/06/2015');await close();
 await page.click('[data-tab="stations"]');await page.fill('#catalog-search','TAG');
 await page.locator('[data-inspect]').first().click();
 await expectText('#modal','KM médio');assert.ok(await page.locator('.location-result').count()>0);
 await page.screenshot({path:path.join(output,'station-modal.png')});await close();
 // An unlocated station remains consultable but never gets a bogus map link.
 await page.evaluate(()=>{const s=testApi.data.stations.find(s=>s.lat===null);testApi.inspect({type:'station',id:s.code})});
 assert.equal(await page.locator('.location-origin .maps-link').count(),0);await expectText('#modal','coordenadas verificadas');await close();
 // A multi-code drawing reference asks for a choice instead of inventing a midpoint.
 await page.evaluate(()=>{const c=testApi.data.catalogs[0],item=c.items.find(i=>i.codes.includes('JBU')&&i.codes.includes('ZBU'));if(!item)throw Error('Ambiguous Bauru reference missing');testApi.inspect({type:'pdf',id:item.id,catalogId:c.id})});
 await expectText('#modal','Escolha a localização');assert.equal(await page.locator('.location-origin .maps-link').count(),0);
 await page.locator('[data-location-candidate]').first().click();assert.equal(await page.locator('.location-origin .maps-link').count(),1);await close();
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>testApi.inspect({type:'station',id:'TAG'}));
 assert.equal(await page.locator('#modal').evaluate(d=>d.scrollWidth<=d.clientWidth),true,'Modal must fit mobile width');
 await page.screenshot({path:path.join(output,'mobile-modal.png')});await close();
 await page.click('[data-tab="pn"]');await expectText('#catalog-table','Passagem de nível');
 assert.deepEqual(errors,[]);
 console.log('PASS: historical drawing, unified modal, radius, selected layers, preserved malha, PN/SB clicks, records, ambiguous/unlocated references and mobile layout.');
}finally{await browser?.close();await new Promise(r=>server.close(r))}
