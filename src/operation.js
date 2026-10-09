const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const fmt=n=>Number(n).toLocaleString('pt-BR');
const sourceURL='assets/operation/source.pdf';
const label=item=>item.category==='SUB'?`SUB ${item.text}`:item.text;
const boundsFor=(L,box)=>L.latLngBounds([[-box[3],box[0]],[-box[1],box[2]]]);
const sectionName=(catalog,id)=>catalog.details.find(d=>d.id===id)?.name||'Mapa geral';
const matches=(item,q)=>norm(`${label(item)} ${item.codes.join(' ')}`).includes(norm(q));
const pointMatches=(p,q)=>norm(`${p.name} ${p.yard} ${p.source_km} ${p.kind}`).includes(norm(q));
const option=(value,text,selected)=>`<option value="${esc(value)}" ${value===selected?'selected':''}>${esc(text)}</option>`;
let mapMode='drawing';
let recordTab='locations',recordQuery='',recordSection='',recordPage=0,recordKind='';

export function mountOperationMap({L,root,catalog,points,sbSegments,onPoint,onAdd,onRecords,onMap,onPresentation,focus}){
 let map,observer,highlight,pointLayer,sbLayer,hitLayer,pointCanvas,tile,adding=false,query='',showPoints=true,showSB=true,showNames=true,kind='',line='',showHits=false;
 let currentPoints=points;
 const $=s=>root.querySelector(s);
 const fullBox=[0,0,catalog.width,catalog.height];
 function stop(){observer?.disconnect();map?.remove();map=null}
 function shell(){
  stop();adding=false;showHits=false;
  root.innerHTML=`<div class="map-layout operation-layout"><aside class="map-panel operation-panel"><div class="eyebrow">REDE FERROVIÁRIA</div><h2>Mapa de operação</h2><p class="source-date">Base SIV · ${esc(catalog.sourceDate)} · prancha completa</p><div class="view-switch"><button data-mode="drawing" class="${mapMode==='drawing'?'active':''}">Prancha interativa</button><button data-mode="geographic" class="${mapMode==='geographic'?'active':''}">Mapa geográfico</button></div><label class="search-label" for="operation-search">Buscar na ${mapMode==='drawing'?'prancha':'malha'}</label><input id="operation-search" class="search" type="search" placeholder="${mapMode==='drawing'?'Nome, sigla, KM ou SUB':'Nome, sigla, KM ou SB'}" value="${esc(query)}"><div id="operation-results" class="results" aria-live="polite"></div>${mapMode==='drawing'?`<div class="layer-section"><h3>SUB da prancha</h3><select id="sub-select" aria-label="Localizar SUB"><option value="">Localizar uma SUB</option>${catalog.subs.map(n=>option(n,`SUB ${n}`,'')).join('')}</select><p class="panel-note">As cores, os limites e as conexões são os do documento original. Clique em um rótulo para consultar.</p></div><div class="layer-section"><h3>Quadros de detalhe</h3><div class="detail-links">${catalog.details.map(d=>`<button data-detail="${d.id}">${esc(d.name)}</button>`).join('')}</div></div><label class="toggle"><span>Destacar rótulos clicáveis</span><input id="hit-toggle" type="checkbox"></label>`:`<div class="layer-section"><h3>Camadas da malha completa</h3><label class="toggle"><span><i class="dot"></i>Pontos e cadastros</span><input id="geo-points" type="checkbox" ${showPoints?'checked':''}></label><label class="toggle"><span><i class="sb-swatch"></i>SB do KML</span><input id="geo-sb" type="checkbox" ${showSB?'checked':''}></label><label class="toggle"><span>Nomes dos pontos</span><input id="geo-names" type="checkbox" ${showNames?'checked':''}></label><label>Tipo de registro<select id="geo-kind"><option value="">Todos os tipos</option>${[...new Set(currentPoints.map(p=>p.kind))].sort().map(k=>option(k,k,kind)).join('')}</select></label><label>Tipo de linha<select id="geo-line"><option value="">Todos os tipos de linha</option>${['Não classificada','Singela','Dupla','Desviada'].map(k=>option(k,k,line)).join('')}</select></label><label>Base cartográfica<select id="geo-base"><option value="street">Ruas</option><option value="terrain">Terreno</option></select></label></div><p class="panel-note">${fmt(currentPoints.length)} pontos e ${fmt(sbSegments.length)} SB. Consulte a prancha para as cores e divisões de SUB.</p>`}<div class="map-source-links"><button id="all-records">Consultar registros</button><a href="${sourceURL}" target="_blank" rel="noopener">Abrir PDF original ↗</a></div></aside><section class="map-wrap" aria-label="${mapMode==='drawing'?'Prancha operacional interativa':'Mapa geográfico da malha completa'}"><div id="map"></div><div class="map-toolbar"><div class="row"><button id="layers-mobile" class="mobile-brand">Explorar</button><button id="operation-fit">Enquadrar mapa</button></div><div class="row"><button id="exit-present" class="present-only">Sair da apresentação</button>${mapMode==='geographic'?'<button id="add-map" class="primary">+ Novo ponto</button>':''}</div></div><div class="map-caption" id="operation-caption"></div><div class="drawing-hint" ${mapMode==='drawing'?'':'hidden'}>Role para ampliar · Arraste para navegar · Clique nos rótulos</div></section></div>`;
  root.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mapMode=b.dataset.mode;query='';kind='';line='';shell()});
  $('#operation-search').oninput=e=>{query=e.target.value;search()};
  $('#operation-fit').onclick=fit;
  $('#all-records').onclick=()=>onRecords();
  $('#layers-mobile').onclick=()=>$('.map-panel').classList.toggle('open');
  $('#exit-present').onclick=()=>onPresentation(false);
  map=L.map('map',{crs:mapMode==='drawing'?L.CRS.Simple:L.CRS.EPSG3857,minZoom:mapMode==='drawing'?-3:2,maxZoom:mapMode==='drawing'?4:19,preferCanvas:true,zoomControl:false,attributionControl:mapMode!=='drawing'});
  onMap(map);
  L.control.zoom({position:'topright'}).addTo(map);
  if(mapMode==='drawing'){
   const bounds=boundsFor(L,fullBox);
   L.tileLayer('assets/operation/tiles/{z}/{x}/{y}.png',{tileSize:catalog.tileSize,minZoom:-3,maxZoom:4,minNativeZoom:0,maxNativeZoom:catalog.maxNativeZoom,noWrap:true,bounds,keepBuffer:2}).addTo(map);
   map.setMaxBounds(bounds.pad(.15));
   hitLayer=L.featureGroup().addTo(map);
   const renderer=L.canvas({padding:.5,tolerance:3});
   catalog.items.forEach(item=>{
    const rect=L.rectangle(boundsFor(L,item.box),{renderer,color:item.category==='SUB'?'#e32028':'#0075dc',weight:0,opacity:0,fillOpacity:0});
    rect.on('mouseover',()=>rect.setStyle({weight:1,opacity:.8,fillOpacity:.16}));
    rect.on('mouseout',()=>rect.setStyle({weight:showHits?1:0,opacity:showHits?.35:0,fillOpacity:showHits?.07:0}));
    rect.on('click',()=>showItem(item,false));
    rect.addTo(hitLayer);
   });
   $('#hit-toggle').onchange=e=>{showHits=e.target.checked;hitLayer.eachLayer(layer=>layer.setStyle({weight:showHits?1:0,opacity:showHits?.35:0,fillOpacity:showHits?.07:0}))};
   $('#sub-select').onchange=e=>{const item=catalog.items.find(i=>i.category==='SUB'&&i.text===e.target.value&&i.section==='general')||catalog.items.find(i=>i.category==='SUB'&&i.text===e.target.value);if(item){showItem(item,true);$('.map-panel').classList.remove('open')}};
   root.querySelectorAll('[data-detail]').forEach(b=>b.onclick=()=>{map.closePopup();if(highlight)map.removeLayer(highlight);map.fitBounds(boundsFor(L,catalog.details.find(d=>d.id===b.dataset.detail).box),{padding:[35,35]});$('.map-panel').classList.remove('open')});
   $('#operation-caption').textContent=`${fmt(catalog.items.length)} rótulos consultáveis · ${catalog.subs.length} SUB · Cores originais`;
  }else{
   setBase('street');L.control.scale({imperial:false,position:'bottomright'}).addTo(map);
   pointLayer=L.layerGroup().addTo(map);sbLayer=L.featureGroup().addTo(map);
   $('#geo-points').onchange=e=>{showPoints=e.target.checked;drawGeo()};$('#geo-sb').onchange=e=>{showSB=e.target.checked;drawGeo()};$('#geo-kind').onchange=e=>{kind=e.target.value;drawGeo();search()};
   $('#geo-base').onchange=e=>setBase(e.target.value);$('#geo-names').onchange=e=>{showNames=e.target.checked;drawGeo()};$('#geo-line').onchange=e=>{line=e.target.value;drawGeo();search()};
   $('#add-map').onclick=()=>{adding=!adding;$('#add-map').textContent=adding?'Clique no mapa ou cancele':'+ Novo ponto'};
   map.on('click',e=>{if(adding){adding=false;$('#add-map').textContent='+ Novo ponto';onAdd(e.latlng)}});
   drawGeo();
  }
  observer=new ResizeObserver(()=>map?.invalidateSize());observer.observe($('#map'));
  fit();search();
 }
 function fit(){if(mapMode==='drawing')map.fitBounds(boundsFor(L,fullBox),{padding:[15,15]});else{const coords=[...currentPoints.map(p=>[p.lat,p.lng]),...sbSegments.flatMap(s=>s.coordinates.map(([lng,lat])=>[lat,lng]))];if(coords.length)map.fitBounds(coords,{padding:[30,30]})}}
const NamedPointsCanvas=L.Canvas.extend({
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
  if(tile)map.removeLayer(tile);
  tile=mode==='terrain'?L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,className:'base-terrain',attribution:'Tiles © Esri — Sources: Esri, HERE, Garmin, USGS, METI/NASA, OpenStreetMap contributors'}):L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,className:'base-street',attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'});tile.addTo(map);
 }
 function drawGeo(){
  if(mapMode!=='geographic')return;
  pointLayer.clearLayers();sbLayer.clearLayers();if(pointCanvas&&map.hasLayer(pointCanvas))map.removeLayer(pointCanvas);pointCanvas=new NamedPointsCanvas({padding:.5,tolerance:8});let n=0;
  if(showSB)sbSegments.forEach(s=>L.polyline(s.coordinates.map(([lng,lat])=>[lat,lng]),{color:'#007fa6',weight:3,opacity:.8}).bindTooltip(`SB ${esc(s.id)}`,{sticky:true}).bindPopup(`<strong>SB ${esc(s.id)}</strong><br>KM início: ${esc(s.km_start)}<br>KM fim: ${esc(s.km_end)}<br><small>Fonte: Ferrovia SB.kml</small>`).addTo(sbLayer));
  if(showPoints)currentPoints.forEach(p=>{if((kind&&p.kind!==kind)||(line&&p.line_type!==line))return;n++;L.circleMarker([p.lat,p.lng],{radius:4,weight:1,color:'#fff',fillColor:'#0037dd',fillOpacity:1,renderer:pointCanvas,pointName:showNames?p.name:null}).bindTooltip(esc(p.name)).on('click',e=>{L.DomEvent.stopPropagation(e.originalEvent);if(!adding)onPoint(p)}).addTo(pointLayer)});
  $('#operation-caption').textContent=`${fmt(n)} pontos · ${showSB?fmt(sbSegments.length):'0'} SB · Malha completa`;
 }
 function search(){
  const q=query.trim();if(!q){$('#operation-results').innerHTML='';return}
  const rows=mapMode==='drawing'?catalog.items.filter(i=>matches(i,q)):currentPoints.filter(p=>(!kind||p.kind===kind)&&(!line||p.line_type===line)&&pointMatches(p,q));
  const sbRows=mapMode==='geographic'?sbSegments.filter(s=>norm(`SB ${s.id} ${s.km_start} ${s.km_end}`).includes(norm(q))):[];
  const visible=[...rows.map(i=>({item:i,type:mapMode==='drawing'?'pdf':'point'})),...sbRows.map(item=>({item,type:'sb'}))].slice(0,40);
  $('#operation-results').innerHTML=visible.length?`<p class="results-total">${fmt(rows.length+sbRows.length)} resultados${rows.length+sbRows.length>40?' · primeiros 40':''}</p>${visible.map((r,i)=>`<button class="result" data-result="${i}">${esc(r.type==='pdf'?label(r.item):r.type==='point'?r.item.name:`SB ${r.item.id}`)}<br><small>${esc(r.type==='pdf'?sectionName(catalog,r.item.section):r.type==='point'?r.item.kind:`KM ${r.item.km_start} → ${r.item.km_end}`)}</small></button>`).join('')}`:'<p class="muted">Nenhum resultado.</p>';
  root.querySelectorAll('[data-result]').forEach(b=>b.onclick=()=>{const r=visible[Number(b.dataset.result)];if(r.type==='pdf')showItem(r.item,true);else if(r.type==='point'){map.setView([r.item.lat,r.item.lng],15);onPoint(r.item)}else focusSB(r.item);$('.map-panel').classList.remove('open')});
 }
 function focusSB(sb){map.fitBounds(sb.coordinates.map(([lng,lat])=>[lat,lng]),{padding:[65,65],maxZoom:14});L.popup().setLatLng([sb.coordinates[0][1],sb.coordinates[0][0]]).setContent(`<strong>SB ${esc(sb.id)}</strong><br>KM início: ${esc(sb.km_start)}<br>KM fim: ${esc(sb.km_end)}`).openOn(map)}
 function showItem(item,zoom){
  if(mapMode!=='drawing'){mapMode='drawing';shell()}
  const bounds=boundsFor(L,item.box);
  if(zoom)map.fitBounds(bounds.pad(2),{padding:[90,90],maxZoom:2});
  if(highlight)map.removeLayer(highlight);
  highlight=L.rectangle(bounds.pad(.25),{color:'#e32028',weight:2,fillOpacity:.13,interactive:false}).addTo(map);
  const related=catalog.items.filter(x=>x.id!==item.id&&(item.category==='SUB'?x.category==='SUB'&&x.text===item.text:item.codes.some(c=>x.codes.includes(c))));
  const content=document.createElement('div');content.className='operation-popup';
  content.innerHTML=`<span class="eyebrow">${esc(item.category)}</span><strong>${esc(label(item))}</strong><p>${esc(sectionName(catalog,item.section))}</p>${related.length?`<p>${related.length} outra(s) referência(s) no documento</p>`:''}<button data-open-record>Consultar registros</button><a href="${sourceURL}" target="_blank" rel="noopener">PDF original ↗</a>`;
  content.querySelector('[data-open-record]').onclick=()=>onRecords(item);
  L.popup({maxWidth:380}).setLatLng(bounds.getCenter()).setContent(content).openOn(map);
 }
 shell();
 if(focus?.type==='pdf'){const item=catalog.items.find(i=>i.id===focus.id);if(item)showItem(item,true)}
 if(focus?.type==='point'){if(mapMode!=='geographic'){mapMode='geographic';shell()}const p=currentPoints.find(i=>i.id===focus.id);if(p){map.setView([p.lat,p.lng],15);onPoint(p)}}
 if(focus?.type==='sb'){if(mapMode!=='geographic'){mapMode='geographic';shell()}const s=sbSegments.find(i=>i.id===focus.id);if(s)focusSB(s)}
 return {destroy:stop,refresh:newPoints=>{currentPoints=newPoints;drawGeo();search()}};
}

export function recordsForPoint(catalog,p){return catalog?.items.filter(i=>i.codes.includes(p.yard))||[]}

export function mountOperationRecords({root,catalog,points,sbSegments,onPoint,onAdd,onMap,focus}){
 if(focus){recordTab=focus.category==='SUB'?'subs':['Localidades e KMs','Quilometragens'].includes(focus.category)?'locations':'notes';recordQuery=focus.category==='SUB'?focus.text:focus.codes[0]||focus.text;recordSection='';recordPage=0}
 const tabs=[['locations','Localidades e KMs'],['subs','SUB'],['sb','SB'],['points','Pontos e cadastros'],['notes','Notas e conexões']];
 const $=s=>root.querySelector(s);
 function rows(){
  let result=recordTab==='points'?points:recordTab==='sb'?sbSegments:recordTab==='subs'?catalog.subs.map(id=>({id,text:`SUB ${id}`,occurrences:catalog.items.filter(i=>i.category==='SUB'&&i.text===id)})):catalog.items.filter(i=>recordTab==='locations'?['Localidades e KMs','Quilometragens'].includes(i.category):!['Localidades e KMs','Quilometragens','SUB'].includes(i.category));
  if(recordTab==='points'&&recordKind)result=result.filter(p=>p.kind===recordKind);
  if(recordSection&&['locations','notes'].includes(recordTab))result=result.filter(i=>i.section===recordSection);
  const q=norm(recordQuery);
  return result.filter(i=>!q||norm(recordTab==='points'?`${i.name} ${i.yard} ${i.kind} ${i.source_km}`:recordTab==='sb'?`SB ${i.id} ${i.km_start} ${i.km_end}`:i.text).includes(q));
 }
 function render(){
  root.innerHTML=`<div class="page operation-records"><div class="page-head"><div><div class="eyebrow">ACERVO OPERACIONAL</div><h2>Registros da malha</h2><p class="muted">Localidades, SUB, SB e referências de todas as operações.</p></div><button id="new-record" class="primary">+ Novo registro</button></div><div class="operation-stats"><div><strong>${fmt(catalog.items.length)}</strong><span>Rótulos do PDF</span></div><div><strong>${catalog.subs.length}</strong><span>SUB identificadas</span></div><div><strong>${fmt(sbSegments.length)}</strong><span>Segmentos de SB</span></div><div><strong>${fmt(points.length)}</strong><span>Pontos e cadastros</span></div></div><div class="records-tabs" role="tablist" aria-label="Categorias de registros">${tabs.map(([id,name])=>`<button role="tab" aria-selected="${recordTab===id}" data-tab="${id}" class="${recordTab===id?'active':''}">${name}</button>`).join('')}</div><div class="card"><div class="filterbar operation-filterbar"><input id="catalog-search" type="search" aria-label="Buscar registros" placeholder="Buscar nome, sigla, número ou KM" value="${esc(recordQuery)}">${['locations','notes'].includes(recordTab)?`<select id="catalog-section" aria-label="Área do documento">${option('','Todas as áreas',recordSection)}${option('general','Mapa geral',recordSection)}${catalog.details.map(d=>option(d.id,d.name,recordSection)).join('')}</select>`:''}${recordTab==='points'?`<select id="catalog-kind" aria-label="Tipo de registro"><option value="">Todos os tipos</option>${[...new Set(points.map(p=>p.kind))].sort().map(k=>option(k,k,recordKind)).join('')}</select>`:''}<button id="catalog-export">Exportar CSV</button></div><p class="catalog-source">${recordTab==='points'?'Fonte: KMZ original e cadastros da equipe.':recordTab==='sb'?'Fonte: Ferrovia SB.kml · coordenadas e valores de KM originais.':`Fonte: MAPA_OPERAÇÃO.pdf · Base SIV · ${esc(catalog.sourceDate)}. Rótulos e ocorrências preservados.`}</p><div id="catalog-table"></div></div><div class="source-footer"><a href="${sourceURL}" target="_blank" rel="noopener">Consultar o PDF completo ↗</a><a href="assets/operation/catalog.json" download>Baixar o catálogo integral</a></div></div>`;
  root.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{recordTab=b.dataset.tab;recordQuery='';recordSection='';recordKind='';recordPage=0;render()});
  $('#catalog-search').oninput=e=>{recordQuery=e.target.value;recordPage=0;table()};
  if($('#catalog-section'))$('#catalog-section').onchange=e=>{recordSection=e.target.value;recordPage=0;table()};
  if($('#catalog-kind'))$('#catalog-kind').onchange=e=>{recordKind=e.target.value;recordPage=0;table()};
  $('#new-record').onclick=onAdd;$('#catalog-export').onclick=download;table();
 }
 function table(){
  const filtered=rows(),pages=Math.max(1,Math.ceil(filtered.length/40));recordPage=Math.min(recordPage,pages-1);
  const shown=filtered.slice(recordPage*40,(recordPage+1)*40);
  let heads,body;
  if(recordTab==='points'){
   heads='<th>Ponto / nome</th><th>Tipo</th><th>Sigla</th><th>KM de origem</th><th>Linha</th><th>KM entrada / saída</th><th>Ações</th>';
   body=shown.map((p,i)=>`<tr><td><strong>${esc(p.name)}</strong></td><td>${esc(p.kind)}</td><td>${esc(p.yard)||'—'}</td><td>${esc(p.source_km)||'—'}</td><td>${esc(p.line_type)||'—'}</td><td>${esc(p.km_entry)||'—'} / ${esc(p.km_exit)||'—'}</td><td><div class="row"><button data-edit="${i}">Abrir</button><button data-map="${i}">Mapa</button></div></td></tr>`).join('');
  }else if(recordTab==='sb'){
   heads='<th>SB</th><th>KM início</th><th>KM fim</th><th>Geometria</th><th>Ações</th>';
   body=shown.map((s,i)=>`<tr><td><strong>SB ${esc(s.id)}</strong></td><td>${esc(s.km_start)}</td><td>${esc(s.km_end)}</td><td>${s.coordinates.length} vértices</td><td><button data-map="${i}">Ver no mapa</button></td></tr>`).join('');
  }else if(recordTab==='subs'){
   heads='<th>SUB</th><th>Referências na prancha</th><th>Áreas</th><th>Ações</th>';
   body=shown.map((s,i)=>`<tr><td><span class="sub-number">${esc(s.id)}</span></td><td>${s.occurrences.length} ocorrência(s)</td><td>${[...new Set(s.occurrences.map(o=>sectionName(catalog,o.section)))].map(esc).join('<br>')}</td><td><button data-map="${i}">Ver cores e traçado</button>${s.occurrences.length>1?`<details class="occurrence-links"><summary>Todas as referências</summary>${s.occurrences.map(o=>`<button data-pdf="${o.id}">${esc(sectionName(catalog,o.section))}</button>`).join('')}</details>`:''}</td></tr>`).join('');
  }else{
   heads='<th>Informação original</th><th>Siglas</th><th>Categoria / área</th><th>Ações</th>';
   body=shown.map((s,i)=>`<tr><td class="catalog-text">${esc(s.text)}</td><td>${s.codes.map(c=>`<span class="code-pill">${esc(c)}</span>`).join(' ')||'—'}</td><td>${esc(s.category)}<br><small>${esc(sectionName(catalog,s.section))}</small></td><td><button data-map="${i}">Ver contexto no mapa</button></td></tr>`).join('');
  }
  $('#catalog-table').innerHTML=shown.length?`<div class="table-wrap"><table><thead><tr>${heads}</tr></thead><tbody>${body}</tbody></table></div><div class="pager"><span>${fmt(filtered.length)} registros · ${recordPage+1} / ${pages}</span><button id="catalog-prev" ${recordPage===0?'disabled':''}>Anterior</button><button id="catalog-next" ${recordPage+1===pages?'disabled':''}>Próxima</button></div>`:'<div class="empty">Nenhum registro encontrado.</div>';
  root.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>onPoint(shown[Number(b.dataset.edit)]));
  root.querySelectorAll('[data-map]').forEach(b=>b.onclick=()=>{const i=shown[Number(b.dataset.map)];if(recordTab==='points')onMap({type:'point',id:i.id});else if(recordTab==='sb')onMap({type:'sb',id:i.id});else if(recordTab==='subs')onMap({type:'pdf',id:(i.occurrences.find(o=>o.section==='general')||i.occurrences[0]).id});else onMap({type:'pdf',id:i.id})});
  root.querySelectorAll('[data-pdf]').forEach(b=>b.onclick=()=>onMap({type:'pdf',id:b.dataset.pdf}));
  if($('#catalog-prev')){$('#catalog-prev').onclick=()=>{recordPage--;table()};$('#catalog-next').onclick=()=>{recordPage++;table()}}
 }
 function download(){
  const data=rows().map(i=>recordTab==='points'?[i.name,i.kind,i.yard,i.source_km,i.line_type,i.km_entry,i.km_exit,i.notes,i.lat,i.lng]:recordTab==='sb'?[i.id,i.km_start,i.km_end,JSON.stringify(i.coordinates)]:recordTab==='subs'?[i.id,i.occurrences.length,i.occurrences.map(o=>sectionName(catalog,o.section)).join(' | ')]:[i.text,i.codes.join(' / '),i.category,sectionName(catalog,i.section)]);
  const headers=recordTab==='points'?['Nome','Tipo','Sigla','KM original','Tipo de linha','KM entrada','KM saída','Observações','Latitude','Longitude']:recordTab==='sb'?['SB','KM início','KM fim','Coordenadas']:recordTab==='subs'?['SUB','Ocorrências','Áreas']:['Texto original','Siglas','Categoria','Área'];
  const safe=v=>{let s=String(v??'');if(/^[=+@\-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'};
  const blob=new Blob(['\ufeff'+[headers,...data].map(row=>row.map(safe).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`registros-${recordTab}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 render();
}
