import {malhaForPoint,malhaForLine} from './malhas.js';
import {subMatches} from './subs.js';

const EARTH_RADIUS=6371008.8;
const radians=value=>value*Math.PI/180;
const validCoordinate=(lat,lng)=>Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180;
const codeKey=value=>String(value??'').trim().toUpperCase();
const itemCodes=item=>(item.codes?.length?item.codes:item.anchorCodes||[]).map(codeKey).filter(Boolean);
const subKey=value=>String(value??'').trim().replace(/^0+(?=\d)/,'');
const longitudeDelta=value=>((value+540)%360)-180;
const coordinateOf=item=>validCoordinate(item?.lat,item?.lng)?{lat:item.lat,lng:item.lng}:null;

export function googleMapsURL(lat,lng){
 return validCoordinate(lat,lng)?`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`:null;
}

function distance(a,b){
 const dLat=radians(b.lat-a.lat),dLng=radians(longitudeDelta(b.lng-a.lng));
 const chord=Math.sin(dLat/2)**2+Math.cos(radians(a.lat))*Math.cos(radians(b.lat))*Math.sin(dLng/2)**2;
 return 2*EARTH_RADIUS*Math.asin(Math.sqrt(Math.min(1,Math.max(0,chord))));
}

function coordinatePairs(line){
 // Invalid vertices break a path rather than creating a false segment across it.
 return (line?.coordinates||[]).map(pair=>Array.isArray(pair)&&validCoordinate(pair[1],pair[0])?{lat:pair[1],lng:pair[0]}:null);
}

function interpolate(a,b,t){
 return {lat:a.lat+(b.lat-a.lat)*t,lng:longitudeDelta(a.lng+longitudeDelta(b.lng-a.lng)*t)};
}

function nearestOnLine(origin,line){
 const coordinates=coordinatePairs(line);
 let nearest=null;
 const consider=coordinate=>{
  const distanceMeters=distance(origin,coordinate);
  if(!nearest||distanceMeters<nearest.distanceMeters)nearest={...coordinate,distanceMeters};
 };
 for(let i=0;i<coordinates.length;i++){
  const a=coordinates[i];
  if(!a)continue;
  consider(a);
  const b=coordinates[i+1];
  if(!b)continue;
  const scale=Math.cos(radians(origin.lat));
  const ax=longitudeDelta(a.lng-origin.lng)*scale,ay=a.lat-origin.lat;
  const dx=longitudeDelta(b.lng-a.lng)*scale,dy=b.lat-a.lat;
  const lengthSquared=dx*dx+dy*dy;
  const t=lengthSquared?Math.max(0,Math.min(1,-(ax*dx+ay*dy)/lengthSquared)):0;
  consider(interpolate(a,b,t));
 }
 return nearest;
}

function midpointOnLine(line){
 const coordinates=coordinatePairs(line),segments=[];
 let total=0;
 for(let i=1;i<coordinates.length;i++){
  const a=coordinates[i-1],b=coordinates[i];
  if(!a||!b)continue;
  const length=distance(a,b);
  segments.push({a,b,length});total+=length;
 }
 if(!total)return coordinates.find(Boolean)||null;
 let remaining=total/2;
 for(const segment of segments){
  if(remaining<=segment.length)return interpolate(segment.a,segment.b,remaining/segment.length);
  remaining-=segment.length;
 }
 return segments.at(-1).b;
}

/** Join schematic references to verified geographic data without interpreting PDF pixels as coordinates. */
export function createLocationContext({points=[],sbSegments=[],pnPoints=[],stations=[],catalogs=[],malhaIndex}={}){
 const byId=rows=>new Map(rows.map(item=>[String(item.id),item]));
 const pointById=byId(points),pnById=byId(pnPoints),sbById=byId(sbSegments);
 const stationByCode=new Map(stations.map(item=>[codeKey(item.code),item]));
 const pointsByCode=new Map(),catalogById=new Map(),referencesByCode=new Map();
 const pointMalhas=new WeakMap(),lineMalhas=new WeakMap();
 for(const point of points){
  const code=codeKey(point.yard);
  if(!code)continue;
  if(!pointsByCode.has(code))pointsByCode.set(code,[]);
  pointsByCode.get(code).push(point);
 }
 catalogs.forEach((catalog,index)=>{
  const catalogId=String(catalog.id??catalog.catalogId??(index===0?'operation':`catalog-${index+1}`));
  const entry={...catalog,id:catalogId,itemsById:new Map((catalog.items||[]).map(item=>[String(item.id),item]))};
  catalogById.set(catalogId,entry);
  for(const item of catalog.items||[]){
   for(const code of new Set(itemCodes(item))){
    if(!referencesByCode.has(code))referencesByCode.set(code,[]);
    referencesByCode.get(code).push({catalogId,catalogTitle:catalog.title,sourceDate:catalog.sourceDate,assetBase:catalog.assetBase,item});
   }
  }
 });

 function result(reference,item,title,coordinate,locationSource,extra={}){
  return {reference:{...reference},type:reference.type,title,item,...coordinate,locationSource,...extra,
   ...(!coordinate?{explanation:extra.explanation||'Não há coordenadas verificadas para esta referência.'}:{})};
 }

 function candidatesForCode(code){
  const station=stationByCode.get(code);
  if(coordinateOf(station))return [resolve({type:'station',id:code})];
  const candidates=(pointsByCode.get(code)||[]).filter(coordinateOf).map(point=>resolve({type:'point',id:point.id}));
  // Repeated KMZ records at the same position do not introduce geographic ambiguity.
  return [...new Map(candidates.map(candidate=>[`${candidate.lat},${candidate.lng}`,candidate])).values()];
 }

 function resolve(reference={}){
  const type=reference.type;
  if(type==='coordinate'){
   const coordinate=coordinateOf(reference);
   return result(reference,null,reference.title||'Localização selecionada',coordinate,'Coordenadas do mapa');
  }
  if(type==='point'){
   const item=pointById.get(String(reference.id));
   return result(reference,item,item?.name||'Ponto ferroviário',coordinateOf(item),String(item?.id).startsWith('kmz-')?'KMZ georreferenciado':'Cadastro geográfico');
  }
  if(type==='pn'){
   const item=pnById.get(String(reference.id));
   return result(reference,item,item?.name||'Passagem de nível',coordinateOf(item),'Arquivo de passagens de nível');
  }
  if(type==='station'){
   const item=stationByCode.get(codeKey(reference.id??reference.code));
   return result(reference,item,item?`${item.name} (${item.code})`:'Estação',coordinateOf(item),item?.locationSource||'Coordenadas de estação');
  }
  if(type==='sb'){
   const item=sbById.get(String(reference.id));
   const clicked=item&&coordinateOf(reference),projected=clicked?nearestOnLine(clicked,item):null;
   const coordinate=projected?{lat:projected.lat,lng:projected.lng}:midpointOnLine(item);
   return result(reference,item,`SB ${item?.id??reference.id??''}`,coordinate,projected?'Ponto da geometria SB mais próximo do clique':'Ponto médio ao longo da geometria SB');
  }
  if(type==='pdf'){
   const catalog=reference.catalogId!=null?catalogById.get(String(reference.catalogId)):catalogById.values().next().value;
   const item=catalog?.itemsById.get(String(reference.id));
   const provenance={catalogId:catalog?.id,catalogTitle:catalog?.title,sourceDate:catalog?.sourceDate,assetBase:catalog?.assetBase};
   const base=result(reference,item,item?.text||'Referência da prancha',null,'Prancha esquemática',provenance);
   if(!item)return {...base,explanation:'Referência não encontrada nesta prancha.'};
   const codes=[...new Set(itemCodes(item))];
   if(item.category==='SUB'&&!codes.length){
    const sub=subKey(item.text);
    const candidates=stations.filter(station=>(station.records||[]).some(record=>subKey(record.sub)===sub)&&coordinateOf(station)).map(station=>resolve({type:'station',id:station.code}));
    return {...base,candidates,explanation:candidates.length?'Esta SUB representa um trecho. Escolha uma estação para consultar as proximidades.':'Nenhuma estação desta SUB tem coordenadas verificadas na base disponível.'};
   }
   const candidates=codes.flatMap(candidatesForCode);
   const unresolvedCodes=codes.filter(code=>!candidatesForCode(code).length);
   if(codes.length===1&&candidates.length===1){
    const anchor=candidates[0];
    return {...base,lat:anchor.lat,lng:anchor.lng,explanation:undefined,anchorReference:anchor.reference,
     locationSource:`Correspondência exata pela sigla ${codes[0]} · ${anchor.locationSource}`};
   }
   return {...base,candidates,unresolvedCodes,explanation:candidates.length?'A referência corresponde a mais de uma localização. Escolha o ponto desejado.':codes.length?`Sem coordenadas verificadas para ${codes.join(', ')}.`:'Esta anotação da prancha não identifica uma localização geográfica única.'};
  }
  return result(reference,null,'Referência desconhecida',null,'', {explanation:'Tipo de referência não reconhecido.'});
 }

 function referencesForCodes(codes=[]){
  const results=new Map();
  for(const code of codes){
   for(const row of referencesByCode.get(codeKey(code))||[])results.set(`${row.catalogId}:${row.item.id}`,row);
  }
  return [...results.values()];
 }

 function malhaFor(item,type){
  if(!malhaIndex)return '';
  const cache=type==='sb'?lineMalhas:pointMalhas;
  if(!cache.has(item))cache.set(item,type==='sb'?malhaForLine(malhaIndex,item.coordinates):malhaForPoint(malhaIndex,item.lat,item.lng));
  return cache.get(item);
 }

 function nearby(origin,{radiusMeters=2000,filters={}}={}){
  if(!coordinateOf(origin))return [];
  const radius=Number.isFinite(radiusMeters)&&radiusMeters>=0?radiusMeters:2000;
  const layers={points:true,sb:true,pn:true,stations:true,...filters.layers};
  const results=[];
  function add(type,item,id,title,coordinate){
   if(!coordinate)return;
   const distanceMeters=coordinate.distanceMeters??distance(origin,coordinate);
   if(distanceMeters>radius)return;
   if(filters.malha&&malhaFor(item,type)!==filters.malha)return;
   if(!subMatches(item.subCodes,filters.subFrom,filters.subTo))return;
   const reference={type,id,...(type==='sb'?{lat:coordinate.lat,lng:coordinate.lng}:{})};
   results.push({type,id,title,lat:coordinate.lat,lng:coordinate.lng,distanceMeters,item,reference});
  }
  if(layers.points)for(const item of points){
   if(filters.kind&&item.kind!==filters.kind)continue;
   if(filters.line&&item.line_type!==filters.line)continue;
   add('point',item,item.id,item.name||'Ponto ferroviário',coordinateOf(item));
  }
  if(layers.pn)for(const item of pnPoints)add('pn',item,item.id,item.name||'Passagem de nível',coordinateOf(item));
  if(layers.stations)for(const item of stations)add('station',item,item.code,`${item.name} (${item.code})`,coordinateOf(item));
  if(layers.sb)for(const item of sbSegments)add('sb',item,item.id,`SB ${item.id}`,nearestOnLine(origin,item));
  return results.sort((a,b)=>a.distanceMeters-b.distanceMeters||a.type.localeCompare(b.type)||String(a.id).localeCompare(String(b.id)));
 }

 return {resolve,nearby,referencesForCodes};
}
