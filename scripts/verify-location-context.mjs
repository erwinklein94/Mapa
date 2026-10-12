import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createLocationContext,googleMapsURL} from '../src/location-context.js';
import {createMalhaIndex} from '../src/malhas.js';

const points=[
 {id:'kmz-a',name:'AMV A',yard:'AAA',lat:0,lng:.01,kind:'AMV',line_type:'Principal'},
 {id:'kmz-b',name:'Ponto B',yard:'BBB',lat:0,lng:.02,kind:'Ponto ferroviário',line_type:'Desvio'},
 {id:'kmz-b2',name:'Ponto B distante',yard:'BBB',lat:0,lng:.04},
 {id:'kmz-c',name:'Ponto C',yard:'CCC',lat:0,lng:.01},
 {id:'invalid',name:'Sem localização',lat:null,lng:null}
];
const stations=[{code:'AAA',name:'Estação A',lat:0,lng:0,locationSource:'Base de teste',records:[{sub:'07'}]},
 {code:'DDD',name:'Estação sem coordenadas',lat:null,lng:null,records:[{sub:'07'}]}];
const pnPoints=[{id:'pn-1',name:'PN',lat:.001,lng:0}];
const sbSegments=[
 {id:'sb-cross',coordinates:[[-.2,0],[.2,0]]},
 {id:'sb-out',coordinates:[[1,1],[2,2]]},
 {id:'sb-broken',coordinates:[[-.1,.01],[null,null],[.1,.01]]},
 {id:'sb-bend',coordinates:[[0,0],[.01,0],[.01,.03]]}
];
const catalogs=[{id:'new',title:'Fonte 2015',sourceDate:'2015',assetBase:'assets/new',items:[
 {id:'a',text:'Estação A (AAA)',codes:['AAA']},
 {id:'b',text:'Pátio B (BBB)',codes:['BBB']},
 {id:'ab',text:'Ligação (AAA/BBB)',codes:['AAA','BBB']},
 {id:'ad',text:'Ligação (AAA/DDD)',codes:['AAA','DDD']},
 {id:'note',text:'Nota sem localização',codes:[]},
 {id:'sub',text:'7',category:'SUB',codes:[]},
 {id:'km',text:'KM 20',category:'Quilometragens',codes:[],anchorCodes:['AAA']},
 {id:'own-code',text:'KM (BBB)',codes:['BBB'],anchorCodes:['AAA']}
 ]},{id:'old',title:'Fonte 2023',sourceDate:'2023',assetBase:'assets/old',items:[{id:'a',text:'AAA (AAA)',codes:['AAA']}]}];
const malhaIndex=createMalhaIndex({lines:[{code:'RMN',paths:[[[-.1,0],[.1,0]]]}]});
const engine=createLocationContext({points,pnPoints,stations,sbSegments,catalogs,malhaIndex});

assert.equal(engine.resolve({type:'point',id:'kmz-a'}).lng,.01);
assert.equal(engine.resolve({type:'pn',id:'pn-1'}).lat,.001);
assert.equal(engine.resolve({type:'station',id:'aaa'}).title,'Estação A (AAA)');
assert.equal(engine.resolve({type:'pdf',catalogId:'new',id:'a'}).lng,0,'Station coordinates take priority over yard KMZ coordinates');
assert.match(engine.resolve({type:'pdf',catalogId:'new',id:'a'}).locationSource,/sigla AAA/);
assert.equal(engine.resolve({type:'pdf',catalogId:'new',id:'km'}).lng,0,'KM labels can use verified box anchor codes');
assert.equal(engine.resolve({type:'pdf',catalogId:'new',id:'own-code'}).candidates.length,2,'Explicit label codes take precedence over inferred box anchors');
assert.equal(engine.resolve({type:'pdf',catalogId:'new',id:'b'}).candidates.length,2,'Multiple yard points require user selection');
assert.equal(engine.resolve({type:'pdf',catalogId:'new',id:'ab'}).candidates.length,3);
const partiallyLocated=engine.resolve({type:'pdf',catalogId:'new',id:'ad'});
assert.equal(partiallyLocated.lat,undefined,'A partially located multi-code item must not silently resolve to one code');
assert.deepEqual(partiallyLocated.unresolvedCodes,['DDD']);
assert.equal(engine.resolve({type:'pdf',catalogId:'new',id:'sub'}).candidates.length,1,'SUB matches leading-zero station subdivisions and excludes unlocated stations');
assert.equal(engine.resolve({type:'pdf',catalogId:'new',id:'note'}).lat,undefined);
assert.equal(engine.resolve({type:'pdf',catalogId:'missing',id:'a'}).lat,undefined);
assert.equal(engine.resolve({type:'station',id:'DDD'}).lat,undefined);
assert.equal(engine.resolve({type:'coordinate',lat:null,lng:null}).lat,undefined);
assert.equal(engine.resolve({type:'coordinate',lat:0,lng:181}).lat,undefined);
assert.equal(engine.resolve({type:'coordinate',lat:0,lng:0}).lat,0,'Zero is a valid coordinate');
assert.equal(googleMapsURL(null,null),null);
assert.equal(googleMapsURL(91,0),null);
assert.equal(googleMapsURL(0,Infinity),null);
assert.equal(googleMapsURL(0,0),'https://www.google.com/maps/search/?api=1&query=0%2C0');
assert.ok(Math.abs(engine.resolve({type:'sb',id:'sb-cross',lat:0,lng:.08}).lng-.08)<1e-10,'SB clicks retain the clicked location along the line');
const sbClick=engine.resolve({type:'sb',id:'sb-cross',lat:.001,lng:.08});
assert.equal(sbClick.lat,0,'SB hit tolerance must not create an off-track Google Maps location');
assert.ok(Math.abs(sbClick.lng-.08)<1e-10);
assert.match(sbClick.locationSource,/mais próximo do clique/);
const midpoint=engine.resolve({type:'sb',id:'sb-bend'});
assert.ok(Math.abs(midpoint.lat-.01)<1e-6&&Math.abs(midpoint.lng-.01)<1e-6,'SB fallback follows length along the polyline');
const refs=engine.referencesForCodes(['aaa','AAA']);
assert.equal(refs.length,5,'References retain both source catalogs, anchored KM labels, and deduplicate repeated lookup codes');
assert.deepEqual(new Set(refs.map(ref=>ref.catalogId)),new Set(['new','old']));

const near=engine.nearby({lat:0,lng:0},{radiusMeters:1500});
assert.ok(near.some(row=>row.id==='sb-cross'&&row.distanceMeters<.001),'Nearby search detects segment interiors with distant endpoints');
assert.ok(!near.some(row=>row.id==='sb-out'));
assert.ok(!near.some(row=>row.id==='sb-broken'),'Invalid vertices must not be connected across a gap');
assert.ok(!near.some(row=>row.id==='invalid'||row.id==='DDD'),'Null coordinates must not appear near (0,0)');
assert.ok(near.some(row=>row.type==='point')&&near.some(row=>row.type==='pn')&&near.some(row=>row.type==='station')&&near.some(row=>row.type==='sb'));
assert.ok(near.every((row,index)=>index===0||row.distanceMeters>=near[index-1].distanceMeters));
const selected=engine.nearby({lat:0,lng:0},{radiusMeters:5000,filters:{layers:{points:true,pn:false,stations:false,sb:false},kind:'AMV',line:'Principal',malha:'RMN'}});
assert.deepEqual(selected.map(row=>row.id),['kmz-a']);
assert.deepEqual(engine.nearby({lat:null,lng:null}),[]);
assert.deepEqual(engine.nearby({lat:0,lng:0},{filters:{malha:'RMS'}}),[]);
assert.deepEqual(engine.nearby({lat:0,lng:0},{filters:{layers:{points:false,pn:false,stations:false,sb:false}}}),[]);
const small=engine.nearby({lat:0,lng:0},{radiusMeters:100});
assert.ok(!small.some(row=>row.type==='pn'),'Radius is in meters');

// Verify real assets join by exact codes and keep source-specific ids intact.
const load=name=>JSON.parse(readFileSync(new URL(`../dist/assets/${name}`,import.meta.url)));
const actualPoints=load('rail-points.json'),actualStations=load('rail-stations.json');
const actualCatalog={...load('operation/catalog.json'),id:'operation',assetBase:'assets/operation'};
const actual=createLocationContext({points:actualPoints,stations:actualStations,pnPoints:load('rail-pns.json'),sbSegments:load('rail-sb.json'),catalogs:[actualCatalog]});
const tag=actualStations.find(row=>row.code==='TAG');
const tagLabel=actualCatalog.items.find(row=>row.codes.length===1&&row.codes[0]==='TAG');
assert.ok(tagLabel);
const resolvedTag=actual.resolve({type:'pdf',catalogId:'operation',id:tagLabel.id});
assert.equal(resolvedTag.lat,tag.lat);
assert.equal(resolvedTag.lng,tag.lng);
const tagNearby=actual.nearby(resolvedTag);
assert.ok(tagNearby.some(row=>row.type==='station'&&row.id==='TAG'&&row.distanceMeters===0));
assert.ok(tagNearby.some(row=>row.type==='point'&&row.item.yard==='TAG'));
console.log(`Location integration verified: exact codes, ambiguity, source provenance, radius, layers, malhas, SB interiors; ${tagNearby.length} real records near TAG.`);
