const finite=value=>Number.isFinite(value);

const idKey=id=>typeof id==='string'&&id.trim()||typeof id==='number'&&finite(id)?`${typeof id}:${id}`:null;
const compare=(a,b)=>a.key.localeCompare(b.key)||a.x-b.x||a.y-b.y;
const distance=({x,y},from,spacingX,spacingY)=>((x-from.x)/spacingX)**2+((y-from.y)/spacingY)**2;
const centroid=items=>({
  x:items.reduce((sum,item)=>sum+item.x,0)/items.length,
  y:items.reduce((sum,item)=>sum+item.y,0)/items.length,
});
const nearest=(items,from,spacingX,spacingY)=>items.reduce((best,item)=>!best||distance(item,from,spacingX,spacingY)<distance(best,from,spacingX,spacingY)?item:best,null);
const direction=({x,y},center,spacingX,spacingY)=>{
  const dx=(x-center.x)/spacingX,dy=(y-center.y)/spacingY;
  if(!dx&&!dy)return null;
  if(Math.abs(dx)>=Math.abs(dy))return dx<0?'left':'right';
  return dy<0?'top':'bottom';
};

/** Cover the middle and surrounding regions, then fill remaining roomy areas. */
export function selectEntryCardCandidates(candidates,{spacingX,spacingY,center,canSelect}={}){
  if(!Array.isArray(candidates)||!finite(spacingX)||!finite(spacingY)||spacingX<=0||spacingY<=0)return [];
  const unique=[];
  const seen=new Set();
  const valid=candidates
    .map(candidate=>({candidate,key:idKey(candidate?.id),x:candidate?.x,y:candidate?.y}))
    .filter(item=>item.key&&finite(item.x)&&finite(item.y))
    .sort(compare);
  for(const item of valid)if(!seen.has(item.key)){seen.add(item.key);unique.push(item);}
  if(!unique.length)return [];

  const candidateCenter=centroid(unique);
  const widest=Math.max(
    (Math.max(...unique.map(item=>item.x))-Math.min(...unique.map(item=>item.x)))/spacingX,
    (Math.max(...unique.map(item=>item.y))-Math.min(...unique.map(item=>item.y)))/spacingY,
  );
  const fitDriven=typeof canSelect==='function';
  if(!fitDriven&&widest<.25)return [nearest(unique,candidateCenter,spacingX,spacingY).candidate];

  const origin=finite(center?.x)&&finite(center?.y)?center:candidateCenter;
  const sectors=new Map();
  for(const item of unique){
    const side=direction(item,origin,spacingX,spacingY);
    const previous=sectors.get(side);
    if(side&&(!previous||distance(item,origin,spacingX,spacingY)>distance(previous,origin,spacingX,spacingY)))sectors.set(side,item);
  }
  const core=nearest(unique,origin,spacingX,spacingY);
  const priority=[core];
  const priorityKeys=new Set([core.key]);
  for(const side of ['top','right','bottom','left']){
    const item=sectors.get(side);
    // Coverage must not disappear just because another region is nearby;
    // card placement handles overlap and the fill step controls extra density.
    if(item&&!priorityKeys.has(item.key)){priority.push(item);priorityKeys.add(item.key);}
  }
  const selected=[];
  const selectedKeys=new Set();
  const nearestDistance=new Map(unique.map(item=>[item.key,Infinity]));
  const select=item=>{
    if(!item||selectedKeys.has(item.key))return;
    selected.push(item);
    selectedKeys.add(item.key);
    for(const candidate of unique)if(!selectedKeys.has(candidate.key)){
      nearestDistance.set(candidate.key,Math.min(nearestDistance.get(candidate.key),distance(candidate,item,spacingX,spacingY)));
    }
  };

  if(fitDriven){
    const considered=new Set();
    const trySelect=item=>{
      if(!item||considered.has(item.key))return;
      considered.add(item.key);
      if(canSelect(item.candidate))select(item);
    };
    for(const item of priority)trySelect(item);
    while(considered.size<unique.length){
      let next=null,best=-Infinity;
      for(const item of unique)if(!considered.has(item.key)){
        const score=selected.length?nearestDistance.get(item.key):distance(item,origin,spacingX,spacingY);
        if(score>best){best=score;next=item;}
      }
      trySelect(next);
    }
    return selected.map(item=>item.candidate);
  }

  for(const item of priority)select(item);

  while(true){
    let next=null,best=-Infinity;
    for(const item of unique)if(!selectedKeys.has(item.key)){
      const minimum=nearestDistance.get(item.key);
      if(minimum>best){best=minimum;next=item;}
    }
    if(!next||best<1)break;
    select(next);
  }
  return selected.map(item=>item.candidate);
}
