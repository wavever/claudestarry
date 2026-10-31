import {defaultConfigForLocale,loadConfig,localizeDefaultSlogan,easeValue} from './config.js';
import {EntryClock} from './entry-clock.js';
import {sampleSlogan} from './text-layout.js';
import {seededRandom} from './model.js';
import {applyDocumentLocale,localeSearchWithSelection,normalizeLocale,persistLocale,resolveLocale,safeStorage} from './i18n.js';

const browserStorage=safeStorage(()=>localStorage);
let locale=resolveLocale({search:location.search,storage:browserStorage,languages:navigator.languages});
applyDocumentLocale(locale);
let config=defaultConfigForLocale(locale);
try{config=loadConfig(browserStorage,defaultConfigForLocale(locale));config.slogan=localizeDefaultSlogan(config.slogan,locale);}catch{}
const canvas=document.createElement('canvas');canvas.id='entry-particles';
canvas.setAttribute('aria-label',config.slogan);canvas.style.cssText='position:fixed;inset:0;width:100%;height:100%;z-index:2;background:#020202;pointer-events:none';
document.querySelector('#universe').append(canvas);
const ctx=canvas.getContext('2d');

// 8 颗精巧雅致的流星，在 Slogan 浮现与驻留期间自然交错掠过，不喧宾夺主，空灵纯粹
const METEORS = [
  // 1. 开场左上角微弱流星，若隐若现的宁静序曲
  { start: 0.22, dur: 0.65, x: 0.08, y: 0.10, angle: 0.17 * Math.PI, travel: 0.22, tail: 48, width: 1.15, alpha: 0.48 },
  // 2. 右上方掠过的高空细长流星
  { start: 0.68, dur: 0.78, x: 0.68, y: 0.06, angle: 0.19 * Math.PI, travel: 0.26, tail: 68, width: 1.30, alpha: 0.58 },
  // 3. 左侧中景划过的短促微流星
  { start: 1.15, dur: 0.52, x: 0.04, y: 0.32, angle: 0.16 * Math.PI, travel: 0.18, tail: 42, width: 1.00, alpha: 0.44 },
  // 4. 第二句诗句亮起时，正上方静谧滑落的一道轻芒
  { start: 1.58, dur: 0.74, x: 0.38, y: 0.08, angle: 0.18 * Math.PI, travel: 0.24, tail: 62, width: 1.25, alpha: 0.54 },
  // 5. 右下方深空余晖中的细微星芒
  { start: 2.02, dur: 0.68, x: 0.72, y: 0.68, angle: 0.19 * Math.PI, travel: 0.20, tail: 50, width: 1.10, alpha: 0.48 },
  // 6. 诗句完全凝合时，中高空划过的一抹温润银丝
  { start: 2.45, dur: 0.72, x: 0.52, y: 0.14, angle: 0.17 * Math.PI, travel: 0.23, tail: 58, width: 1.20, alpha: 0.52 },
  // 7. 左下角静谧游走的光痕
  { start: 2.88, dur: 0.58, x: 0.12, y: 0.75, angle: 0.18 * Math.PI, travel: 0.19, tail: 44, width: 1.05, alpha: 0.46 },
  // 8. 临近星海交接时，右上方划过的远空微光
  { start: 3.25, dur: 0.70, x: 0.62, y: 0.18, angle: 0.20 * Math.PI, travel: 0.22, tail: 54, width: 1.15, alpha: 0.50 },
];

let points=[],thresholds=[],bgStars=[],particleMeta=[],frame=0,finished=false,resolved=false,loadingMain=false;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const clock=new EntryClock(config);
let resolveReady;const ready=new Promise(resolve=>{resolveReady=resolve;});

function initBgStars(w, h){
  const count=w<700?65:110;
  const rand=seededRandom(4291);
  bgStars=[];
  for(let i=0;i<count;i++){
    const x=rand()*w;
    const y=rand()*h;
    const tier=rand();
    let r,baseAlpha,isGem=false;
    if(tier<0.75){
      // 远景微尘星光（微弱而深邃）
      r=0.35+rand()*0.35;
      baseAlpha=0.15+rand()*0.25;
    }else if(tier<0.95){
      // 中景明眸星（清晰温润）
      r=0.70+rand()*0.35;
      baseAlpha=0.35+rand()*0.30;
    }else{
      // 稀疏天际明珠（微带柔晕）
      r=1.05+rand()*0.30;
      baseAlpha=0.55+rand()*0.30;
      isGem=true;
    }
    const speed=1.0+rand()*2.4;
    const phase=rand()*Math.PI*2;
    const hue=rand();
    let color;
    if(hue<0.16){
      color='218, 232, 252'; // 远空微蓝点缀
    }else if(hue<0.36){
      color='206, 109, 77';  // Claude #ce6d4d 主题色微光
    }else if(hue<0.68){
      color='238, 172, 144'; // 偏向 Claude 主题色的温润陶土星光
    }else{
      color='255, 248, 238'; // 柔和象牙白
    }
    bgStars.push({x,y,r,baseAlpha,speed,phase,color,isGem});
  }
}

function size(){
  const dpr=Math.min(window.devicePixelRatio||1,2);
  canvas.width=innerWidth*dpr;canvas.height=innerHeight*dpr;
  canvas.style.width='100%';canvas.style.height='100%';
  ctx.setTransform(dpr,0,0,dpr,0,0);
  points=sampleSlogan(config,innerWidth,innerHeight);
  const count=innerWidth<700?16000:34000;
  thresholds=[];
  particleMeta=[];
  for(let i=0;i<points.length;i++){
    const seed1=(count+i)*61+913;
    const r1=seededRandom(seed1)();
    // 随机启辉时刻：在开场 0.0 ~ 0.58 之间随机分散开始亮起
    const start=r1*0.58;
    // 随机渐变速率：每个粒子用 0.20 ~ 0.38 的时长逐渐变亮，非统一速率
    const seed2=(count+i)*137+2029;
    const r2=seededRandom(seed2)();
    const span=0.20+r2*0.18;

    const hue=r2;
    const color=hue<0.16?'228, 240, 255':(hue<0.84?'252, 248, 242':'255, 244, 224');
    const speed=1.0+r1*2.4;
    const phase=r1*Math.PI*2;
    thresholds.push({start,span});
    particleMeta.push({color,speed,phase});
  }

  initBgStars(innerWidth,innerHeight);
}

function finish(){
  if(!resolved){resolved=true;resolveReady?.();}
  if(finished)return;
  finished=true;performance.mark('afterlight-entry-handoff');cancelAnimationFrame(frame);removeEventListener('resize',size);document.removeEventListener('visibilitychange',pause);
  canvas.style.transition='opacity 0.45s ease-out';
  canvas.style.opacity='0';
  setTimeout(()=>{
    canvas.remove();canvas.width=canvas.height=1;points=[];thresholds=[];bgStars=[];particleMeta=[];
  },500);
}

function pause(){clock.pause();}
function setLocale(nextLocale){
  const normalized=normalizeLocale(nextLocale);
  if(!normalized)return locale;
  locale=normalized;
  config.slogan=localizeDefaultSlogan(config.slogan,locale);
  applyDocumentLocale(locale);
  canvas.setAttribute('aria-label',config.slogan);
  if(!finished)size();
  return locale;
}
function syncLocaleControls(){
  document.querySelectorAll('[data-locale]').forEach(button=>{
    button.setAttribute('aria-pressed',String(button.dataset.locale===locale));
  });
}
function syncLocaleSearch(nextLocale){
  try{
    const nextSearch=localeSearchWithSelection(location.search,nextLocale);
    if(nextSearch!==location.search)history.replaceState(history.state,'',`${location.pathname}${nextSearch}${location.hash}`);
  }catch{}
}
document.querySelectorAll('[data-locale]').forEach(button=>{
  button.addEventListener('click',()=>{
    const selected=setLocale(button.dataset.locale);
    persistLocale(browserStorage,selected);
    syncLocaleSearch(selected);
    syncLocaleControls();
    dispatchEvent(new CustomEvent('afterlight:localechange',{detail:{locale:selected}}));
  });
});
syncLocaleControls();
const boot={ready,finish,config,elapsed:0,get locale(){return locale;},setLocale};window.__afterlightEntryBoot=boot;
addEventListener('resize',size);document.addEventListener('visibilitychange',pause);size();

function draw(now){
  if(finished)return;
  if(document.hidden){clock.pause();frame=requestAnimationFrame(draw);return;}
  const elapsed=clock.frame(now);boot.elapsed=elapsed;
  const isSloganFreeze=config.animationMode==='slogan-freeze';
  const progress=reduced||isSloganFreeze?1:easeValue(config.lightEase,elapsed/config.lightDuration);
  const reveal=.025+.975*progress;

  // 0. 深邃星空背景与天体微弱晕影
  ctx.fillStyle='#020202';ctx.fillRect(0,0,innerWidth,innerHeight);
  const vig=ctx.createRadialGradient(innerWidth*0.5,innerHeight*0.5,innerWidth*0.12,innerWidth*0.5,innerHeight*0.5,innerWidth*0.68);
  vig.addColorStop(0,'rgba(9, 14, 24, 0.42)');
  vig.addColorStop(1,'rgba(2, 2, 2, 0)');
  ctx.fillStyle=vig;ctx.fillRect(0,0,innerWidth,innerHeight);

  // 1. 零星闪烁的背景星光（多层景深与呼吸）
  for(let i=0;i<bgStars.length;i++){
    const s=bgStars[i];
    const twinkle=0.35+0.65*Math.sin(now*0.0018*s.speed+s.phase);
    const a=(s.baseAlpha*twinkle).toFixed(3);
    ctx.fillStyle=`rgba(${s.color},${a})`;
    ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fill();
    if(s.isGem&&twinkle>0.7){
      const halo=ctx.createRadialGradient(s.x,s.y,0,s.x,s.y,2.4);
      halo.addColorStop(0,`rgba(${s.color},${(a*0.35).toFixed(3)})`);
      halo.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=halo;ctx.beginPath();ctx.arc(s.x,s.y,2.4,0,Math.PI*2);ctx.fill();
    }
  }

  // 2. 纤细优雅、掠过天际的多颗流星
  if(!reduced){
    const diag=Math.hypot(innerWidth,innerHeight);
    ctx.save();
    ctx.globalCompositeOperation='lighter';
    for(let mIdx=0;mIdx<METEORS.length;mIdx++){
      const m=METEORS[mIdx];
      const mt=(elapsed-m.start)/m.dur;
      if(mt<=0||mt>=1)continue;

      const progress=Math.min(1,Math.max(0,mt));
      const env=Math.sin(progress*Math.PI);
      const alpha=m.alpha*Math.pow(env,1.2);
      const travelDist=diag*m.travel;
      const easeTravel=Math.pow(progress,0.88);

      const x0=innerWidth*m.x;
      const y0=innerHeight*m.y;
      const hx=x0+Math.cos(m.angle)*travelDist*easeTravel;
      const hy=y0+Math.sin(m.angle)*travelDist*easeTravel;
      const tailLen=m.tail*(0.4+0.6*env);
      const tx=hx-Math.cos(m.angle)*tailLen;
      const ty=hy-Math.sin(m.angle)*tailLen;

      // 纤细柔和离子尾羽（线宽 ~0.9-1.3px，温润不刺眼，尾部微泛 Claude 陶土温光）
      const tailGrad=ctx.createLinearGradient(hx,hy,tx,ty);
      tailGrad.addColorStop(0,`rgba(255, 252, 248, ${alpha.toFixed(3)})`);
      tailGrad.addColorStop(0.12,`rgba(250, 232, 216, ${(alpha*0.75).toFixed(3)})`);
      tailGrad.addColorStop(0.50,`rgba(214, 138, 108, ${(alpha*0.28).toFixed(3)})`);
      tailGrad.addColorStop(1,'rgba(180, 92, 60, 0)');

      ctx.strokeStyle=tailGrad;
      ctx.lineWidth=m.width*Math.max(0.85,alpha);
      ctx.lineCap='round';
      ctx.beginPath();ctx.moveTo(tx,ty);ctx.lineTo(hx,hy);ctx.stroke();

      // 微小电离前锋柔光（半径 2.4px，纯粹细腻）
      const glow=ctx.createRadialGradient(hx,hy,0,hx,hy,2.4);
      glow.addColorStop(0,`rgba(255, 255, 255, ${(alpha*0.92).toFixed(3)})`);
      glow.addColorStop(0.4,`rgba(255, 242, 220, ${(alpha*0.50).toFixed(3)})`);
      glow.addColorStop(1,'rgba(230, 200, 160, 0)');
      ctx.fillStyle=glow;
      ctx.beginPath();ctx.arc(hx,hy,2.4,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  }

  // 3. Slogan 星尘粒子（均一纯粹的星芒，大小一致，不额外发光漫射）
  ctx.save();
  ctx.globalCompositeOperation='lighter';
  const radius=Math.max(0.95,config.textParticleSize*0.88);
  for(let i=0;i<points.length;i++){
    const {start,span}=thresholds[i];
    const t=Math.max(0,Math.min(1,(reveal-start)/span));
    if(!t)continue;
    const meta=particleMeta[i]||{color:'252, 248, 242',speed:2,phase:0};
    const revealAlpha=t*t*(3-2*t);
    const shimmer=0.88+0.12*Math.sin(now*0.0028*meta.speed+meta.phase);
    const finalAlpha=revealAlpha*shimmer;
    const [x,y]=points[i];
    ctx.fillStyle=`rgba(${meta.color},${finalAlpha.toFixed(3)})`;
    ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fill();
  }
  ctx.restore();

  clock.presented(now);
  if(!loadingMain)performance.mark('afterlight-entry-first-frame');
  if(!loadingMain){
    loadingMain=true;
    // Yield a paint before downloading/evaluating the full Three.js application.
    setTimeout(()=>import('./main.js').catch(error=>{
      console.error(error);finish();const warning=document.querySelector('#webgl-error');if(warning)warning.hidden=false;
    }),0);
  }
  if(!resolved&&(reduced||isSloganFreeze||config.animationMode==='nebula-freeze'||elapsed>=config.lightDuration+config.textHold)){
    resolved=true;resolveReady();
  }
  frame=requestAnimationFrame(draw);
}
frame=requestAnimationFrame(draw);
