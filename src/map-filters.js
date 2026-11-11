import {MALHAS,malhaForPoint,malhaForLine} from './malhas.js';
import {subMatches,subLabel} from './subs.js';

const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export const geographicKey=r=>`${r.type}:${r.type==='station'?r.item.code:r.item.id}`;
export const layerNames={points:'Pontos e cadastros',sb:'SB',pn:'Passagens de nível',stations:'Estações'};

export function filterLabels(f){
 return [
  ...(f.query?.trim()?[['query',`Busca: ${f.query.trim()}`]]:[]),
  ...(f.malha?[['malha',MALHAS.find(m=>m.code===f.malha)?.name||f.malha]]:[]),
  ...(f.subFrom?[['sub',subLabel(f.subFrom,f.subTo)]]:[]),
  ...(f.kind?[['kind',`Tipo: ${f.kind}`]]:[]),
  ...(f.line?[['line',`Linha: ${f.line}`]]:[])
 ];
}

// Map, records and CSV share the same geographical selection and text matching.
export function createGeographicSelector({points=[],sbSegments=[],pnPoints=[],stations=[],malhaIndex}){
 const cache=new WeakMap();
 const malha=(item,type)=>{
  if(!cache.has(item))cache.set(item,type==='sb'?malhaForLine(malhaIndex,item.coordinates):malhaForPoint(malhaIndex,item.lat,item.lng));
  return cache.get(item);
 };
 const located=p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&Math.abs(p.lat)<=90&&Math.abs(p.lng)<=180;
 return (f={})=>{
  const q=norm(f.query?.trim()),has=text=>norm(text).includes(q);
  const accepts=(item,type)=>subMatches(item.subCodes,f.subFrom,f.subTo)&&(!f.malha||malha(item,type)===f.malha);
  const layers=f.layers||{};
  return [
   ...(layers.stations?stations.filter(s=>located(s)&&accepts(s,'station')&&has(`${s.name} ${s.code} ${s.records.map(r=>`${r.km} ${r.sub}`).join(' ')}`)).map(item=>({type:'station',item})):[]),
   ...(layers.points?points.filter(p=>located(p)&&accepts(p,'point')&&(!f.kind||p.kind===f.kind)&&(!f.line||p.line_type===f.line)&&has(`${p.name} ${p.yard} ${p.source_km} ${p.kind}`)).map(item=>({type:'point',item})):[]),
   ...(layers.sb?sbSegments.filter(s=>accepts(s,'sb')&&has(`SB ${s.id} ${s.km_start} ${s.km_end}`)).map(item=>({type:'sb',item})):[]),
   ...(layers.pn?pnPoints.filter(p=>located(p)&&accepts(p,'pn')&&has(`${p.name} ${p.km} ${p.place} ${p.uf} ${p.section}`)).map(item=>({type:'pn',item})):[])
  ];
 };
}
