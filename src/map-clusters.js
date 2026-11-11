// Group projected points by their on-screen distance. Anchors stay on a real
// member, so neither the source coordinates nor any destination is synthesized.
export function groupMapPoints(rows,project,radius=52){
 if(!Number.isFinite(radius)||radius<=0)throw new RangeError('Invalid grouping radius');
 const groups=[],cells=new Map(),limit=radius*radius;
 for(const row of rows){
  if(row.type==='sb')continue;
  const {lat,lng}=row.item;
  if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)continue;
  const {x,y}=project(lat,lng),cx=Math.floor(x/radius),cy=Math.floor(y/radius);
  if(!Number.isFinite(x)||!Number.isFinite(y))continue;
  let nearest=null,best=limit;
  for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){
   for(const group of cells.get(`${cx+dx}:${cy+dy}`)||[]){
    const d=(x-group.x)**2+(y-group.y)**2;
    if(d<=best&&(!nearest||d<best||group.index<nearest.index)){nearest=group;best=d}
   }
  }
  if(nearest){nearest.rows.push(row);continue}
  const group={index:groups.length,x,y,lat,lng,rows:[row]};groups.push(group);
  const key=`${cx}:${cy}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(group);
 }
 return groups;
}
