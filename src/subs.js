import {malhaForPoint} from './malhas.js';

const CELL=.2,MAX_KM=25;
const key=(x,y)=>`${x},${y}`;
const number=v=>{const raw=String(v??'').trim();if(!/^\d{1,3}$/.test(raw))return null;const n=Number(raw);return n>=0&&n<=999?n:null};
export const normalizeSub=v=>{const n=number(v);return n===null?'':String(n).padStart(2,'0')};
export const stationSubs=station=>[...new Set((station.records||[]).map(r=>normalizeSub(r.sub)).filter(Boolean))].sort((a,b)=>Number(a)-Number(b));
export const explicitPnSub=pn=>normalizeSub(pn.name?.match(/\bSUB\s*[-:]?\s*(\d{1,3})\b/i)?.[1]);
export const subLabel=(from,to)=>!from?'Todas as SUBs':to&&to!==from?`SUB ${Math.min(Number(from),Number(to))}–${Math.max(Number(from),Number(to))}`:`SUB ${from}`;
export function subMatches(codes,from='',to=''){
 if(!from)return true;
 const start=number(from),end=number(to)??start;
 return (codes||[]).some(v=>{const n=number(v);return n!==null&&n>=Math.min(start,end)&&n<=Math.max(start,end)});
}

// Direct memberships come from station records and PN names. Other features are
// assigned to the nearest located station, on the same concession, within 25 km.
// An equidistant competing SUB is kept as ambiguous rather than arbitrarily chosen.
export function createSubIndex(stations,malhaIndex,pnPoints=[]){
 const grid=new Map(),byCode=new Map();
 function addAnchor(lat,lng,codes,code,kind){
  if(!Number.isFinite(lat)||!Number.isFinite(lng))return;
  const x=Math.floor(lng/CELL),y=Math.floor(lat/CELL),cell=key(x,y);
  if(!grid.has(cell))grid.set(cell,[]);
  grid.get(cell).push({lat,lng,codes,malha:malhaIndex?malhaForPoint(malhaIndex,lat,lng):'',code,kind});
 }
 for(const station of stations){
  const codes=stationSubs(station);
  if(!codes.length)continue;
  byCode.set(station.code.toUpperCase(),codes);
  addAnchor(station.lat,station.lng,codes,station.code,'estação');
 }
 for(const pn of pnPoints){
  const sub=explicitPnSub(pn);
  if(sub)addAnchor(pn.lat,pn.lng,[sub],pn.id,'PN');
 }
 function nearby(lat,lng){
  if(!Number.isFinite(lat)||!Number.isFinite(lng))return {codes:[],source:'sem correspondência'};
  const x=Math.floor(lng/CELL),y=Math.floor(lat/CELL),malha=malhaIndex?malhaForPoint(malhaIndex,lat,lng):'';
  const found=[];
  for(let dx=-2;dx<=2;dx++)for(let dy=-2;dy<=2;dy++)for(const station of grid.get(key(x+dx,y+dy))||[]){
   if(malha&&station.malha&&malha!==station.malha)continue;
   const dLat=(lat-station.lat)*111.195,dLng=(lng-station.lng)*111.195*Math.cos(lat*Math.PI/180),distance=Math.hypot(dLat,dLng);
   if(distance<=MAX_KM)found.push({...station,distance});
  }
  found.sort((a,b)=>a.distance-b.distance);
  if(!found.length)return {codes:[],source:'sem estação a até 25 km'};
  const winner=found[0],codes=new Set(winner.codes);
  // A boundary or junction may have two stations almost equally close.
  for(const candidate of found.slice(1)){
   if(candidate.distance-winner.distance>1.5||candidate.distance>winner.distance*1.15)break;
   candidate.codes.forEach(code=>codes.add(code));
  }
  return {codes:[...codes].sort((a,b)=>Number(a)-Number(b)),source:`estimada por proximidade à ${winner.kind} ${winner.code} (${winner.distance.toFixed(1)} km)`};
 }
 function assign(item,type){
  if(type==='station')return {codes:stationSubs(item),source:'SIV julho/2015'};
  if(type==='pn'){
   const explicit=explicitPnSub(item);
   if(explicit)return {codes:[explicit],source:'SUB informada no arquivo PN'};
  }
  if(type==='point'){
   const direct=byCode.get(String(item.yard||'').trim().toUpperCase());
   if(direct?.length)return {codes:direct,source:'sigla da estação no SIV julho/2015'};
  }
  if(type==='sb'){
   const coords=item.coordinates||[];
   if(!coords.length)return {codes:[],source:'sem geometria'};
   const samples=[coords[0],coords[Math.floor((coords.length-1)/2)],coords.at(-1)].filter(Boolean);
   const matches=samples.map(([lng,lat])=>nearby(lat,lng));
   const codes=[...new Set(matches.flatMap(m=>m.codes))].sort((a,b)=>Number(a)-Number(b));
   return {codes,source:codes.length?'estimada pelas estações próximas ao traçado da SB':'sem estação próxima ao traçado da SB'};
  }
  return nearby(item.lat,item.lng);
 }
 return {assign,subs:[...new Set(stations.flatMap(stationSubs))].sort((a,b)=>Number(a)-Number(b))};
}

export function decorateSubs(items,type,index,assignments){
 return items.map(item=>{
  const saved=assignments?.[item.id];
  const info=saved?{codes:saved[0],source:saved[1]}:index.assign(item,type);
  return {...item,subCodes:info.codes,subSource:info.source};
 });
}
