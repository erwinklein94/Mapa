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
 import {createSubIndex,decorateSubs} from './src/subs.js';
 const names=['rail-points','rail-sb','rail-pns','rail-stations','rail-malhas','rail-subs','operation/catalog','operation-2015/catalog'];
 const [base,rawSB,rawPN,rawStations,malhas,subs,c1,c2]=await Promise.all(names.map(n=>fetch('assets/'+n+'.json').then(r=>r.json())));
 const malhaIndex=createMalhaIndex(malhas),subIndex=createSubIndex(rawStations,malhaIndex,rawPN);
 const points=decorateSubs(base.map(p=>({...p,kind:'Ponto ferroviário',line_type:'Não classificada'})),'point',subIndex,subs.assignments.points);
 const sbSegments=decorateSubs(rawSB,'sb',subIndex,subs.assignments.sb),pnPoints=decorateSubs(rawPN,'pn',subIndex,subs.assignments.pn),stations=decorateSubs(rawStations,'station',subIndex);
 const catalogs=[{...c1,id:'operation-2023',assetBase:'assets/operation'},{...c2,id:'rumo-2015',assetBase:'assets/operation-2015'}];
 const subOptions=[...new Set([...subs.subs,...c1.subs,...c2.subs])].sort((a,b)=>Number(a)-Number(b));
 const data={points,sbSegments,pnPoints,stations,catalogs,malhaIndex,subOptions};
 const context=createLocationContext(data),root=document.querySelector('#content');let view,map;
 function dialog(title,body){const d=document.querySelector('#modal');d.classList.remove('location-dialog');d.innerHTML='<div class="modal-head"><h2></h2><button class="close" aria-label="Fechar">×</button></div><div class="modal-body">'+body+'</div>';d.querySelector('h2').textContent=title;d.querySelector('.close').onclick=()=>d.close();if(!d.open)d.showModal()}
 function inspect(reference,filters){openLocationDetails({reference,context,filters,dialog,onEdit:p=>{window.lastEdit=p.id;dialog('Editar cadastro','Formulário existente')},onMap:mountMap})}
 function mountMap(focus,overrides={}){view?.destroy();view=mountOperationMap({L,root,...data,catalog:catalogs[0],focus,onInspect:inspect,onPoint:p=>inspect({type:'point',id:p.id}),onMap:m=>map=m,onRecords:mountRecords,onPresentation:()=>{},onAdd:()=>{},...overrides})}
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
 const clickGeographicType=async type=>{
  const result=await page.evaluate(type=>{
   const layers=[];testApi.map.eachLayer(l=>{if(l.options?.groupRows?.some(r=>r.type===type))layers.push(l)});
   layers.sort((a,b)=>a.options.groupRows.length-b.options.groupRows.length);
   if(!layers.length)throw Error('Geographic type not found: '+type);
   const layer=layers[0],index=layer.options.groupRows.findIndex(r=>r.type===type),size=layer.options.groupRows.length;
   layer.fire('click',{latlng:layer.getLatLng()});return {index,size};
  },type);
  if(result.size>1){for(let i=0;i<Math.floor(result.index/8);i++)await page.click('[data-group-next]');await page.locator('[data-group-details]').nth(result.index%8).click()}
 };
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
 await clickGeographicType('pn');
 assert.equal(await page.locator('#location-scope').inputValue(),'selected');
 await expectText('#modal','Passagem de nível');await expectText('#modal','Malha Norte');
 await page.click('[data-location-map]');
 assert.equal(await page.locator('#geo-malha').inputValue(),'RMN');
 assert.equal(await page.locator('#geo-pn').inputValue(),'on');
 await page.selectOption('#geo-malha','');
 await page.selectOption('#geo-sub-from','74');
 assert.equal(await page.locator('#geo-sub-to').isEnabled(),true);
 await expectText('#operation-caption','SUB 74');
 const exact=await page.locator('#operation-caption').innerText();
 await page.selectOption('#geo-sub-to','98');
 await expectText('#operation-caption','SUB 74–98');
 const range=await page.locator('#operation-caption').innerText();
 const pointCount=s=>Number(s.split(' pontos')[0].replaceAll('.',''));
 assert.ok(pointCount(exact)>0,'A single SUB must show mapped points');
 assert.ok(pointCount(range)>pointCount(exact),'The inclusive interval must add points from other SUBs');
 await clickGeographicType('point');
 await expectText('#modal','SUB 74–98');
 assert.equal(await page.locator('#location-scope').inputValue(),'selected');
 await close();
 await page.selectOption('#geo-sub-from','');
 assert.equal(await page.locator('#geo-sub-to').inputValue(),'');
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
 await page.locator('[data-location-candidate]').first().click();assert.equal(await page.locator('.location-origin .directions-link').count(),1);assert.equal(await page.locator('.location-origin .maps-link:not(.directions-link)').count(),1);await close();
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>testApi.inspect({type:'station',id:'TAG'}));
 assert.equal(await page.locator('#modal').evaluate(d=>d.scrollWidth<=d.clientWidth),true,'Modal must fit mobile width');
 await page.screenshot({path:path.join(output,'mobile-modal.png')});await close();
 await page.click('[data-tab="pn"]');await expectText('#catalog-table','Passagem de nível');
 // Deterministic result set: check all pages against the actual map layers and bounds.
 await page.setViewportSize({width:1440,height:1000});
 await page.reload();await page.waitForFunction(()=>window.ready);
 await page.evaluate(()=>{
  const points=Array.from({length:85},(_,i)=>({id:'test-'+i,name:'Local '+String(i).padStart(2,'0'),yard:'TEST',source_km:String(i),lat:-23-i*.01,lng:-46-i*.01,kind:i%2?'Pátio':'AMV',line_type:i%2?'Dupla':'Singela',subCodes:[i<45?'74':'75']}));
  window.stagePoints=points;
  testApi.mountMap(undefined,{points,sbSegments:[{id:'TEST',coordinates:[[-46,-23],[-46.1,-23.1]],subCodes:['74']}],pnPoints:[{id:'test-pn',name:'Travessia especial',lat:-23,lng:-46,subCodes:['74']}],stations:[],onInspect:ref=>window.lastInspect=ref});
 });
 await page.click('[data-mode="geographic"]');
 await expectText('#operation-results','Nenhuma camada ativada');
 assert.equal(await page.locator('#operation-fit').isDisabled(),true);
 await page.selectOption('#geo-points','on');
 const markerCount=()=>page.evaluate(()=>{let n=0;testApi.map.eachLayer(l=>{if(l.options?.groupRows)n+=l.options.groupRows.filter(r=>r.type==='point').length});return n});
 assert.equal(await markerCount(),85);await expectText('.results-total','85 resultados');
 const seen=[];
 for(let pageNumber=0;pageNumber<3;pageNumber++){
  seen.push(...await page.locator('[data-result]').allTextContents());
  assert.equal(await markerCount(),85,'Changing list page must not remove map results');
  if(pageNumber<2)await page.click('#results-next');
 }
 assert.equal(seen.length,85);assert.equal(new Set(seen).size,85);
 assert.equal(await page.locator('#results-next').isDisabled(),true);
 await page.click('#operation-fit');
 assert.equal(await page.evaluate(()=>stagePoints.every(p=>testApi.map.getBounds().contains([p.lat,p.lng]))),true,'Fit includes all pages');
 await page.selectOption('#geo-kind','AMV');
 await expectText('.results-total','43 resultados');await expectText('.map-results-pager','1 / 2');assert.equal(await markerCount(),43);
 await page.click('#results-next');
 await page.fill('#operation-search','Local 84');
 await expectText('.results-total','1 resultado');assert.equal(await markerCount(),1);await expectText('.map-results-pager','1 / 1');
 const routeURL=new URL(await page.locator('#operation-results .directions-link').getAttribute('href'));
 assert.equal(routeURL.pathname,'/maps/dir/');assert.equal(routeURL.searchParams.get('destination'),await page.evaluate(()=>`${stagePoints[84].lat},${stagePoints[84].lng}`));
 await page.locator('[data-result]').click();assert.equal(await page.evaluate(()=>window.lastInspect),undefined,'Ver no mapa must not open details');
 await page.locator('[data-result-details]').click();assert.equal(await page.evaluate(()=>lastInspect.id),'test-84');
 await page.fill('#operation-search','inexistente');
 assert.equal(await markerCount(),0);await expectText('#operation-results','Nenhum resultado');assert.equal(await page.locator('#operation-fit').isDisabled(),true);
 await page.fill('#operation-search','');await page.selectOption('#geo-kind','');
 await page.selectOption('#geo-line','Dupla');await expectText('.results-total','42 resultados');assert.equal(await markerCount(),42);
 await page.selectOption('#geo-line','');
 await page.selectOption('#geo-sub-from','74');await page.selectOption('#geo-sb','off');await page.selectOption('#geo-pn','off');
 await expectText('.results-total','45 resultados');assert.equal(await markerCount(),45);
 await page.selectOption('#geo-sub-to','75');await expectText('.results-total','87 resultados');
 await page.selectOption('#geo-sb','off');await page.selectOption('#geo-pn','off');await expectText('.results-total','85 resultados');
 await page.selectOption('#geo-points','off');await page.selectOption('#geo-stations','off');
 await page.fill('#operation-search','Travessia');await expectText('#operation-results','Nenhuma camada ativada');
 await page.selectOption('#geo-pn','on');await expectText('.results-total','1 resultado');
 await page.selectOption('#geo-pn','off');await expectText('#operation-results','Nenhuma camada ativada');
 await page.selectOption('#geo-sb','on');await page.fill('#operation-search','SB TEST');
 await expectText('.results-total','1 resultado');await expectText('#operation-results','ponto médio da SB');
 assert.equal(new URL(await page.locator('#operation-results .directions-link').getAttribute('href')).pathname,'/maps/dir/');
 await page.selectOption('#geo-points','on');await page.fill('#operation-search','Local');
 await page.screenshot({path:path.join(output,'stage1-desktop.png')});
 await page.setViewportSize({width:390,height:844});await page.click('button[data-mobile-view="list"]');
 assert.equal(await page.locator('.map-panel').evaluate(e=>e.scrollWidth<=e.clientWidth),true,'Results fit mobile panel');
 await page.locator('#results-next').click();await expectText('.map-results-pager','2 / 3');
 await page.screenshot({path:path.join(output,'stage1-mobile.png')});
 // Stage 2: real data must keep the same geographic scope in records and exports.
 await page.setViewportSize({width:1440,height:1000});await page.reload();await page.waitForFunction(()=>window.ready);
 await page.click('[data-mode="geographic"]');await page.selectOption('#geo-malha','RMN');
 await expectText('#active-filters','Malha Norte');await page.click('[data-remove-filter="malha"]');
 assert.equal(await page.locator('#geo-malha').inputValue(),'');
 await page.selectOption('#geo-sub-from','74');await page.selectOption('#geo-pn','off');
 const readTotal=async()=>Number((await page.locator('.results-total').innerText()).split(' ')[0].replaceAll('.',''));
 const totalBeforeRecords=await readTotal();
 const captionCounts=(await page.locator('#operation-caption').innerText()).split(' · ').slice(0,4).map(s=>Number(s.split(' ')[0].replaceAll('.','')));
 assert.ok(totalBeforeRecords>40);
 await page.click('#all-records');await expectText('.records-map-scope','SUB 74');await expectText('.records-map-scope',`${totalBeforeRecords.toLocaleString('pt-BR')} resultados`);
 for(const [i,tab] of ['points','sb','pn','stations'].entries()){
  await page.click(`[data-tab="${tab}"]`);
  if(captionCounts[i])assert.equal(Number((await page.locator('#catalog-table .pager span').innerText()).split(' ')[0].replaceAll('.','')),captionCounts[i]);
  else await expectText('#catalog-table','Nenhum registro');
 }
 await page.click('[data-tab="points"]');
 const downloadEvent=page.waitForEvent('download');await page.click('#catalog-export');
 const download=await downloadEvent;const csv=await readFile(await download.path(),'utf8');
 assert.equal(csv.trim().split('\r\n').length,captionCounts[0]+1,'CSV exports the complete filtered category, not just the current page');
 await page.click('#back-filtered-map');
 assert.equal(await page.locator('#geo-sub-from').inputValue(),'74');assert.equal(await page.locator('#geo-pn').inputValue(),'off');assert.equal(await readTotal(),totalBeforeRecords);
 await page.locator('[data-result]').first().click();assert.equal(await page.locator('#modal').evaluate(d=>d.open),false);
 assert.equal(await page.locator('.map-result.selected').count(),1);
 await page.locator('[data-result-details]').first().click();assert.equal(await page.locator('#modal').evaluate(d=>d.open),true);await close();
 await page.setViewportSize({width:390,height:844});
 await page.click('button[data-mobile-view="list"]');
 assert.equal(await page.locator('.map-result.selected').count(),1);assert.equal(await readTotal(),totalBeforeRecords);
 assert.equal(await page.locator('.map-panel').evaluate(e=>e.scrollWidth<=e.clientWidth),true);
 await page.screenshot({path:path.join(output,'stage2-mobile-list.png')});
 await page.locator('[data-result]').first().click();
 assert.equal(await page.locator('.operation-layout').getAttribute('data-mobile-view'),'map');
 assert.equal(await page.locator('#modal').evaluate(d=>d.open),false);
 await page.click('button[data-mobile-view="filters"]');
 await page.selectOption('#geo-sub-to','75');await expectText('#active-filters','SUB 74–75');
 await page.click('[data-remove-filter="sub"]');assert.equal(await page.locator('#geo-sub-from').inputValue(),'');assert.equal(await page.locator('#geo-sub-to').inputValue(),'');
 await page.fill('#operation-search','TAG');await expectText('#active-filters','Busca: TAG');
 await page.click('button[data-mobile-view="list"]');
 await page.click('#all-records');await expectText('.records-map-scope','Busca: TAG');
 await page.click('#clear-record-scope');assert.equal(await page.locator('.records-map-scope').count(),0);assert.equal(await page.locator('[data-tab]').count(),7);
 await page.click('#test-map');await page.click('button[data-mobile-view="filters"]');
 assert.equal(await page.locator('#operation-search').inputValue(),'TAG');
 await page.click('#clear-map-filters');
 for(const id of ['points','pn','sb','stations'])assert.equal(await page.locator('#geo-'+id).inputValue(),'on');
 assert.equal(await page.locator('#operation-search').inputValue(),'');assert.equal(await page.locator('[data-remove-filter]').count(),0);
 await page.click('button[data-mobile-view="list"]');await page.screenshot({path:path.join(output,'stage2-mobile-all.png')});
 await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:path.join(output,'stage2-desktop.png')});
 // Stage 3: overlap across layers, all group pages, exact destinations and zoom.
 await page.setViewportSize({width:1440,height:1000});await page.reload();await page.waitForFunction(()=>window.ready);
 await page.evaluate(()=>{
  const points=Array.from({length:90},(_,i)=>({id:'overlap-'+i,name:'Local sobreposto',yard:'DUP',source_km:String(i),lat:-23-i*.0000001,lng:-46,kind:'AMV',line_type:'Singela',subCodes:['74']}));
  points.push({id:'far-point',name:'Local distante',lat:-23.5,lng:-46.5,kind:'AMV',line_type:'Singela',subCodes:['75']});
  window.overlapPoints=points;
  testApi.mountMap(undefined,{points,sbSegments:[],pnPoints:[{id:'overlap-pn',name:'PN sobreposta',lat:-23.00001,lng:-46,subCodes:['74']}],stations:[{code:'DUP',name:'Estação sobreposta',lat:-23.00002,lng:-46,records:[{sub:'74',km:'10'}],subCodes:['74']}],onInspect:r=>window.overlapInspect=r});
 });
 await page.click('[data-mode="geographic"]');await page.click('#clear-map-filters');
 await expectText('.results-total','93 resultados');
 const representation=()=>page.evaluate(()=>{let total=0,groups=0;testApi.map.eachLayer(l=>{const rows=l.options?.groupRows;if(rows){total+=rows.length;if(rows.length>1)groups++}});return {total,groups}});
 assert.equal((await representation()).total,93);assert.ok((await representation()).groups>0);
 const overviewZoom=await page.evaluate(()=>testApi.map.getZoom());
 await page.locator('.map-cluster').first().focus();await page.keyboard.press('Enter');
 assert.equal(await page.locator('.cluster-choice').count(),1,'Groups are keyboard accessible');
 await page.click('[data-group-zoom]');assert.ok(await page.evaluate(()=>testApi.map.getZoom())>overviewZoom);
 assert.equal((await representation()).total,93,'Zoom must conserve every result');
 await page.evaluate(()=>testApi.map.setView([-23,-46],19));
 const coincident=await page.evaluate(()=>{let found;testApi.map.eachLayer(l=>{if(l.options?.groupRows?.some(r=>r.item.id==='overlap-89'))found=l});const rows=found.options.groupRows;found.fire('click');return {count:rows.length,index:rows.findIndex(r=>r.item.id==='overlap-89')}});
 assert.equal(coincident.count,92);assert.equal(await page.locator('[data-group-zoom]').count(),0,'At maximum zoom overlapping points remain individually accessible');
 const groupMembers=[];
 for(let i=0;i<Math.ceil(coincident.count/8);i++){
  groupMembers.push(...await page.locator('[data-group-key]').evaluateAll(rows=>rows.map(r=>r.dataset.groupKey)));
  if(i+1<Math.ceil(coincident.count/8))await page.click('[data-group-next]');
 }
 assert.equal(groupMembers.length,92);assert.equal(new Set(groupMembers).size,92);
 const chosen=page.locator('[data-group-key="point:overlap-89"]');
 const chosenURL=new URL(await chosen.locator('.directions-link').getAttribute('href'));
 assert.equal(chosenURL.searchParams.get('destination'),await page.evaluate(()=>`${overlapPoints[89].lat},${overlapPoints[89].lng}`));
 await chosen.locator('[data-group-details]').click();await page.waitForFunction(()=>!document.querySelector('.cluster-choice'));assert.deepEqual(await page.evaluate(()=>overlapInspect),{type:'point',id:'overlap-89'});
 assert.equal(await page.evaluate(()=>testApi.map.getZoom()),19,'Choosing a member must not zoom out from the maximum detail');
 assert.equal(await page.locator('.map-result.selected').count(),1);
 await page.evaluate(()=>{testApi.map.setView([-23,-46],19);let l;testApi.map.eachLayer(x=>{if(x.options?.groupRows?.length===92)l=x});l.fire('click')});
 await page.selectOption('#geo-pn','off');await page.waitForFunction(()=>!document.querySelector('.cluster-choice'));assert.equal(await page.locator('.cluster-choice').count(),0,'Changing filters closes stale group choices');
 assert.equal((await representation()).total,92);await expectText('.results-total','92 resultados');
 await page.selectOption('#geo-stations','off');assert.equal((await representation()).total,91);
 await page.fill('#operation-search','distante');assert.equal((await representation()).total,1);assert.equal((await representation()).groups,0);
 await page.fill('#operation-search','');await page.selectOption('#geo-pn','on');await page.selectOption('#geo-stations','on');
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>{testApi.map.setView([-23,-46],19);let l;testApi.map.eachLayer(x=>{if(x.options?.groupRows?.length===92)l=x});l.fire('click')});
 assert.equal(await page.locator('.cluster-choice').evaluate(e=>e.scrollWidth<=e.clientWidth),true,'Group choice fits mobile width');
 await page.waitForFunction(()=>{const popup=document.querySelector('.leaflet-popup');return popup&&Number(getComputedStyle(popup).opacity)===1&&popup.getBoundingClientRect().top>=document.querySelector('.map-toolbar').getBoundingClientRect().bottom+8});
 assert.equal(await page.locator('.leaflet-popup-close-button').evaluate(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}),true,'Map controls must not cover the mobile close button');
 await page.screenshot({path:path.join(output,'stage3-mobile-overlap.png')});
 await page.locator('[data-group-map]').first().click();
 await page.waitForFunction(()=>!document.querySelector('.cluster-choice'));
 assert.equal(await page.locator('.cluster-choice').count(),0);assert.equal(await page.locator('.map-result.selected').count(),1);
 assert.equal((await representation()).total,93);
 await page.setViewportSize({width:1440,height:1000});await page.reload();await page.waitForFunction(()=>window.ready);
 await page.click('[data-mode="geographic"]');await page.click('#clear-map-filters');
 assert.equal(await page.locator('.map-cluster').evaluateAll(markers=>markers.every(m=>{const a=m.getBoundingClientRect(),b=m.querySelector('span').getBoundingClientRect();return Math.abs(a.x+a.width/2-b.x-b.width/2)<2&&Math.abs(a.y+a.height/2-b.y-b.height/2)<2})),true,'Cluster counts are centered and readable');
 await page.screenshot({path:path.join(output,'stage3-desktop.png')});
 assert.deepEqual(errors,[]);
 console.log('PASS: map/modal and records regressions; complete filtered CSV; clusters conserve results; all 92 overlapping members accessible; exact routes, keyboard, zoom, filters, centered counts and mobile popup layout.');
}finally{await browser?.close();await new Promise(r=>server.close(r))}
