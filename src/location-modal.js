import {googleMapsURL} from './location-context.js';
import {MALHAS} from './malhas.js';
import {subLabel} from './subs.js';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const types={point:'Ponto / cadastro',pn:'Passagem de nível',station:'Estação',sb:'Segmento de SB',pdf:'Referência da prancha',coordinate:'Local selecionado'};
const distance=m=>m<1000?`${Math.round(m)} m`:`${(m/1000).toLocaleString('pt-BR',{maximumFractionDigits:2})} km`;
const value=v=>v===null||v===undefined||v===''?'—':esc(v);
const field=(name,v)=>`<div><dt>${esc(name)}</dt><dd>${value(v)}</dd></div>`;
const subFields=item=>`${field('SUB(s)',item.subCodes?.map(n=>`SUB ${n}`).join(' / '))}${field('Origem da associação à SUB',item.subSource)}`;
const mapsLink=(lat,lng)=>{const url=googleMapsURL(lat,lng);return url?`<a class="maps-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Google Maps ↗</a>`:''};

export function locationFields(type,item={}){
 if(type==='point')return `<dl class="location-fields">${field('Tipo',item.kind)}${field('Sigla / pátio',item.yard)}${field('KM de origem',item.source_km)}${field('Linha',item.line_type)}${field('KM entrada',item.km_entry)}${field('KM saída',item.km_exit)}${field('Observações',item.notes)}${subFields(item)}</dl><p class="location-source">Fonte: KMZ e cadastros da equipe. O KM de origem mantém a unidade do arquivo.</p>`;
 if(type==='pn')return `<dl class="location-fields">${field('KM',item.km)}${field('Município / UF',[item.place,item.uf].filter(Boolean).join(' / '))}${field('Trecho',item.section)}${field('Grupo',item.group)}${subFields(item)}</dl><p class="location-source">Fonte: Pns.zip</p>`;
 if(type==='sb')return `<dl class="location-fields">${field('SB',item.id)}${field('KM início',item.km_start)}${field('KM fim',item.km_end)}${field('Vértices',item.coordinates?.length)}${subFields(item)}</dl><p class="location-source">Fonte: Ferrovia SB.kml</p>`;
 if(type==='station')return `<dl class="location-fields">${field('Sigla',item.code)}${field('Localização',item.locationSource)}${subFields(item)}</dl><div class="table-wrap"><table><thead><tr><th>SUB</th><th>KM médio</th><th>Entrada</th><th>Saída</th><th>Página</th></tr></thead><tbody>${(item.records||[]).map(r=>`<tr><td>${value(r.sub)}</td><td>${value(r.km)}</td><td>${value(r.entry)}</td><td>${value(r.exit)}</td><td>${value(r.page)}</td></tr>`).join('')}</tbody></table></div><p class="location-source">Fonte: SIV · julho/2015. Coordenadas vinculadas por sigla.</p>`;
 if(type==='pdf')return `<dl class="location-fields">${field('Informação original',item.text)}${field('Siglas',(item.codes?.length?item.codes:item.anchorCodes||[]).join(' / '))}${field('Categoria',item.category)}${item.contextText?field('KMs e indicações na mesma caixa',item.contextText):''}</dl>`;
 return '';
}

// Both map views and the records table use this same read-only consultation.
// Editing and photos stay in the existing authenticated point form.
export function openLocationDetails({reference,context,dialog,onEdit,onMap,filters}){
 let origin=context.resolve(reference),radiusMeters=2000,scope=filters?'selected':'all',page=0,tab='all';
 const root=()=>document.querySelector('#modal');
 let history=[];
 function open(ref){history.push(origin.reference);origin=context.resolve(ref);page=0;tab='all';render()}
 function render(){
  const located=!!googleMapsURL(origin.lat,origin.lng);
  const nearby=located?context.nearby(origin,{radiusMeters,filters:scope==='selected'?filters:undefined}):[];
  const codes=new Set([...(origin.item?.codes?.length?origin.item.codes:origin.item?.anchorCodes||[]),origin.item?.code,origin.item?.yard].filter(Boolean));
  nearby.forEach(r=>{if(r.item.code)codes.add(r.item.code);if(r.item.yard)codes.add(r.item.yard)});
  const refs=context.referencesForCodes([...codes]);
  const matching=nearby.filter(r=>tab==='all'||r.type===tab),pages=Math.max(1,Math.ceil(matching.length/25));page=Math.min(page,pages-1);
  const shown=matching.slice(page*25,(page+1)*25);
  const candidates=origin.candidates||[];
  const malha=filters?.malha?MALHAS.find(m=>m.code===filters.malha)?.name:'';
  const active=filters?.layers?Object.entries(filters.layers).filter(([,v])=>v).map(([k])=>({points:'pontos',sb:'SB',pn:'PN',stations:'estações'}[k])).join(', '):'';
  dialog(origin.title||'Consulta integrada',`<div class="location-context">
   ${history.length?'<button type="button" data-location-back>← Voltar à consulta anterior</button>':''}
   <section class="location-origin"><div class="location-kicker">${esc(types[origin.type]||'Localização')}</div>
    ${locationFields(origin.type,origin.item)}
    ${origin.type==='pdf'?`<p class="location-source">${esc(origin.catalogTitle)} · ${esc(origin.sourceDate)}${origin.catalogId==='rumo-2015'?' · Documento histórico marcado “Mapa em revisão”.':''}</p><a href="${esc(origin.assetBase)}/source.pdf" target="_blank" rel="noopener noreferrer">Abrir PDF original ↗</a>`:''}
    ${located?`<div class="location-position"><span>${origin.lat.toFixed(6)}, ${origin.lng.toFixed(6)}</span>${mapsLink(origin.lat,origin.lng)}</div><p class="location-source">Localização: ${esc(origin.locationSource||'Coordenadas do ponto selecionado')}</p>`:`<p class="location-unresolved">${esc(origin.explanation||'Este rótulo não possui uma localização geográfica verificada. Selecione uma referência localizada abaixo, quando disponível.')}</p>`}
    <div class="location-actions">${located?'<button type="button" data-location-map>Ver no mapa geográfico</button>':''}${origin.type==='point'?'<button type="button" data-location-edit>Editar cadastro e fotos</button>':''}${origin.type==='pdf'?'<button type="button" data-location-drawing>Localizar na prancha</button>':''}</div>
   </section>
   ${candidates.length?`<section><h3>Escolha a localização da referência</h3><p class="muted">Há mais de uma localização possível. A consulta será feita a partir da opção escolhida.</p><div class="location-candidates">${candidates.map((c,i)=>`<button type="button" data-location-candidate="${i}">${esc(c.title)}<small>${esc(c.locationSource||'Referência por sigla')}</small></button>`).join('')}</div></section>`:''}
   ${located?`<section class="location-nearby"><h3>Informações nas proximidades</h3><div class="location-controls">
    <label class="geo-filter">Raio da consulta<select id="location-radius">${[250,500,1000,2000,5000,10000].map(n=>`<option value="${n}" ${n===radiusMeters?'selected':''}>${distance(n)}</option>`).join('')}</select></label>
    <label class="geo-filter">Camadas consultadas<select id="location-scope"><option value="all" ${scope==='all'?'selected':''}>Todas as informações</option>${filters?`<option value="selected" ${scope==='selected'?'selected':''}>Filtros selecionados no mapa</option>`:''}</select></label>
    <label class="geo-filter">Categoria dos resultados<select id="location-type">${[['all','Todas as categorias'],...Object.entries(types).filter(([k])=>['point','pn','station','sb'].includes(k))].map(([k,v])=>`<option value="${k}" ${tab===k?'selected':''}>${v}${k==='all'?'':` (${nearby.filter(r=>r.type===k).length})`}</option>`).join('')}</select></label>
   </div><p class="location-source">Distância em linha reta. Para SB, considera o ponto mais próximo do traçado.${scope==='selected'?` Filtros: ${esc(active||'nenhuma camada ativa')}${malha?` · ${esc(malha)}`:''}${filters?.subFrom?` · ${esc(subLabel(filters.subFrom,filters.subTo))}`:''}${filters?.kind?` · ${esc(filters.kind)}`:''}${filters?.line?` · ${esc(filters.line)}`:''}.`:''}</p>
   <div class="location-results" aria-live="polite">${shown.length?shown.map((r,i)=>`<details class="location-result"><summary><span><b>${esc(r.title)}</b><small>${esc(types[r.type])}</small></span><span class="location-distance">${distance(r.distanceMeters)}</span></summary><div class="location-result-body">${locationFields(r.type,r.item)}<div class="location-position"><span>${r.lat.toFixed(6)}, ${r.lng.toFixed(6)}</span>${mapsLink(r.lat,r.lng)}</div><button type="button" data-location-near="${i}">Consultar a partir deste ponto</button></div></details>`).join(''):'<p class="location-empty">Nenhum resultado neste raio e nos filtros escolhidos. Amplie o raio ou consulte todas as informações.</p>'}</div>
   <div class="pager"><span>${matching.length.toLocaleString('pt-BR')} resultados · ${page+1} / ${pages}</span><button type="button" data-location-prev ${page===0?'disabled':''}>Anterior</button><button type="button" data-location-next ${page+1>=pages?'disabled':''}>Próxima</button></div></section>`:''}
   <section class="location-references"><h3>Referências nas pranchas</h3><p class="location-source">${located?'Vinculadas pelas siglas do local e dos registros encontrados no raio.':'Vinculadas pelas siglas do rótulo selecionado.'} As datas identificam as informações históricas.</p>${refs.length?`<p class="location-source">${refs.length} referência(s)</p>${refs.map((r,i)=>`<details><summary><span class="code-pill">${esc(r.sourceDate)}</span> ${esc(r.item.text)}</summary><div><p class="location-source">${esc(r.catalogTitle)} · ${esc(r.item.category)}</p><button type="button" data-location-ref="${i}">Consultar referência</button> <button type="button" data-location-ref-map="${i}">Ver na prancha</button> <a href="${esc(r.assetBase)}/source.pdf" target="_blank" rel="noopener noreferrer">PDF original ↗</a></div></details>`).join('')}`:'<p class="muted">Não há correspondência por sigla para este ponto.</p>'}</section>
  </div>`,'CONSULTA INTEGRADA');
  const modal=root();modal.classList.add('location-dialog');
  const $=s=>modal.querySelector(s);
  modal.querySelectorAll('[data-location-candidate]').forEach(b=>b.onclick=()=>open(candidates[Number(b.dataset.locationCandidate)].reference));
  modal.querySelectorAll('[data-location-near]').forEach(b=>b.onclick=()=>open(shown[Number(b.dataset.locationNear)].reference));
  modal.querySelectorAll('[data-location-ref]').forEach(b=>b.onclick=()=>{const r=refs[Number(b.dataset.locationRef)];open({type:'pdf',id:r.item.id,catalogId:r.catalogId})});
  modal.querySelectorAll('[data-location-ref-map]').forEach(b=>b.onclick=()=>{const r=refs[Number(b.dataset.locationRefMap)];modal.close();onMap({type:'pdf',id:r.item.id,catalogId:r.catalogId,inspect:false})});
  if($('[data-location-map]'))$('[data-location-map]').onclick=()=>{modal.close();onMap({type:'coordinate',lat:origin.lat,lng:origin.lng,title:origin.title,inspect:false})};
  if($('[data-location-drawing]'))$('[data-location-drawing]').onclick=()=>{modal.close();onMap({...origin.reference,inspect:false})};
  if($('[data-location-edit]'))$('[data-location-edit]').onclick=()=>onEdit(origin.item);
  if($('[data-location-back]'))$('[data-location-back]').onclick=()=>{origin=context.resolve(history.pop());page=0;render()};
  for(const [selector,change] of [['#location-radius',v=>radiusMeters=Number(v)],['#location-scope',v=>scope=v],['#location-type',v=>tab=v]])if($(selector))$(selector).onchange=e=>{change(e.target.value);page=0;render();$(selector).focus()};
  if($('[data-location-prev]')){$('[data-location-prev]').onclick=()=>{page--;render()};$('[data-location-next]').onclick=()=>{page++;render()}}
 }
 render();
}
