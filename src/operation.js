import {MALHAS,malhaForPoint,malhaForLine} from './malhas.js';
import {subMatches,subLabel} from './subs.js';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const fmt=n=>Number(n).toLocaleString('pt-BR');
const label=item=>item.category==='SUB'?`SUB ${item.text}`:item.text;
const boundsFor=(L,box)=>L.latLngBounds([[-box[3],box[0]],[-box[1],box[2]]]);
const sectionName=(catalog,id)=>catalog.details.find(d=>d.id===id)?.name||'Mapa geral';
const matches=(item,q)=>norm(`${label(item)} ${item.contextText||''} ${[...item.codes,...(item.anchorCodes||[])].join(' ')}`).includes(norm(q));
const pointMatches=(p,q)=>norm(`${p.name} ${p.yard} ${p.source_km} ${p.kind}`).includes(norm(q));
const option=(value,text,selected)=>`<option value="${esc(value)}" ${value===selected?'selected':''}>${esc(text)}</option>`;
let mapMode='drawing',selectedCatalogId='',geographicState={};
let recordTab='locations',recordQuery='',recordSection='',recordPage=0,recordKind='';

export function mountOperationMap({L,root,catalog,catalogs=[catalog],points,sbSegments,pnPoints,stations,malhaIndex,subOptions=[],onPoint,onInspect,onAdd,onRecords,onMap,onPresentation,focus}){
 let map,observer,highlight,pointLayer,sbLayer,pnLayer,stationLayer,hitLayer,pointCanvas,tile,adding=false,query='',showHits=false;
 let {showPoints=false,showSB=false,showPN=false,showStations=false,showNames=false,kind='',line='',malha='',subFrom='',subTo='',baseMode='street'}=geographicState;
 catalog=catalogs.find(c=>c.id===(focus?.catalogId||selectedCatalogId))||catalog;
 let currentPoints=points;
 const locatedStations=stations.filter(s=>Number.isFinite(s.lat)&&Number.isFinite(s.lng));
 const pointMalhas=new WeakMap(),pnMalhas=new WeakMap(),sbMalhas=new WeakMap(),stationMalhas=new WeakMap();
 const pointCode=p=>{if(!pointMalhas.has(p))pointMalhas.set(p,malhaForPoint(malhaIndex,p.lat,p.lng));return pointMalhas.get(p)};
 const pnCode=p=>{if(!pnMalhas.has(p))pnMalhas.set(p,malhaForPoint(malhaIndex,p.lat,p.lng));return pnMalhas.get(p)};
 const sbCode=s=>{if(!sbMalhas.has(s))sbMalhas.set(s,malhaForLine(malhaIndex,s.coordinates));return sbMalhas.get(s)};
 const stationCode=s=>{if(!stationMalhas.has(s))stationMalhas.set(s,malhaForPoint(malhaIndex,s.lat,s.lng));return stationMalhas.get(s)};
 const inMalha=code=>!malha||code===malha;
 const inSub=item=>subMatches(item.subCodes,subFrom,subTo);
 const $=s=>root.querySelector(s);
 const fullBox=()=>[0,0,catalog.width,catalog.height];
 const sourcePath=()=>`${catalog.assetBase}/source.pdf`;
 const inspect=(reference,useFilters=true)=>onInspect(reference,useFilters&&mapMode==='geographic'?{layers:{points:showPoints,sb:showSB,pn:showPN,stations:showStations},malha,kind,line,subFrom,subTo}:undefined);
 const selectFilter=(id,label,choices,value,swatch='')=>`<label class="geo-filter" for="${id}"><span class="geo-filter-label">${swatch}${label}</span><select id="${id}">${choices.map(([v,t])=>option(v,t,value)).join('')}</select></label>`;
 const showHide=(id,label,shown,swatch='')=>selectFilter(id,label,[['off','Ocultar'],['on','Mostrar']],shown?'on':'off',swatch);
 function geographicControls(){
  const pointTypes=[...new Set(currentPoints.map(p=>p.kind))].sort();
  return `<div class="layer-section geo-controls"><h3>Filtrar</h3>
   ${selectFilter('geo-malha','Malha ferroviária',[['','Todas as malhas'],...MALHAS.map(m=>[m.code,m.name])],malha)}
   ${selectFilter('geo-sub-from','SUB inicial',[['','Todas as SUBs'],...subOptions.map(n=>[n,`SUB ${n}`])],subFrom)}
   ${selectFilter('geo-sub-to','SUB final (opcional)',[['','Somente a SUB inicial'],...subOptions.map(n=>[n,`SUB ${n}`])],subTo)}
   ${selectFilter('geo-kind','Tipo dos pontos',[['','Todos os tipos'],...pointTypes.map(k=>[k,k])],kind)}
   ${selectFilter('geo-line','Linha dos pontos',[['','Todos os tipos de linha'],...['Não classificada','Singela','Dupla','Desviada'].map(k=>[k,k])],line)}
   <p class="panel-note">Para uma SUB, escolha apenas a inicial. Para um intervalo, escolha também a final; as duas entram no recorte. A malha e a SUB atuam juntas.</p><p class="panel-note">Estações e PN com SUB explícita usam a fonte. Demais associações por estação próxima são estimativas; locais sem SUB identificada só aparecem em “Todas as SUBs”.</p></div>
   <div class="layer-section geo-controls"><h3>Exibir no mapa</h3>
   ${showHide('geo-points','Pontos e cadastros',showPoints,'<i class="dot"></i>')}
   ${showHide('geo-sb','SB do KML',showSB,'<i class="sb-swatch"></i>')}
   ${showHide('geo-pn','Passagens de nível',showPN,'<i class="pn-swatch"></i>')}
   ${showHide('geo-stations','Estações (SIV 2015)',showStations,'<i class="station-swatch"></i>')}
   ${showHide('geo-names','Nomes dos pontos',showNames)}
   ${selectFilter('geo-base','Base cartográfica',[['street','Ruas'],['terrain','Terreno']],baseMode)}
   <p class="panel-note">${fmt(currentPoints.length)} pontos · ${fmt(sbSegments.length)} SB · ${fmt(pnPoints.length)} PN · ${fmt(locatedStations.length)} estações localizadas. ${fmt(stations.length-locatedStations.length)} estações sem coordenadas permanecem na tabela para download.</p></div>`;
 }
 function drawingControls(){
  return `<div class="layer-section geo-controls"><h3>Prancha e referências</h3>
   ${selectFilter('drawing-source','Documento',catalogs.map(c=>[c.id,c.title+' · '+c.sourceDate]),catalog.id)}
   ${selectFilter('sub-select','Localizar SUB',[['','Selecione uma SUB'],...catalog.subs.map(n=>[n,'SUB '+n])],'')}
   ${selectFilter('detail-select','Quadro de detalhe',[['','Mapa geral'],...catalog.details.map(d=>[d.id,d.name])],'')}
   ${showHide('hit-toggle','Destacar rótulos clicáveis',showHits)}
   <p class="panel-note">Clique em uma localidade para consultar KMs, cadastros e pontos próximos. A localização é vinculada por sigla.</p>
   <p class="panel-note">${esc(catalog.notice||catalog.sourceStatus||'As cores, limites e conexões são preservados do documento original.')}</p></div>`;
 }

 function disposePointCanvas(){if(!pointCanvas)return;L.Util.cancelAnimFrame(pointCanvas._redrawRequest);pointCanvas._redrawRequest=null;if(map?.hasLayer(pointCanvas))map.removeLayer(pointCanvas);pointCanvas=null}
 function stop(){geographicState={showPoints,showSB,showPN,showStations,showNames,kind,line,malha,subFrom,subTo,baseMode};observer?.disconnect();disposePointCanvas();map?.stop();map?.remove();map=null}
 function shell(){
  stop();adding=false;showHits=false;selectedCatalogId=catalog.id;
  root.innerHTML=`<div class="map-layout operation-layout"><aside class="map-panel operation-panel"><div class="eyebrow">REDE FERROVIÁRIA</div><h2>Mapa de operação</h2><p class="source-date">${mapMode==='drawing'?`Base SIV · ${esc(catalog.sourceDate)} · prancha completa`:'Consulta integrada · pontos, PN, SB e estações'}</p><div class="view-switch"><button data-mode="drawing" class="${mapMode==='drawing'?'active':''}">Prancha interativa</button><button data-mode="geographic" class="${mapMode==='geographic'?'active':''}">Mapa geográfico</button></div><label class="search-label" for="operation-search">Buscar na ${mapMode==='drawing'?'prancha':'malha'}</label><input id="operation-search" class="search" type="search" placeholder="${mapMode==='drawing'?'Nome, sigla, KM ou SUB':'Nome, sigla, KM, SB ou estação'}" value="${esc(query)}"><div id="operation-results" class="results" aria-live="polite"></div>${mapMode==='drawing'?drawingControls():geographicControls()}<div class="map-source-links"><button id="all-records">Consultar registros</button><a href="${sourcePath()}" target="_blank" rel="noopener">Abrir PDF original ↗</a>${mapMode==='geographic'?'<a href="assets/rail-stations.json" download>Baixar tabela de estações ↧</a>':''}</div></aside><section class="map-wrap" aria-label="${mapMode==='drawing'?'Prancha operacional interativa':'Mapa geográfico da malha completa'}"><div id="map"></div><div class="map-toolbar"><div class="row"><button id="layers-mobile" class="mobile-brand">Explorar</button><button id="operation-fit">Enquadrar mapa</button></div><div class="row"><button id="exit-present" class="present-only">Sair da apresentação</button>${mapMode==='geographic'?'<button id="add-map" class="primary">+ Novo ponto</button>':''}</div></div><div class="map-caption" id="operation-caption"></div><div class="drawing-hint" ${mapMode==='drawing'?'':'hidden'}>Role para ampliar · Arraste para navegar · Clique nos rótulos</div></section></div>`;
  root.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mapMode=b.dataset.mode;query='';shell()});
  $('#operation-search').oninput=e=>{query=e.target.value;search()};
  $('#operation-fit').onclick=fit;
  $('#all-records').onclick=()=>onRecords();
  $('#layers-mobile').onclick=()=>$('.map-panel').classList.toggle('open');
  $('#exit-present').onclick=()=>onPresentation(false);
  map=L.map('map',{crs:mapMode==='drawing'?L.CRS.Simple:L.CRS.EPSG3857,minZoom:mapMode==='drawing'?-3:2,maxZoom:mapMode==='drawing'?4:19,preferCanvas:true,renderer:new SafeCanvas({padding:.5,tolerance:3}),zoomAnimation:false,zoomControl:false,attributionControl:mapMode!=='drawing'});
  onMap(map);
  L.control.zoom({position:'topright'}).addTo(map);
  if(mapMode==='drawing'){
   const bounds=boundsFor(L,fullBox());
   L.tileLayer(`${catalog.assetBase}/tiles/{z}/{x}/{y}.png`,{tileSize:catalog.tileSize,minZoom:-3,maxZoom:4,minNativeZoom:0,maxNativeZoom:catalog.maxNativeZoom,noWrap:true,bounds,keepBuffer:2}).addTo(map);
   map.setMaxBounds(bounds.pad(.15));
   hitLayer=L.featureGroup().addTo(map);
   const renderer=new SafeCanvas({padding:.5,tolerance:3});
   catalog.items.forEach(item=>{
    const rect=L.rectangle(boundsFor(L,item.box),{renderer,color:item.category==='SUB'?'#e32028':'#0075dc',weight:0,opacity:0,fillOpacity:0});
    rect.on('mouseover',()=>rect.setStyle({weight:1,opacity:.8,fillOpacity:.16}));
    rect.on('mouseout',()=>rect.setStyle({weight:showHits?1:0,opacity:showHits?.35:0,fillOpacity:showHits?.07:0}));
    rect.on('click',()=>showItem(item,false));
    rect.addTo(hitLayer);
   });
   $('#hit-toggle').onchange=e=>{showHits=e.target.value==='on';hitLayer.eachLayer(layer=>layer.setStyle({weight:showHits?1:0,opacity:showHits?.35:0,fillOpacity:showHits?.07:0}))};
   $('#sub-select').onchange=e=>{const item=catalog.items.find(i=>i.category==='SUB'&&i.text===e.target.value&&i.section==='general')||catalog.items.find(i=>i.category==='SUB'&&i.text===e.target.value);if(item){showItem(item,true);$('.map-panel').classList.remove('open')}};
   $('#drawing-source').onchange=e=>{catalog=catalogs.find(c=>c.id===e.target.value);query='';shell()};
   $('#detail-select').onchange=e=>{if(highlight)map.removeLayer(highlight);const detail=catalog.details.find(d=>d.id===e.target.value);map.fitBounds(boundsFor(L,detail?.box||fullBox()),{padding:[35,35]});$('.map-panel').classList.remove('open')};
   $('#operation-caption').textContent=`${fmt(catalog.items.length)} rótulos consultáveis · ${catalog.subs.length} SUB · Cores originais`;
  }else{
   setBase(baseMode);L.control.scale({imperial:false,position:'bottomright'}).addTo(map);
   pointLayer=L.layerGroup().addTo(map);sbLayer=L.featureGroup().addTo(map);pnLayer=L.layerGroup().addTo(map);stationLayer=L.layerGroup().addTo(map);
   $('#geo-sub-to').disabled=!subFrom;
   const activateLayers=()=>{showPoints=showSB=showPN=showStations=true;for(const id of ['geo-points','geo-sb','geo-pn','geo-stations'])$('#'+id).value='on'};
   $('#geo-malha').onchange=e=>{malha=e.target.value;if(malha){activateLayers();kind=line='';$('#geo-kind').value=$('#geo-line').value=''}drawGeo();search();fit()};
   $('#geo-sub-from').onchange=e=>{subFrom=e.target.value;if(!subFrom){subTo='';$('#geo-sub-to').value=''}$('#geo-sub-to').disabled=!subFrom;if(subFrom)activateLayers();drawGeo();search();fit()};
   $('#geo-sub-to').onchange=e=>{subTo=e.target.value;if(subFrom)activateLayers();drawGeo();search();fit()};
   for(const [id,update] of [['geo-points',v=>showPoints=v],['geo-sb',v=>showSB=v],['geo-pn',v=>showPN=v],['geo-stations',v=>showStations=v],['geo-names',v=>showNames=v]])$('#'+id).onchange=e=>{update(e.target.value==='on');drawGeo()};
   $('#geo-kind').onchange=e=>{kind=e.target.value;drawGeo();search()};
   $('#geo-line').onchange=e=>{line=e.target.value;drawGeo();search()};
   $('#geo-base').onchange=e=>setBase(e.target.value);
   $('#add-map').onclick=()=>{adding=!adding;$('#add-map').textContent=adding?'Clique no mapa ou cancele':'+ Novo ponto'};
   map.on('click',e=>{if(adding){adding=false;$('#add-map').textContent='+ Novo ponto';onAdd(e.latlng)}else inspect({type:'coordinate',lat:e.latlng.lat,lng:e.latlng.lng})});
   drawGeo();
  }
  observer=new ResizeObserver(()=>map?.invalidateSize());observer.observe($('#map'));
  fit();search();
 }
 function fit(){
  if(mapMode==='drawing'){map.fitBounds(boundsFor(L,fullBox()),{padding:[15,15]});return}
  const bounds=L.latLngBounds([]);
  const visiblePoints=currentPoints.filter(p=>inMalha(pointCode(p))&&inSub(p)&&(!kind||p.kind===kind)&&(!line||p.line_type===line));
  const visibleSB=sbSegments.filter(s=>inMalha(sbCode(s))&&inSub(s));
  const visiblePN=pnPoints.filter(p=>inMalha(pnCode(p))&&inSub(p));
  const visibleStations=locatedStations.filter(s=>inMalha(stationCode(s))&&inSub(s));
  if(showPoints)visiblePoints.forEach(p=>bounds.extend([p.lat,p.lng]));
  if(showSB)visibleSB.forEach(s=>s.coordinates.forEach(([lng,lat])=>bounds.extend([lat,lng])));
  if(showPN)visiblePN.forEach(p=>bounds.extend([p.lat,p.lng]));
  if(showStations)visibleStations.forEach(s=>bounds.extend([s.lat,s.lng]));
  if(!bounds.isValid()&&!subFrom&&!malha)currentPoints.forEach(p=>bounds.extend([p.lat,p.lng]));
  if(bounds.isValid())map.fitBounds(bounds,{padding:[30,30]});
 }
const SafeCanvas=L.Canvas.extend({
 _redraw(){if(!this._ctx)return;L.Canvas.prototype._redraw.call(this)}
});
const NamedPointsCanvas=SafeCanvas.extend({
 _updateCircle(layer){
  L.Canvas.prototype._updateCircle.call(this,layer);
  if(!this._drawing||layer._empty()||!layer.options.pointName)return;
  const ctx=this._ctx,p=layer._point;
  ctx.save();ctx.font='700 12px Cera, Verdana, sans-serif';ctx.textBaseline='middle';
  const dark=document.documentElement.dataset.theme==='dark';
  ctx.lineWidth=3;ctx.lineJoin='round';ctx.strokeStyle=dark?'#0b1824':'#ffffff';ctx.fillStyle=dark?'#e2ecf3':'#003865';
  ctx.strokeText(layer.options.pointName,p.x+9,p.y);ctx.fillText(layer.options.pointName,p.x+9,p.y);ctx.restore();
 }
});

 function setBase(mode){
  baseMode=mode;
  if(tile)map.removeLayer(tile);
  tile=mode==='terrain'?L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,className:'base-terrain',attribution:'Tiles © Esri — Sources: Esri, HERE, Garmin, USGS, METI/NASA, OpenStreetMap contributors'}):L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,className:'base-street',attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'});tile.addTo(map);
 }
 function drawGeo(){
  if(mapMode!=='geographic')return;
  pointLayer.clearLayers();sbLayer.clearLayers();pnLayer.clearLayers();stationLayer.clearLayers();disposePointCanvas();pointCanvas=new NamedPointsCanvas({padding:.5,tolerance:8});let n=0;
  if(showSB)sbSegments.filter(s=>inMalha(sbCode(s))&&inSub(s)).forEach(s=>L.polyline(s.coordinates.map(([lng,lat])=>[lat,lng]),{color:'#007fa6',weight:3,opacity:.8,bubblingMouseEvents:false}).bindTooltip(`SB ${esc(s.id)}`,{sticky:true}).on('click',e=>{if(!adding)inspect({type:'sb',id:s.id,lat:e.latlng.lat,lng:e.latlng.lng})}).addTo(sbLayer));
  if(showPoints)currentPoints.forEach(p=>{if(!inMalha(pointCode(p))||!inSub(p)||(kind&&p.kind!==kind)||(line&&p.line_type!==line))return;n++;L.circleMarker([p.lat,p.lng],{radius:4,weight:1,color:'#fff',fillColor:'#0037dd',fillOpacity:1,renderer:pointCanvas,pointName:showNames?p.name:null,bubblingMouseEvents:false}).bindTooltip(esc(p.name)).on('click',()=>{if(!adding)inspect({type:'point',id:p.id})}).addTo(pointLayer)});
  if(showPN)pnPoints.filter(p=>inMalha(pnCode(p))&&inSub(p)).forEach(p=>L.circleMarker([p.lat,p.lng],{radius:5,weight:1.5,color:'#fff',fillColor:'#e86321',fillOpacity:1,renderer:pointCanvas,bubblingMouseEvents:false}).bindTooltip(esc(p.name)).on('click',()=>{if(!adding)inspect({type:'pn',id:p.id})}).addTo(pnLayer));
  if(showStations)locatedStations.filter(s=>inMalha(stationCode(s))&&inSub(s)).forEach(s=>L.circleMarker([s.lat,s.lng],{radius:6,weight:1.5,color:'#fff',fillColor:'#813bb7',fillOpacity:1,renderer:pointCanvas,bubblingMouseEvents:false}).bindTooltip(`${esc(s.name)} (${esc(s.code)})`).on('click',()=>{if(!adding)inspect({type:'station',id:s.code})}).addTo(stationLayer));
  $('#operation-caption').textContent=`${fmt(n)} pontos · ${showSB?fmt(sbSegments.filter(s=>inMalha(sbCode(s))&&inSub(s)).length):'0'} SB · ${showPN?fmt(pnPoints.filter(p=>inMalha(pnCode(p))&&inSub(p)).length):'0'} PN · ${showStations?fmt(locatedStations.filter(s=>inMalha(stationCode(s))&&inSub(s)).length):'0'} estações${malha?` · ${MALHAS.find(m=>m.code===malha)?.name}`:''}${subFrom?` · ${subLabel(subFrom,subTo)}`:''}`;
 }
 function search(){
  const q=query.trim();if(!q){$('#operation-results').innerHTML='';return}
  const rows=mapMode==='drawing'?catalog.items.filter(i=>matches(i,q)):currentPoints.filter(p=>inMalha(pointCode(p))&&inSub(p)&&(!kind||p.kind===kind)&&(!line||p.line_type===line)&&pointMatches(p,q));
  const sbRows=mapMode==='geographic'?sbSegments.filter(s=>inMalha(sbCode(s))&&inSub(s)&&norm(`SB ${s.id} ${s.km_start} ${s.km_end}`).includes(norm(q))):[];
  const pnRows=mapMode==='geographic'?pnPoints.filter(p=>inMalha(pnCode(p))&&inSub(p)&&norm(`${p.name} ${p.km} ${p.place} ${p.uf} ${p.section}`).includes(norm(q))):[];
  const stationRows=mapMode==='geographic'?locatedStations.filter(s=>inMalha(stationCode(s))&&inSub(s)&&norm(`${s.name} ${s.code} ${s.records.map(r=>`${r.km} ${r.sub}`).join(' ')}`).includes(norm(q))):[];
  const total=rows.length+sbRows.length+pnRows.length+stationRows.length;
  const visible=[...stationRows.map(item=>({item,type:'station'})),...rows.map(i=>({item:i,type:mapMode==='drawing'?'pdf':'point'})),...sbRows.map(item=>({item,type:'sb'})),...pnRows.map(item=>({item,type:'pn'}))].slice(0,40);
  $('#operation-results').innerHTML=visible.length?`<p class="results-total">${fmt(total)} resultados${total>40?' · primeiros 40':''}</p>${visible.map((r,i)=>`<button class="result" data-result="${i}">${esc(r.type==='pdf'?label(r.item):r.type==='sb'?`SB ${r.item.id}`:r.item.name)}<br><small>${esc(r.type==='pdf'?sectionName(catalog,r.item.section):r.type==='point'?r.item.kind:r.type==='pn'?`PN · ${r.item.place||r.item.section||r.item.km||'Passagem de nível'}`:r.type==='station'?`Estação ${r.item.code} · ${r.item.records.length} registro(s)`:`KM ${r.item.km_start} → ${r.item.km_end}`)}</small></button>`).join('')}`:'<p class="muted">Nenhum resultado.</p>';
  root.querySelectorAll('[data-result]').forEach(b=>b.onclick=()=>{const r=visible[Number(b.dataset.result)];if(r.type==='pdf')showItem(r.item,true);else if(r.type==='sb')focusSB(r.item);else{map.setView([r.item.lat,r.item.lng],15);inspect({type:r.type,id:r.type==='station'?r.item.code:r.item.id},false)}$('.map-panel').classList.remove('open')});
 }
 function focusSB(sb,consult=true){
  map.fitBounds(sb.coordinates.map(([lng,lat])=>[lat,lng]),{padding:[65,65],maxZoom:14});
  if(highlight)map.removeLayer(highlight);
  highlight=L.polyline(sb.coordinates.map(([lng,lat])=>[lat,lng]),{color:'#e32028',weight:5,bubblingMouseEvents:false}).bindTooltip(`SB ${esc(sb.id)}`).on('click',e=>inspect({type:'sb',id:sb.id,lat:e.latlng.lat,lng:e.latlng.lng},false)).addTo(map);
  if(consult)inspect({type:'sb',id:sb.id},false);
 }
 function showItem(item,zoom,consult=true){
  if(mapMode!=='drawing'){mapMode='drawing';shell()}
  const bounds=boundsFor(L,item.box);
  if(zoom)map.fitBounds(bounds.pad(2),{padding:[90,90],maxZoom:2});
  if(highlight)map.removeLayer(highlight);
  highlight=L.rectangle(bounds.pad(.25),{color:'#e32028',weight:2,fillOpacity:.13,interactive:false}).addTo(map);
  if(consult)inspect({type:'pdf',id:item.id,catalogId:catalog.id});
 }

 shell();
 if(focus?.type==='pdf'){const item=catalog.items.find(i=>i.id===focus.id);if(item)showItem(item,true,focus.inspect!==false)}
 if(focus&&['point','pn','station','sb','coordinate'].includes(focus.type)){
  if(mapMode!=='geographic'){mapMode='geographic';shell()}
  const collections={point:currentPoints,pn:pnPoints,station:stations,sb:sbSegments};
  const p=focus.type==='coordinate'?focus:collections[focus.type].find(i=>(i.id||i.code)===focus.id);
  if(p){
   if(focus.type==='sb')focusSB(p,focus.inspect!==false);
   else if(Number.isFinite(p.lat)&&Number.isFinite(p.lng)){
    map.setView([p.lat,p.lng],15);
    L.circleMarker([p.lat,p.lng],{radius:9,weight:3,color:'#e32028',fillOpacity:.15,bubblingMouseEvents:false}).bindTooltip(esc(p.title||p.name||'Local selecionado')).on('click',()=>inspect(focus,false)).addTo(map);
    if(focus.inspect!==false)inspect(focus,false);
   }
  }
 }
 return {destroy:stop,refresh:newPoints=>{currentPoints=newPoints;drawGeo();search()}};
}

export function recordsForPoint(catalogs,p){
 const code=String(p.yard||p.code||'').trim().toUpperCase();
 if(!code)return [];
 return (Array.isArray(catalogs)?catalogs:[catalogs]).filter(Boolean).flatMap(c=>c.items.filter(i=>[...i.codes,...(i.anchorCodes||[])].includes(code)).map(i=>({...i,catalogId:c.id||'operation-2023',sourceDate:c.sourceDate,sourceTitle:c.title})));
}

export function mountOperationRecords({root,catalog,catalogs=[catalog],points,sbSegments,pnPoints=[],stations=[],onPoint,onInspect,onAdd,onMap,focus}){
 const documents=catalogs.filter(Boolean).map(c=>({...c,id:c.id||'operation-2023',assetBase:c.assetBase||'assets/operation'}));
 const documentById=new Map(documents.map(c=>[c.id,c]));
 const sourceTitle=c=>`${c.id==='rumo-2015'?'Rumo / ALL — acervo histórico':'Prancha operacional'} · ${c.sourceDate||c.source||c.title}`;
 let recordSource='',recordCategory='';
 const tabs=[['locations','Localidades e KMs'],['subs','SUB'],['sb','SB'],['points','Pontos e cadastros'],['pn','Passagens de nível'],['stations','Estações'],['notes','Notas e conexões']];
 const pdfTabs=['locations','subs','notes'];
 const allPdf=documents.flatMap(c=>c.items.map(item=>({type:'pdf',item,catalog:c,sourceId:c.id,source:sourceTitle(c)})));
 const $=s=>root.querySelector(s);
 const sourceForTab=()=>recordTab==='points'?'KMZ e cadastros da equipe':recordTab==='sb'?'Ferrovia SB.kml':recordTab==='pn'?'Pns.zip':recordTab==='stations'?'Estações — SIV julho/2015':'';
 function candidates(){
  if(recordTab==='points')return points.map(item=>({type:'point',item,sourceId:'points',source:sourceForTab()}));
  if(recordTab==='sb')return sbSegments.map(item=>({type:'sb',item,sourceId:'sb',source:sourceForTab()}));
  if(recordTab==='pn')return pnPoints.map(item=>({type:'pn',item,sourceId:'pn',source:sourceForTab()}));
  if(recordTab==='stations')return stations.map(item=>({type:'station',item,sourceId:'stations',source:sourceForTab()}));
  if(recordTab==='subs')return documents.flatMap(c=>c.subs.map(id=>({type:'sub',item:{id,text:`SUB ${id}`,category:'SUB',occurrences:c.items.filter(i=>i.category==='SUB'&&i.text===id)},catalog:c,sourceId:c.id,source:sourceTitle(c)})));
  return allPdf.filter(r=>recordTab==='locations'?['Localidades e KMs','Quilometragens'].includes(r.item.category):!['Localidades e KMs','Quilometragens','SUB'].includes(r.item.category));
 }
 function categoryOf(r){return r.type==='point'?r.item.kind||'Ponto ferroviário':r.type==='pn'?'Passagem de nível':r.type==='station'?'Estação':r.type==='sb'?'Seção de bloqueio':r.item.category}
 function searchText(r){
  const i=r.item;
  if(r.type==='point')return `${i.name} ${i.yard||''} ${i.kind||''} ${i.source_km||''} ${i.line_type||''} ${i.km_entry||''} ${i.km_exit||''} ${i.notes||''}`;
  if(r.type==='pn')return `${i.name} ${i.km||''} ${i.place||''} ${i.uf||''} ${i.section||''} ${i.group||''}`;
  if(r.type==='station')return `${i.name} ${i.code} ${i.records.map(v=>`${v.km} ${v.entry} ${v.exit} ${v.sub}`).join(' ')}`;
  if(r.type==='sb')return `SB ${i.id} ${i.km_start} ${i.km_end}`;
  return `${i.text} ${i.contextText||''} ${(i.codes||[]).join(' ')} ${(i.anchorCodes||[]).join(' ')} ${i.category} ${r.source}`;
 }
 function rows(){
  const q=norm(recordQuery);
  return candidates().filter(r=>(!recordSource||r.sourceId===recordSource)&&(!recordCategory||categoryOf(r)===recordCategory)&&(!recordSection||(r.type==='sub'?r.item.occurrences.some(i=>i.section===recordSection):r.item.section===recordSection))&&(!q||norm(searchText(r)).includes(q)));
 }
 function descriptor(r){
  if(r.type==='sub'){
   const item=r.item.occurrences.find(i=>i.section===recordSection)||r.item.occurrences.find(i=>i.section==='general')||r.item.occurrences[0];
   return {type:'pdf',id:item.id,catalogId:r.catalog.id};
  }
  return {type:r.type,id:r.type==='station'?r.item.code:r.item.id,...(r.type==='station'?{code:r.item.code}:{}),...(r.type==='pdf'?{catalogId:r.catalog.id}:{})};
 }
 function inspect(r){if(onInspect)onInspect(descriptor(r));else if(r.type==='point')onPoint(r.item);else onMap(descriptor(r))}
 function configureFocus(){
  if(!focus)return;
  recordPage=0;recordKind='';recordCategory='';recordSection='';
  if(focus.type==='point'||focus.type==='pn'||focus.type==='station'||focus.type==='sb'){
   recordTab=({point:'points',pn:'pn',station:'stations',sb:'sb'})[focus.type];
   const found=candidates().find(r=>(r.item.id||r.item.code)===focus.id||(focus.code&&r.item.code===focus.code));
   recordQuery=found?found.item.code||found.item.name||String(found.item.id):'';
   return;
  }
  const found=focus.category?{item:focus,catalog:documentById.get(focus.catalogId)||documents[0]}:allPdf.find(r=>r.item.id===focus.id&&(!focus.catalogId||r.catalog.id===focus.catalogId));
  if(!found)return;
  const item=found.item;
  recordTab=item.category==='SUB'?'subs':['Localidades e KMs','Quilometragens'].includes(item.category)?'locations':'notes';
  recordSource=found.catalog.id;
  recordQuery=item.category==='SUB'?`SUB ${item.text}`:item.codes[0]||item.text;
 }
 configureFocus();
 function render(){
  const pdf=pdfTabs.includes(recordTab),options=candidates(),categories=[...new Set(options.map(categoryOf))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  const areas=new Map([['general','Mapa geral']]);
  documents.filter(c=>!recordSource||c.id===recordSource).forEach(c=>c.details.forEach(d=>areas.set(d.id,d.name)));
  root.innerHTML=`<div class="page operation-records"><div class="page-head"><div><div class="eyebrow">ACERVO OPERACIONAL</div><h2>Registros da malha</h2><p class="muted">Consulte as pranchas, os cadastros, as passagens de nível e as estações no mesmo acervo.</p></div><button id="new-record" class="primary">+ Novo registro</button></div>
   <div class="operation-stats records-stats"><div><strong>${fmt(allPdf.length)}</strong><span>Referências nas pranchas</span></div><div><strong>${fmt(sbSegments.length)}</strong><span>Segmentos de SB</span></div><div><strong>${fmt(points.length)}</strong><span>Pontos e cadastros</span></div><div><strong>${fmt(pnPoints.length)}</strong><span>Passagens de nível</span></div><div><strong>${fmt(stations.length)}</strong><span>Estações · ${fmt(stations.reduce((sum,s)=>sum+s.records.length,0))} registros SIV</span></div></div>
   <div class="records-tabs" role="tablist" aria-label="Categorias de registros">${tabs.map(([id,name])=>`<button role="tab" aria-selected="${recordTab===id}" data-tab="${id}" class="${recordTab===id?'active':''}">${name}</button>`).join('')}</div>
   <div class="card"><div class="filterbar operation-filterbar records-filters">
    <label class="geo-filter records-search"><span>Busca</span><input id="catalog-search" type="search" placeholder="Nome, sigla, SUB, número ou KM" value="${esc(recordQuery)}"></label>
    <label class="geo-filter"><span>Fonte e data</span><select id="catalog-source">${pdf?option('','Todas as pranchas',recordSource)+documents.map(c=>option(c.id,sourceTitle(c),recordSource)).join(''):option('',sourceForTab(),'')}</select></label>
    <label class="geo-filter"><span>Categoria</span><select id="catalog-kind">${option('','Todas as categorias',recordCategory)}${categories.map(k=>option(k,k,recordCategory)).join('')}</select></label>
    <label class="geo-filter"><span>Área da prancha</span><select id="catalog-section" ${pdf?'':'disabled'}>${option('',pdf?'Todas as áreas':'Não se aplica',recordSection)}${pdf?[...areas].map(([id,name])=>option(id,name,recordSection)).join(''):''}</select></label>
    <button id="catalog-export">Exportar CSV</button></div>
    <p class="catalog-source">${pdf?'Cada referência mantém a fonte e a data do documento. A prancha de 2015 é histórica e está marcada no original como mapa em revisão; diferenças entre as pranchas não são tratadas como atualizações do cadastro.':recordTab==='stations'?'Estações e limites quilométricos da relação SIV de julho de 2015. Coordenadas associadas por sigla ao KMZ ou à base Infra S.A.; estações sem localização verificada continuam disponíveis nesta tabela.':recordTab==='pn'?'Passagens de nível do arquivo Pns.zip, com nome, KM e localização originais.':recordTab==='sb'?'Segmentos do arquivo Ferrovia SB.kml, com coordenadas e valores de KM originais.':'Pontos do KMZ original e cadastros da equipe. Use Consultar para reunir as informações próximas ou Editar para alterar o cadastro.'}</p><div id="catalog-table"></div></div>
   <div class="source-footer">${pdf?documents.filter(c=>!recordSource||c.id===recordSource).map(c=>`<div><a href="${esc(c.assetBase)}/source.pdf" target="_blank" rel="noopener">${esc(sourceTitle(c))} · PDF ↗</a><br><a href="${esc(c.assetBase)}/catalog.json" download>Baixar catálogo desta prancha</a></div>`).join(''):recordTab==='stations'?'<a href="assets/rail-stations.json" download>Baixar catálogo completo de estações</a>':recordTab==='pn'?'<a href="assets/rail-pns.json" download>Baixar catálogo completo de passagens de nível</a>':''}</div></div>`;
  root.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{recordTab=b.dataset.tab;recordQuery='';recordSection='';recordSource='';recordCategory='';recordKind='';recordPage=0;render()});
  $('#catalog-search').oninput=e=>{recordQuery=e.target.value;recordPage=0;table()};
  $('#catalog-source').onchange=e=>{recordSource=e.target.value;recordSection='';recordPage=0;render()};
  $('#catalog-section').onchange=e=>{recordSection=e.target.value;recordPage=0;table()};
  $('#catalog-kind').onchange=e=>{recordCategory=e.target.value;recordPage=0;table()};
  $('#new-record').onclick=onAdd;$('#catalog-export').onclick=download;table();
 }
 const value=v=>esc(v)||'—';
 const coordinateStatus=i=>Number.isFinite(i.lat)&&Number.isFinite(i.lng)?`${Number(i.lat).toFixed(5)}, ${Number(i.lng).toFixed(5)}`:'Sem localização verificada';
 function actions(r,index){const hasMap=r.type!=='station'||(Number.isFinite(r.item.lat)&&Number.isFinite(r.item.lng));return `<div class="row record-actions"><button data-inspect="${index}">Consultar</button>${hasMap?`<button data-map="${index}">${['pdf','sub'].includes(r.type)?'Prancha':'Mapa'}</button>`:''}${r.type==='point'?`<button data-edit="${index}">Editar</button>`:''}</div>`}
 function table(){
  const filtered=rows(),pages=Math.max(1,Math.ceil(filtered.length/40));recordPage=Math.min(recordPage,pages-1);
  const shown=filtered.slice(recordPage*40,(recordPage+1)*40);
  let heads,body;
  if(recordTab==='points'){
   heads='<th>Ponto / nome</th><th>Tipo / linha</th><th>Sigla</th><th>KM de origem</th><th>KM entrada / saída</th><th>Ações</th>';
   body=shown.map((r,i)=>{const p=r.item;return `<tr><td><strong>${esc(p.name)}</strong></td><td>${value(p.kind)}<br><small>${value(p.line_type)}</small></td><td>${value(p.yard)}</td><td>${value(p.source_km)}</td><td>${value(p.km_entry)} / ${value(p.km_exit)}</td><td>${actions(r,i)}</td></tr>`}).join('');
  }else if(recordTab==='sb'){
   heads='<th>SB</th><th>KM início</th><th>KM fim</th><th>Geometria</th><th>Ações</th>';
   body=shown.map((r,i)=>{const s=r.item;return `<tr><td><strong>SB ${esc(s.id)}</strong></td><td>${value(s.km_start)}</td><td>${value(s.km_end)}</td><td>${s.coordinates.length} vértices</td><td>${actions(r,i)}</td></tr>`}).join('');
  }else if(recordTab==='pn'){
   heads='<th>Passagem de nível</th><th>KM</th><th>Local / UF</th><th>Trecho / grupo</th><th>Localização</th><th>Ações</th>';
   body=shown.map((r,i)=>{const p=r.item;return `<tr><td><strong>${esc(p.name)}</strong></td><td>${value(p.km)}</td><td>${value(p.place)}<br><small>${value(p.uf)}</small></td><td>${value(p.section)}<br><small>${value(p.group)}</small></td><td><small>${esc(coordinateStatus(p))}</small></td><td>${actions(r,i)}</td></tr>`}).join('');
  }else if(recordTab==='stations'){
   heads='<th>Estação / sigla</th><th>KM</th><th>Entrada / saída</th><th>SUB / página SIV</th><th>Localização associada</th><th>Ações</th>';
   body=shown.map((r,i)=>{const s=r.item;return `<tr><td><strong>${esc(s.name)}</strong><br><span class="code-pill">${esc(s.code)}</span></td><td>${s.records.map(v=>value(v.km)).join('<br>')}</td><td>${s.records.map(v=>`${value(v.entry)} / ${value(v.exit)}`).join('<br>')}</td><td>${s.records.map(v=>`${value(v.sub)} / p. ${value(v.page)}`).join('<br>')}</td><td><small>${esc(coordinateStatus(s))}${s.locationSource?`<br>Fonte: ${esc(s.locationSource)}`:''}</small></td><td>${actions(r,i)}</td></tr>`}).join('');
  }else if(recordTab==='subs'){
   heads='<th>SUB</th><th>Fonte / data</th><th>Referências na prancha</th><th>Áreas</th><th>Ações</th>';
   body=shown.map((r,i)=>{const s=r.item;return `<tr><td><span class="sub-number">${esc(s.id)}</span></td><td>${esc(r.source)}</td><td>${s.occurrences.length} ocorrência(s)</td><td>${[...new Set(s.occurrences.map(o=>sectionName(r.catalog,o.section)))].map(esc).join('<br>')}</td><td>${actions(r,i)}${s.occurrences.length>1?`<details class="occurrence-links"><summary>Todas as referências</summary>${s.occurrences.map(o=>`<button data-pdf="${esc(o.id)}" data-document="${esc(r.catalog.id)}">${esc(sectionName(r.catalog,o.section))}</button>`).join('')}</details>`:''}</td></tr>`}).join('');
  }else{
   heads='<th>Informação original</th><th>Siglas</th><th>Categoria / área</th><th>Fonte / data</th><th>Ações</th>';
   body=shown.map((r,i)=>{const s=r.item;return `<tr><td class="catalog-text">${esc(s.text)}${s.contextText&&s.contextText!==s.text?`<br><small>${esc(s.contextText)}</small>`:''}</td><td>${s.codes.map(c=>`<span class="code-pill">${esc(c)}</span>`).join(' ')||'—'}${s.anchorCodes?.length?`<br><small>Referência próxima: ${s.anchorCodes.map(esc).join(' / ')}</small>`:''}</td><td>${esc(s.category)}<br><small>${esc(sectionName(r.catalog,s.section))}</small></td><td><small>${esc(r.source)}</small></td><td>${actions(r,i)}</td></tr>`}).join('');
  }
  $('#catalog-table').innerHTML=shown.length?`<div class="table-wrap"><table><thead><tr>${heads}</tr></thead><tbody>${body}</tbody></table></div><div class="pager"><span>${fmt(filtered.length)} registros · ${recordPage+1} / ${pages}</span><button id="catalog-prev" ${recordPage===0?'disabled':''}>Anterior</button><button id="catalog-next" ${recordPage+1===pages?'disabled':''}>Próxima</button></div>`:'<div class="empty">Nenhum registro encontrado.</div>';
  root.querySelectorAll('[data-inspect]').forEach(b=>b.onclick=()=>inspect(shown[Number(b.dataset.inspect)]));
  root.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>onPoint(shown[Number(b.dataset.edit)].item));
  root.querySelectorAll('[data-map]').forEach(b=>b.onclick=()=>onMap(descriptor(shown[Number(b.dataset.map)])));
  root.querySelectorAll('[data-pdf]').forEach(b=>b.onclick=()=>onMap({type:'pdf',id:b.dataset.pdf,catalogId:b.dataset.document}));
  if($('#catalog-prev')){$('#catalog-prev').onclick=()=>{recordPage--;table()};$('#catalog-next').onclick=()=>{recordPage++;table()}}
 }
 function download(){
  let headers,data;
  const filtered=rows();
  if(recordTab==='points'){
   headers=['Nome','Tipo','Sigla','KM original','Tipo de linha','KM entrada','KM saída','Observações','Latitude','Longitude','Fonte'];
   data=filtered.map(({item:i,source})=>[i.name,i.kind,i.yard,i.source_km,i.line_type,i.km_entry,i.km_exit,i.notes,i.lat,i.lng,source]);
  }else if(recordTab==='pn'){
   headers=['Nome','KM','Local','UF','Trecho','Grupo','Latitude','Longitude','Fonte'];
   data=filtered.map(({item:i,source})=>[i.name,i.km,i.place,i.uf,i.section,i.group,i.lat,i.lng,source]);
  }else if(recordTab==='stations'){
   headers=['Sigla','Estação','KM','KM entrada','KM saída','SUB','Página SIV','Latitude','Longitude','Fonte da localização','Fonte'];
   data=filtered.flatMap(({item:i,source})=>i.records.map(r=>[i.code,i.name,r.km,r.entry,r.exit,r.sub,r.page,i.lat,i.lng,i.locationSource,source]));
  }else if(recordTab==='sb'){
   headers=['SB','KM início','KM fim','Coordenadas','Fonte'];
   data=filtered.map(({item:i,source})=>[i.id,i.km_start,i.km_end,JSON.stringify(i.coordinates),source]);
  }else if(recordTab==='subs'){
   headers=['SUB','Ocorrências','Áreas','Fonte','Data'];
   data=filtered.map(({item:i,catalog:c,source})=>[i.id,i.occurrences.length,[...new Set(i.occurrences.map(o=>sectionName(c,o.section)))].join(' | '),source,c.sourceDate]);
  }else{
   headers=['Texto original','Contexto na prancha','Siglas','Siglas de referências próximas','Categoria','Área','Fonte','Data'];
   data=filtered.map(({item:i,catalog:c,source})=>[i.text,i.contextText,i.codes.join(' / '),(i.anchorCodes||[]).join(' / '),i.category,sectionName(c,i.section),source,c.sourceDate]);
  }
  const safe=v=>{let s=String(v??'');if(/^[\s]*[=+@\-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'};
  const blob=new Blob(['\ufeff'+[headers,...data].map(row=>row.map(safe).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`registros-${recordTab}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 render();
}
