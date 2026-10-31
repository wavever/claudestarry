// Stable spatial distribution shared by historical light and individual accounts.
// A compact core and twelve tapered streams reveal Claude through stellar density.
const RAYS = [
  [-1,.02,18],[-.80,.58,16],[-.43,.90,19],[.12,.99,18],
  [.64,.76,18],[.97,.23,19],[.99,-.15,18],[.76,-.65,16],
  [.48,-.88,17],[-.08,-1,19],[-.62,-.79,18],[-.87,-.49,17]
];
export function claudeLogoPosition(seed) {
  const r=()=>{let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};
  const gaussian=()=>Math.sqrt(-2*Math.log(Math.max(.000001,r())))*Math.cos(6.2831853*r());
  let x,y;
  const region=r();
  if(region<.20){
    x=gaussian()*2.4;y=gaussian()*2.5;
  }else if(region<.96){
    const [dx,dy,length]=RAYS[Math.floor(r()*RAYS.length)];
    const norm=Math.hypot(dx,dy),ux=dx/norm,uy=dy/norm;
    const t=.8+Math.pow(r(),.78)*(length-.8);
    const taper=Math.pow(Math.max(0,1-t/length),.35);
    const width=(.48+t*.026)*(.35+.65*taper);
    const across=gaussian()*width+Math.sin(t*.45+dx*9)*.16;
    x=ux*t-uy*across+gaussian()*.18;
    y=uy*t+ux*across+gaussian()*.18;
  }else{
    x=gaussian()*9;y=gaussian()*9;
  }
  return [x,y,gaussian()*(.38+Math.hypot(x,y)*.018)];
}

// The settled sky restores the broader, overlapping streams of the nebula.
export function claudePosition(seed) {
  const r=()=>{let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};
  const gaussian=()=>Math.sqrt(-2*Math.log(Math.max(.000001,r())))*Math.cos(6.2831853*r());
  let x,y;
  const region=r();
  if(region<.37){
    x=gaussian()*4.3;y=gaussian()*4.6;
  }else if(region<.96){
    const [dx,dy,length]=RAYS[Math.floor(r()*RAYS.length)];
    const norm=Math.hypot(dx,dy),ux=dx/norm,uy=dy/norm;
    const t=2+Math.pow(r(),.82)*(length-2);
    const width=.75+t*.045;
    const across=gaussian()*width+Math.sin(t*.65+dx*9)*.45;
    x=ux*t-uy*across+gaussian()*.55;
    y=uy*t+ux*across+gaussian()*.55;
  }else{
    x=gaussian()*9;y=gaussian()*9;
  }
  return [x,y,gaussian()*(.6+Math.hypot(x,y)*.025)];
}
