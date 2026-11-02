// Finds a screen-space origin for a card. `point` is the preferred card origin;
// callers that anchor a card to its centre can subtract half its dimensions first.
const finite=value=>Number.isFinite(value);

function rectFrom(value){
  if(!value||typeof value!=='object')return null;
  const x=value.x??value.left,y=value.y??value.top;
  const width=value.width??(finite(value.right)&&finite(x)?value.right-x:undefined);
  const height=value.height??(finite(value.bottom)&&finite(y)?value.bottom-y:undefined);
  return finite(x)&&finite(y)&&finite(width)&&finite(height)&&width>0&&height>0?{x,y,width,height}:null;
}

function originFrom(value){
  if(!value||typeof value!=='object')return null;
  const x=value.x??value.left,y=value.y??value.top;
  return finite(x)&&finite(y)?{x,y}:null;
}

const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));

/**
 * Return the nearest non-overlapping origin for a card, or null when none fits.
 * Occupied rectangles may use either x/y/width/height or left/top/right/bottom.
 */
export function placeEntryCard({point,width,height,bounds,occupied=[],gap=8,previous}={}){
  if(!point||!bounds||!finite(point.x)||!finite(point.y)||!finite(width)||!finite(height)||width<=0||height<=0)return null;
  const {left,top,right,bottom}=bounds;
  if(!finite(left)||!finite(top)||!finite(right)||!finite(bottom)||right-left<width||bottom-top<height)return null;

  const safeGap=finite(gap)?Math.max(0,gap):8;
  const cards=Array.isArray(occupied)?occupied.map(rectFrom).filter(Boolean):[];
  const minX=left,maxX=right-width,minY=top,maxY=bottom-height;
  const fits=(x,y)=>{
    if(x<minX||x>maxX||y<minY||y>maxY)return false;
    return cards.every(card=>x+width+safeGap<=card.x||x>=card.x+card.width+safeGap||y+height+safeGap<=card.y||y>=card.y+card.height+safeGap);
  };

  const previousOrigin=originFrom(previous);
  if(previousOrigin&&fits(previousOrigin.x,previousOrigin.y))return {x:previousOrigin.x,y:previousOrigin.y,width,height};

  const xs=[point.x,minX,maxX],ys=[point.y,minY,maxY];
  for(const card of cards){
    xs.push(card.x-safeGap-width,card.x+card.width+safeGap);
    ys.push(card.y-safeGap-height,card.y+card.height+safeGap);
  }
  const candidates=[];
  const seen=new Set();
  for(const rawX of xs)for(const rawY of ys){
    const x=clamp(rawX,minX,maxX),y=clamp(rawY,minY,maxY),key=`${x},${y}`;
    if(!seen.has(key)){seen.add(key);candidates.push({x,y});}
  }
  candidates.sort((a,b)=>{
    const distance=(a.x-point.x)**2+(a.y-point.y)**2-((b.x-point.x)**2+(b.y-point.y)**2);
    return distance||a.y-b.y||a.x-b.x;
  });
  const placement=candidates.find(({x,y})=>fits(x,y));
  return placement?{...placement,width,height}:null;
}
