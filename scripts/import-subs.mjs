import {readFileSync,writeFileSync} from 'node:fs';
import {createMalhaIndex} from '../src/malhas.js';
import {createSubIndex} from '../src/subs.js';

const load=name=>JSON.parse(readFileSync(new URL(`../dist/assets/${name}.json`,import.meta.url)));
const stations=load('rail-stations'),lists={points:load('rail-points'),pn:load('rail-pns'),sb:load('rail-sb')};
const index=createSubIndex(stations,createMalhaIndex(load('rail-malhas')),lists.pn);
const assigned={},counts={};
for(const [type,items] of Object.entries(lists)){
 const result={},summary={total:items.length,direct:0,estimated:0,unclassified:0};
 for(const item of items){
  const {codes,source}=index.assign(item,type==='points'?'point':type);
  if(codes.length)result[item.id]=[codes,source];
  summary[codes.length?(source.startsWith('estimada')?'estimated':'direct'):'unclassified']++;
 }
 assigned[type]=result;counts[type]=summary;
}
const output={source:'Estações SIV julho/2015; SUB explícita em Pns.zip; estimativa geográfica para demais objetos',method:'Estação ou PN com SUB explícita mais próxima na mesma malha, até 25 km; empate geográfico inclui todas as SUBs possíveis',subs:[...new Set([...index.subs,...Object.values(assigned.pn).flatMap(a=>a[0])])].sort((a,b)=>Number(a)-Number(b)),counts,assignments:assigned};
writeFileSync(new URL('../dist/assets/rail-subs.json',import.meta.url),JSON.stringify(output));
console.log(JSON.stringify(counts));
