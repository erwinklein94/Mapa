import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createMalhaIndex,malhaForPoint,malhaForLine} from '../src/malhas.js';

const load=name=>JSON.parse(readFileSync(new URL(`../dist/assets/${name}`,import.meta.url)));
const index=createMalhaIndex(load('rail-malhas.json'));
const points=load('rail-points.json');
const pn=load('rail-pns.json');
const sb=load('rail-sb.json');
const reference={TAG:'RMN',JCB:'RMO',JLG:'RMO',ZAR:'RMP',ZOU:'RMS'};
for(const [yard,expected] of Object.entries(reference)){
 const sample=points.find(point=>point.yard===yard);
 assert.ok(sample,`Pátio ${yard} ausente`);
 assert.equal(malhaForPoint(index,sample.lat,sample.lng),expected,`Pátio ${yard}`);
}
assert.equal(malhaForPoint(index,pn[0].lat,pn[0].lng),'RMC','PN de Porto Nacional');
assert.equal(malhaForPoint(index,-15,-45),'','Ponto distante das concessões');

for(const [label,rows,classify] of [
 ['KMZ',points,point=>malhaForPoint(index,point.lat,point.lng)],
 ['PN',pn,point=>malhaForPoint(index,point.lat,point.lng)],
 ['SB',sb,segment=>malhaForLine(index,segment.coordinates)]
]){
 const counts={};
 for(const row of rows){const code=classify(row)||'sem malha';counts[code]=(counts[code]||0)+1}
 assert.equal(Object.values(counts).reduce((sum,count)=>sum+count,0),rows.length);
 assert.ok(Object.keys(counts).length>=5,`${label}: cobertura insuficiente`);
 console.log(label,counts);
}
