import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createMalhaIndex} from '../src/malhas.js';
import {createSubIndex,decorateSubs,explicitPnSub,normalizeSub,subMatches,subLabel} from '../src/subs.js';
import {createLocationContext} from '../src/location-context.js';
const read=name=>JSON.parse(readFileSync(new URL(`../dist/assets/${name}.json`,import.meta.url)));
const stations=read('rail-stations'),malhaIndex=createMalhaIndex(read('rail-malhas')),raw=read('rail-subs'),rawPn=read('rail-pns');
const index=createSubIndex(stations,malhaIndex,rawPn),points=decorateSubs(read('rail-points'),'point',index,raw.assignments.points),pn=decorateSubs(rawPn,'pn',index,raw.assignments.pn),sb=decorateSubs(read('rail-sb'),'sb',index,raw.assignments.sb);
const located=decorateSubs(stations,'station',index);
assert.equal(normalizeSub('01'),'01');assert.equal(normalizeSub('101'),'101');assert.equal(normalizeSub(''), '');
assert.equal(explicitPnSub(pn[0]),'101');assert.deepEqual(pn[0].subCodes,['101']);
assert.equal(subLabel('74','98'),'SUB 74–98');
assert.equal(subMatches(['74'],'74'),true);
assert.equal(subMatches(['74'],'75'),false);
assert.equal(subMatches(['74','98'],'75','98'),true);
assert.equal(subMatches(['98'],'98','74'),true);
assert.equal(subMatches([], '74','98'),false);
const tag=located.find(s=>s.code==='TAG');assert.deepEqual(tag.subCodes,['74','98']);
const yard=points.find(p=>p.yard==='JAB');assert.deepEqual(yard.subCodes,['82']);assert.match(yard.subSource,/sigla da estação/);
assert.equal(raw.counts.points.total,points.length);assert.equal(raw.counts.pn.total,pn.length);assert.equal(raw.counts.sb.total,sb.length);
for(const [type,items] of Object.entries({points,pn,sb})){
 const counted={direct:0,estimated:0,unclassified:0};
 for(const item of items){
  const fresh=index.assign(item,type==='points'?'point':type);
  assert.deepEqual(item.subCodes,fresh.codes,`${type}:${item.id} differs from import`);
  assert.equal(item.subSource,fresh.source,`${type}:${item.id} source differs from import`);
  counted[item.subCodes.length?(item.subSource.startsWith('estimada')?'estimated':'direct'):'unclassified']++;
 }
 assert.deepEqual(counted,{direct:raw.counts[type].direct,estimated:raw.counts[type].estimated,unclassified:raw.counts[type].unclassified});
}
const context=createLocationContext({points,sbSegments:sb,pnPoints:pn,stations:located,malhaIndex});
const origin=context.resolve({type:'station',id:'TAG'});
const exact=context.nearby(origin,{radiusMeters:10000,filters:{subFrom:'74',subTo:'74'}});
const range=context.nearby(origin,{radiusMeters:10000,filters:{subFrom:'74',subTo:'98'}});
assert.ok(exact.length>0);assert.ok(range.length>=exact.length);
assert.ok(exact.every(item=>subMatches(item.item.subCodes,'74')));
assert.ok(range.every(item=>subMatches(item.item.subCodes,'74','98')));
const pn101=pn.filter(p=>subMatches(p.subCodes,'101'));
assert.ok(pn101.length>=311);
const unclassified=points.find(p=>!p.subCodes.length);assert.ok(unclassified);
assert.ok(!subMatches(unclassified.subCodes,'01','103'));
console.log(`PASS: SUB única/intervalo, ${points.length} pontos, ${pn.length} PN, ${sb.length} SB, fontes explícitas/estimadas e consulta integrada.`);
