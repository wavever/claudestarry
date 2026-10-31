import * as THREE from 'three';
import {EntryClock} from './entry-clock.js';
import {sampleSlogan} from './text-layout.js';
import {DEFAULT_CONFIG,normalizeConfig,easeValue,entryProgress} from './config.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { claudeLogoPosition } from './claude-field.js';
import { accountStarSizeScale, dateToDay, HALF_LIFE, MIN_LIGHT, seededRandom, galaxyPosition, hashId, starProfile } from './model.js';

const ACCOUNT_REVEAL_DURATION = 1.2;
const STAR_PICK_MIN_LIGHT = .08;
export const ACCOUNT_STAR_MIN_CSS_DIAMETER = 5.5;
export const ACCOUNT_STAR_MAX_CSS_DIAMETER = 9;
const ACCOUNT_STAR_MIN_DEPTH_FACTOR = .88;
const ACCOUNT_STAR_MAX_DEPTH_FACTOR = 1.12;
const ACCOUNT_STAR_SIZE_BREATH = .035;
const ACCOUNT_STAR_TWINKLE_SPEED_MIN = .55;
const ACCOUNT_STAR_TWINKLE_SPEED_RANGE = 1.05;

// GLSL ES does not implicitly promote an integer literal for float-only
// overloads such as clamp(). Template interpolation turns JavaScript's `9`
// into `9`, so normalize every injected shader number to a float literal.
export function glslFloatLiteral(value) {
  if (!Number.isFinite(value)) throw new TypeError('GLSL float literal must be finite');
  const literal = String(value);
  return /[.e]/i.test(literal) ? literal : `${literal}.0`;
}

// gl_PointSize is measured in framebuffer pixels. Keep the public range in
// CSS pixels, then scale it by Three's renderer pixel ratio in the shader.
// The clipped point-sprite disc is the measured diameter; its inner glow is
// intentionally a brightness gradient inside that disc, not extra geometry.
export function accountStarCssDiameter(scale, depth, referenceDepth, twinkle = 0, motion = 1) {
  const normalizedScale = Math.min(1, Math.max(0, Number.isFinite(scale) ? scale : 0));
  const safeDepth = Math.max(.01, Number.isFinite(depth) ? depth : .01);
  const safeReferenceDepth = Math.max(.01, Number.isFinite(referenceDepth) ? referenceDepth : safeDepth);
  const depthFactor = Math.min(ACCOUNT_STAR_MAX_DEPTH_FACTOR, Math.max(ACCOUNT_STAR_MIN_DEPTH_FACTOR, safeReferenceDepth / safeDepth));
  const safeTwinkle = Math.min(1, Math.max(-1, Number.isFinite(twinkle) ? twinkle : 0));
  const safeMotion = Math.min(1, Math.max(0, Number.isFinite(motion) ? motion : 0));
  const pulse = 1 + safeTwinkle * ACCOUNT_STAR_SIZE_BREATH * safeMotion;
  return Math.min(ACCOUNT_STAR_MAX_CSS_DIAMETER, Math.max(ACCOUNT_STAR_MIN_CSS_DIAMETER,
    (ACCOUNT_STAR_MIN_CSS_DIAMETER + normalizedScale * (ACCOUNT_STAR_MAX_CSS_DIAMETER - ACCOUNT_STAR_MIN_CSS_DIAMETER)) * depthFactor * pulse));
}

export function accountStarFramebufferDiameter(cssDiameter, pixelRatio = 1) {
  return cssDiameter * Math.max(.01, Number.isFinite(pixelRatio) ? pixelRatio : 1);
}

const starVertex = `
attribute float aBorn;
attribute float aPeak;
attribute float aHalfLife;
attribute float aVisible;
attribute float aScale;
attribute float aPhase;
attribute float aSpeed;
attribute float aArrival;
attribute float aEntryReveal;
uniform float uDay;
uniform float uTime;
uniform float uDpr;
uniform float uHalfLife;
uniform float uFloor;
uniform float uMotion;
uniform float uTwinkleDecay;
uniform float uAccountReveal;
uniform float uReferenceDepth;
varying float vLight;
varying float vScale;
varying float vPulse;
varying float vNearFade;
void main() {
  // Meteor landings bypass the entry fade; initial stars wait for the nebula.
  vLight = aVisible * mix(1.0, uAccountReveal, aEntryReveal);
  vScale = aScale;

  // Two incommensurate waves make each stable ID breathe independently.
  float tw = sin(uTime * aSpeed + aPhase) * 0.62 + sin(uTime * (aSpeed * 1.618 + 0.17) + aPhase * 1.73) * 0.38;
  float amplitude = 0.18 * uMotion;
  vPulse = 1.0 + tw * amplitude;

  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float depth = max(-mv.z, .01);
  vNearFade = smoothstep(.012, .10, depth);
  gl_Position = projectionMatrix * mv;

  // Preserve a little relative-depth parallax without letting zoom or DPR
  // break the required 5.5px–9px CSS visual diameter.
  float depthFactor = clamp(uReferenceDepth / depth, ${glslFloatLiteral(ACCOUNT_STAR_MIN_DEPTH_FACTOR)}, ${glslFloatLiteral(ACCOUNT_STAR_MAX_DEPTH_FACTOR)});
  float sizePulse = 1.0 + clamp(tw, -1.0, 1.0) * ${glslFloatLiteral(ACCOUNT_STAR_SIZE_BREATH)} * uMotion;
  float cssDiameter = clamp((${glslFloatLiteral(ACCOUNT_STAR_MIN_CSS_DIAMETER)} + clamp(aScale, 0.0, 1.0) * ${glslFloatLiteral(ACCOUNT_STAR_MAX_CSS_DIAMETER - ACCOUNT_STAR_MIN_CSS_DIAMETER)}) * depthFactor * sizePulse, ${glslFloatLiteral(ACCOUNT_STAR_MIN_CSS_DIAMETER)}, ${glslFloatLiteral(ACCOUNT_STAR_MAX_CSS_DIAMETER)});
  gl_PointSize = cssDiameter * uDpr;
}`;
const starFragment = `
varying float vLight;
varying float vScale;
varying float vPulse;
varying float vNearFade;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float r2 = dot(q, q);
  if(r2 > 0.25 || vLight <= 0.001) discard;

  // 保持与其他粒子一致的自然圆形分布与微弱发光
  float core = exp(-r2 * 55.0);
  float faintGlow = 0.08 * exp(-r2 * 10.0);
  float glow = core + faintGlow;

  // 纯净高亮恒星暖白
  vec3 starColor = mix(vec3(0.96, 0.95, 0.92), vec3(1.0, 1.0, 1.0), core);

  // The entry reveal fades light rather than only toggling visibility.
  float intensity = glow * vPulse * vNearFade * (1.10 + vScale * 0.25);
  gl_FragColor = vec4(starColor * intensity * vLight, vLight);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const dustVertex = `
uniform float uFormation;
attribute vec3 color;
attribute float aScale;
uniform float uDpr;
varying vec3 vColor;
varying float vNearFade;
void main() {
  vColor=color*(.08+.92*uFormation);
  vec4 mv=modelViewMatrix*vec4(position,1.);
  float depth=max(-mv.z,.01);
  vNearFade=smoothstep(.012,.10,depth);
  gl_Position=projectionMatrix*mv;
  gl_PointSize=clamp((.8+aScale*.55)*uDpr*38.0/depth,.75,4.5);
}`;
const dustFragment = `
varying vec3 vColor;
varying float vNearFade;
void main(){
  vec2 q=gl_PointCoord-.5;
  float r2=dot(q,q);
  if(r2>.25) discard;
  gl_FragColor=vec4(vColor*exp(-r2*25.0)*vNearFade,0.72);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const historyVertex = `
attribute float aLogo;
attribute vec3 aTextPosition;
attribute float aTextVisible;
uniform float uTextMorph;
uniform float uTextReveal;
uniform float uEntryFade;
uniform float uTextParticleSize;
varying float vText;
attribute float aReveal;
uniform float uFormation;
varying float vReveal;
attribute vec3 color;
attribute float aScale;
uniform float uDpr;
varying vec3 vColor;
varying float vScale;
varying float vNearFade;
void main(){
  vColor=color; vScale=aScale;
  vText=aLogo*(1.0-uTextMorph);
  float skyReveal=smoothstep(aReveal*.70,aReveal*.70+.30,uFormation);
  vReveal=mix(skyReveal,1.6*(1.0-uFormation),aLogo);
  if(vReveal<.001){gl_Position=vec4(2.,2.,2.,1.);gl_PointSize=1.;vNearFade=0.;return;}
  vec3 p=position;
  if(aLogo>.5){
    float delay=aReveal*.05;
    float t=clamp((uTextMorph-delay)/(1.0-delay),0.0,1.0);
    p=mix(aTextPosition,position,t);
    p.z+=sin(t*3.14159265)*aReveal*1.2;
  }
  float span=mix(0.20,0.38,aScale);
  float letterLight=smoothstep(aReveal,aReveal+span,uTextReveal);
  vReveal*=uEntryFade*mix(aTextVisible*letterLight,1.0,uTextMorph);
  vec4 mv=modelViewMatrix*vec4(p,1.);
  float depth=max(-mv.z,.01);
  vNearFade=smoothstep(.012,.10,depth);
  gl_Position=projectionMatrix*mv;
  gl_PointSize=mix(clamp((.9+aScale*2.0)*uDpr*46.0/depth,.75,5.5),max(1.8*uDpr,uTextParticleSize*1.5*uDpr),vText);
}`;
const historyFragment = `
varying float vText;varying float vReveal;
varying vec3 vColor;
varying float vScale;
varying float vNearFade;
uniform float uDensity;
void main(){
  vec2 q=gl_PointCoord-.5;
  float r2=dot(q,q);
  if(r2>.25) discard;
  float glow=exp(-r2*55.)+.07*exp(-r2*10.);
  vec3 star=vColor*glow*(.23+vScale*.50)*uDensity;
  vec3 letter=vec3(.95,.93,.89)*(exp(-r2*8.)*1.2);
  gl_FragColor=vec4(mix(star,letter,vText)*vNearFade*vReveal,1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const meteorTrailVertex = `
attribute vec3 color;
attribute float aFade;
uniform float uDpr;
varying vec3 vColor;
varying float vFade;
varying float vNearFade;
void main(){
  vColor=color; vFade=aFade;
  vec4 mv=modelViewMatrix*vec4(position,1.);
  float depth=max(-mv.z,.01);
  vNearFade=smoothstep(.012,.10,depth);
  gl_Position=projectionMatrix*mv;
  gl_PointSize=clamp((1.1+aFade*4.2)*uDpr*52.0/depth,1.0,10.0);
}`;
const meteorTrailFragment = `
uniform float uOpacity;
varying vec3 vColor;
varying float vFade;
varying float vNearFade;
void main(){
  vec2 q=gl_PointCoord-.5;
  float r2=dot(q,q);
  if(r2>.25) discard;
  float glow=exp(-r2*18.0)+.12*exp(-r2*5.0);
  gl_FragColor=vec4(vColor*glow*vFade*vNearFade*uOpacity,1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Universe {
  constructor(container, accounts, {onHover,onSelect,onFrame,onReady,onNebulaReady,onError,config,ariaLabel}) {
    this.config=normalizeConfig(config);
    this.container=container; this.callbacks={onHover,onSelect,onFrame,onReady,onNebulaReady,onError};
    this.nebulaReadyFired=false;
    this.accounts=accounts; this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.accountReveal=this.initialAccountReveal();
    this.renderer=new THREE.WebGLRenderer({antialias:false,alpha:false,powerPreference:'high-performance'});
    this.renderer.setClearColor(0x020202);
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure=1.15;
    // The field is fill-rate bound when viewed close up. One render pixel per CSS
    // pixel keeps its grain while avoiding a second, high-DPR particle workload.
    this.pixelRatio=this.getRenderPixelRatio();
    this.renderer.setPixelRatio(this.pixelRatio);
    const canvas=this.renderer.domElement;
    canvas.setAttribute('aria-label',ariaLabel||'Interactive star field');
    canvas.tabIndex=0;
    container.append(canvas);
    this.scene=new THREE.Scene();
    this.camera=new THREE.PerspectiveCamera(48,1,.005,1600);
    this.home=new THREE.Vector3(0,1.8,innerWidth<700?this.config.mobileHomeDistance:this.config.homeDistance);
    this.camera.position.copy(this.home);
    this.controls=new OrbitControls(this.camera,canvas);
    this.controls.enableDamping=true; this.controls.dampingFactor=.045;
    this.controls.enablePan=false;this.controls.enableZoom=false;
    this.controls.minDistance=.25;this.controls.maxDistance=600;
    this.controls.maxPolarAngle=Math.PI*.81;this.controls.minPolarAngle=.13;
    this.controls.rotateSpeed=.4; this.controls.zoomSpeed=.7;
    this.controls.autoRotate=false;this.controls.autoRotateSpeed=.10;
    this.zoomTarget=this.camera.position.distanceTo(this.controls.target);
    this.group=new THREE.Group();this.group.rotation.z=-.07;this.group.rotation.y=-.05;this.group.rotation.x=.04;this.group.position.x=0;
    this.scene.add(this.group);
    this.uniforms={uDay:{value:dateToDay(new Date().toISOString().slice(0,10))},uTime:{value:0},uDpr:{value:this.renderer.getPixelRatio()},uHalfLife:{value:HALF_LIFE},uFloor:{value:MIN_LIGHT},uMotion:{value:this.reduced?0:1},uFormation:{value:this.reduced?1:0},uTextMorph:{value:this.reduced?1:0},uTextReveal:{value:this.reduced?1:0},uEntryFade:{value:1},uTextParticleSize:{value:this.config.textParticleSize},uTwinkleDecay:{value:this.config.twinkleDecay},uAccountReveal:{value:this.accountReveal},uReferenceDepth:{value:this.home.length()}};
    this.starMaterial=new THREE.ShaderMaterial({uniforms:this.uniforms,vertexShader:starVertex,fragmentShader:starFragment,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
    this.setAccounts(accounts);
    this.addHistory();
    this.addDust();
    this.addCloud();
    this.addDistantDust();
    this.raycaster=new THREE.Raycaster();
    this.mouse=new THREE.Vector2();this.pointerDown=null;this.selected=-1;this.hovered=-1;
    this.entryClock=new EntryClock(this.config);this.entrySkipped=false;
    this.time=0;this.last=performance.now();this.start=this.last;this.loopStartTime=this.last;this.ready=false;this.disposed=false;
    this.focusTween=null;this.introActive=false;
    this.cardView=false;this.cardSide='right';
    this.viewOffset={x:0,y:0};this.viewOffsetTween=null;
    this.resize=()=>this.onResize();
    addEventListener('resize',this.resize);
    this.onResize();
    this.setupPointer();
    this.setupZoom();
    document.addEventListener('visibilitychange',()=>{this.entryClock.pause();this.last=performance.now();});
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.disposed=true;this.callbacks.onError('context');});
    this.renderer.debug.onShaderError=(gl,program,vs,fs)=>{console.error(gl.getProgramInfoLog(program),gl.getShaderInfoLog(vs),gl.getShaderInfoLog(fs));this.disposed=true;this.callbacks.onError('shader');};
    this.animate=this.animate.bind(this);
    this.raf=requestAnimationFrame(this.animate);
  }
  setAriaLabel(label) {
    if (typeof label === 'string' && label) this.renderer?.domElement?.setAttribute('aria-label',label);
  }
  setSlogan(slogan){
    if(typeof slogan!=='string'||!slogan.trim()||this.config.slogan===slogan)return;
    this.config.slogan=slogan;
    // Once the words have morphed away, keep the current camera and geometry.
    if(!this.history||this.uniforms.uTextMorph.value>=1)return;
    const camera=this.camera;
    const previous={fov:camera.fov,aspect:camera.aspect,quaternion:camera.quaternion.clone(),projection:camera.projectionMatrix.clone(),inverse:camera.projectionMatrixInverse.clone()};
    let points;
    try{points=this.sampleEntryText();}
    finally{
      camera.fov=previous.fov;camera.aspect=previous.aspect;camera.quaternion.copy(previous.quaternion);
      camera.projectionMatrix.copy(previous.projection);camera.projectionMatrixInverse.copy(previous.inverse);camera.updateMatrixWorld();
    }
    if(!points?.length)return;
    const geometry=this.history.geometry,positions=geometry.attributes.aTextPosition,visible=geometry.attributes.aTextVisible;
    for(let i=this.historyBaseCount;i<positions.count;i++){
      const n=i-this.historyBaseCount,point=points[n%points.length];
      positions.setXYZ(i,point[0],point[1],point[2]);visible.setX(i,n<points.length?1:0);
    }
    positions.needsUpdate=true;visible.needsUpdate=true;
  }
  initialAccountReveal(){
    const mode=this.config?.animationMode||'full';
    return mode==='nebula-freeze'||(this.reduced&&mode!=='slogan-freeze'&&mode!=='slogan-loop')?1:0;
  }
  controlsReadyForNebula(formation,mode){
    return formation>0||this.entrySkipped||mode==='nebula-freeze';
  }
  entryAccountReveal(entryTime){
    if(this.reduced)return 1;
    const c=this.config;
    const nebulaEnd=c.lightDuration+c.textHold+c.textMorphDuration+c.logoHold+c.nebulaDuration;
    return easeValue('easeOutCubic',(entryTime-nebulaEnd)/ACCOUNT_REVEAL_DURATION);
  }
  loopAccountReveal(cycleElapsed){
    return this.reduced?1:easeValue('easeOutCubic',(cycleElapsed-this.config.nebulaDuration)/ACCOUNT_REVEAL_DURATION);
  }
  setAccountReveal(value){
    const reveal=THREE.MathUtils.clamp(Number.isFinite(value)?value:0,0,1);
    this.accountReveal=reveal;
    if(this.uniforms?.uAccountReveal)this.uniforms.uAccountReveal.value=reveal;
  }
  accountEntryAttribute(){return this.stars?.geometry?.attributes?.aEntryReveal;}
  setAccountEntryReveal(index,value){
    const attribute=this.accountEntryAttribute();
    if(!attribute||index<0||index>=attribute.count)return;
    attribute.setX(index,value);attribute.needsUpdate=true;
  }
  stageAccountsForEntry(){
    const attribute=this.accountEntryAttribute();
    if(!attribute)return;
    for(let index=0;index<attribute.count;index++)attribute.setX(index,1);
    attribute.needsUpdate=true;
  }
  isAccountStarVisible(index){
    const attributes=this.stars?.geometry?.attributes;
    const visible=attributes?.aVisible?.getX(index)??0;
    if(visible<=0)return false;
    const entryReveal=attributes?.aEntryReveal?.getX(index)??0;
    const reveal=entryReveal>0?(this.accountReveal??this.uniforms?.uAccountReveal?.value??0):1;
    return reveal>STAR_PICK_MIN_LIGHT;
  }
  setAccounts(accounts) {
    const arrivalsById=new Map((this.accounts??[]).map((a,i)=>[a.id,this.stars?.geometry.attributes.aArrival?.getX(i)??-10000]));
    const stagedById=new Map((this.accounts??[]).map((a,i)=>[a.id,this.stars?.geometry.attributes.aEntryReveal?.getX(i)??(this.accountReveal<1?1:0)]));
    const activeMeteorId=this.meteor?.id;
    this.accounts=accounts;
    const positions=[],born=[],scales=[],phases=[],speeds=[],peaks=[],halfLives=[],visible=[],arrivals=[],entryReveals=[];
    const todayDay = dateToDay(new Date().toISOString().slice(0, 10));

    accounts.forEach(a=>{
      arrivals.push(arrivalsById.get(a.id)??-10000);
      entryReveals.push(stagedById.get(a.id)??(this.accountReveal<1?1:0));
      peaks.push(1.0);
      halfLives.push(120);
      // Geometry is recreated on every merged record update. Preserve the
      // in-flight meteor's hidden landing star by stable record ID, not index.
      visible.push(a.id===activeMeteorId?0:1);
      positions.push(...a.position);
      born.push(dateToDay(a.date));

      // Online duration wins when supplied; otherwise the disabled date is the
      // available chronology signal. Both routes produce a stable 0–1 size.
      scales.push(accountStarSizeScale(a,todayDay));

      // Stable ID-derived seeds preserve a star's own rhythm across refreshes,
      // realtime merges, and array reordering.
      phases.push(seededRandom(hashId(`${a.id}:twinkle-phase`))()*Math.PI*2);
      speeds.push(ACCOUNT_STAR_TWINKLE_SPEED_MIN + seededRandom(hashId(`${a.id}:twinkle-speed`))()*ACCOUNT_STAR_TWINKLE_SPEED_RANGE);
    });
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    g.setAttribute('aPeak',new THREE.Float32BufferAttribute(peaks,1));
    g.setAttribute('aHalfLife',new THREE.Float32BufferAttribute(halfLives,1));
    g.setAttribute('aVisible',new THREE.Float32BufferAttribute(visible,1));
    g.setAttribute('aBorn',new THREE.Float32BufferAttribute(born,1));
    g.setAttribute('aScale',new THREE.Float32BufferAttribute(scales,1));
    g.setAttribute('aPhase',new THREE.Float32BufferAttribute(phases,1));
    g.setAttribute('aSpeed',new THREE.Float32BufferAttribute(speeds,1));
    g.setAttribute('aArrival',new THREE.Float32BufferAttribute(arrivals,1));
    g.setAttribute('aEntryReveal',new THREE.Float32BufferAttribute(entryReveals,1));
    if(this.stars){this.group.remove(this.stars);this.stars.geometry.dispose();}
    this.stars=new THREE.Points(g,this.starMaterial);this.stars.name='account-stars';this.group.add(this.stars);
    if(this.meteor){
      const index=accounts.findIndex(a=>a.id===this.meteor.id);
      if(index>=0)this.meteor.index=index;
    }
  }
  addDust() {
    const rand=seededRandom(7749),p=[],c=[],sizes=[];
    const claudeTheme=new THREE.Color('#ce6d4d');
    const warm=new THREE.Color('#c68d72'),neutral=new THREE.Color('#a29489');
    // Translucent unresolved stellar haze; it follows the same soft distribution.
    const count=innerWidth<700?3200:6000;
    for(let i=0;i<count;i++){
      const point=galaxyPosition(i*19+521);
      point[0]+=(rand()-.5)*1.7; point[1]+=(rand()-.5)*1.7;
      point[2]-=1.4;
      p.push(...point);
      let col=neutral.clone().lerp(warm,rand()*.55);
      if(rand()<0.20)col.lerp(claudeTheme,0.40);
      const color=col.multiplyScalar(.016+rand()*.018);
      c.push(color.r,color.g,color.b); sizes.push(4+rand()*8);
    }
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('color',new THREE.Float32BufferAttribute(c,3));g.setAttribute('aScale',new THREE.Float32BufferAttribute(sizes,1));
    this.dustMaterial=new THREE.ShaderMaterial({uniforms:{uDpr:this.uniforms.uDpr,uFormation:this.uniforms.uFormation},vertexShader:dustVertex,fragmentShader:dustFragment,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
    this.group.add(new THREE.Points(g,this.dustMaterial));
  }
  addCloud(){
    const material=new THREE.ShaderMaterial({uniforms:{uTime:this.uniforms.uTime},vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`
    varying vec2 vUv;uniform float uTime;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
    float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*noise(p);p=mat2(.8,-.6,.6,.8)*p*2.04+13.7;a*=.5;}return v;}
    float ray(vec2 p,vec2 d,float len){d=normalize(d);float t=dot(p,d),w=1.4+max(t,0.)*.065;return exp(-pow(dot(p,vec2(-d.y,d.x))/w,2.)*.5)*smoothstep(-1.,4.,t)*(1.-smoothstep(len-4.,len+2.,t));}
    void main(){vec2 p=(vUv-.5)*60.;float r=length(p);float shape=exp(-r*r/80.)*.75;
    shape+=ray(p,vec2(-1,.02),18.);shape+=ray(p,vec2(-.8,.58),16.);shape+=ray(p,vec2(-.43,.90),19.);shape+=ray(p,vec2(.12,.99),18.);shape+=ray(p,vec2(.64,.76),18.);shape+=ray(p,vec2(.97,.23),19.);shape+=ray(p,vec2(.99,-.15),18.);shape+=ray(p,vec2(.76,-.65),16.);shape+=ray(p,vec2(.48,-.88),17.);shape+=ray(p,vec2(-.08,-1),19.);shape+=ray(p,vec2(-.62,-.79),18.);shape+=ray(p,vec2(-.87,-.49),17.);
    float n=fbm(p*.33+vec2(uTime*.0008,0.));float detail=fbm(p*.95+n*2.);float lanes=.35+.65*smoothstep(.24,.68,fbm(p*.6+vec2(n*3.)));
    float density=min(shape,.95)*pow(n,1.8)*(.25+detail)*lanes*(1.-smoothstep(20.,29.,r));
    vec3 color=mix(vec3(.22,.22,.24),vec3(.52,.34,.24),n);gl_FragColor=vec4(color*density*.38,1.);
    }`,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide});
    // Bake static cloud detail once; camera motion should not rerun layered noise
    // over every screen pixel on every frame.
    const cloud=new THREE.Mesh(new THREE.PlaneGeometry(60,60),material);
    const bakeScene=new THREE.Scene();bakeScene.add(cloud);
    const bakeCamera=new THREE.OrthographicCamera(-30,30,30,-30,.1,10);bakeCamera.position.z=2;
    this.cloudTarget=new THREE.WebGLRenderTarget(768,768,{type:THREE.HalfFloatType,depthBuffer:false});
    const previousTarget=this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.cloudTarget);this.renderer.render(bakeScene,bakeCamera);this.renderer.setRenderTarget(previousTarget);
    cloud.material=new THREE.MeshBasicMaterial({map:this.cloudTarget.texture,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide});
    material.dispose();cloud.position.z=-1.8;cloud.material.opacity=this.reduced?1:.08;this.cloud=cloud;this.group.add(cloud);
  }
  applyConfig(input,{replay=true}={}){
    this.config=normalizeConfig(input);
    this.uniforms.uTextParticleSize.value=this.config.textParticleSize;
    this.uniforms.uTwinkleDecay.value=this.config.twinkleDecay;
    this.home.set(0,1.8,this.width<700?this.config.mobileHomeDistance:this.config.homeDistance);
    this.camera.position.copy(this.home);this.controls.target.set(0,0,0);this.setCardView(false,'right',{immediate:true});this.controls.update();
    const previous=this.history;
    this.addHistory();
    this.group.remove(previous);previous.geometry.dispose();previous.material.dispose();
    if(replay)this.replayEntry();
  }
  replayEntry(){
    if(this.meteor){
      const m=this.meteor;
      this.stars.geometry.attributes.aVisible.setX(m.index,1);this.stars.geometry.attributes.aVisible.needsUpdate=true;
      this.group.remove(m.head,m.trail);m.head.material.map.dispose();m.head.material.dispose();m.trail.geometry.dispose();m.trail.material.dispose();this.meteor=null;
    }
    this.entryClock=new EntryClock(this.config);this.entrySkipped=false;this.focusTween=null;this.introActive=false;
    this.nebulaReadyFired=false;
    this.loopStartTime=performance.now();
    this.camera.position.copy(this.home);this.controls.target.set(0,0,0);this.setCardView(false,'right',{immediate:true});this.controls.update();this.syncZoomTarget();
    this.history.geometry.setDrawRange(0,Infinity);
    const mode=this.config.animationMode||'full';
    this.stageAccountsForEntry();
    this.setAccountReveal(this.initialAccountReveal());
    if(mode==='slogan-freeze'){
      this.uniforms.uFormation.value=0;
      this.uniforms.uTextMorph.value=0;
      this.uniforms.uTextReveal.value=1;
      this.uniforms.uEntryFade.value=1;
      if(this.cloud)this.cloud.material.opacity=0;
    }else if(mode==='nebula-freeze'){
      this.uniforms.uFormation.value=1;
      this.uniforms.uTextMorph.value=1;
      this.uniforms.uTextReveal.value=1;
      this.uniforms.uEntryFade.value=1;
      if(this.cloud)this.cloud.material.opacity=1;
    }else{
      this.uniforms.uFormation.value=this.reduced?1:0;
      this.uniforms.uTextMorph.value=this.reduced?1:0;
      this.uniforms.uTextReveal.value=this.reduced?1:0;
      this.uniforms.uEntryFade.value=1;
    }
  }
  sampleEntryText(){
    const mobile=innerWidth<700;
    const camera=this.camera;camera.aspect=innerWidth/innerHeight;camera.fov=mobile?62:48;camera.updateProjectionMatrix();camera.lookAt(0,0,0);camera.updateMatrixWorld();this.group.updateMatrixWorld(true);
    return sampleSlogan(this.config,innerWidth,innerHeight).map(([x,y])=>{
      const ray=new THREE.Vector3(x/innerWidth*2-1,1-y/innerHeight*2,.5).unproject(camera).sub(camera.position).normalize();
      const point=camera.position.clone().addScaledVector(ray,-camera.position.z/ray.z);
      this.group.worldToLocal(point);return point.toArray();
    });
  }
  finishEntry(){this.entrySkipped=true;}
  addHistory() {
    const count=innerWidth<700?16000:34000,rand=seededRandom(11402026);
    const textPoints=this.sampleEntryText();
    const total=count+Math.max(Math.floor(count*.5),textPoints.length);
    const positions=new Float32Array(total*3),colors=new Float32Array(total*3),scales=new Float32Array(total),layers=new Float32Array(total),reveals=new Float32Array(total),textPositions=new Float32Array(total*3),textVisible=new Float32Array(total);
    const claudeTheme=new THREE.Color('#ce6d4d');
    const claudeTint=new THREE.Color('#d88d6c');
    const warm=new THREE.Color('#d2b69e');
    const neutral=new THREE.Color('#aca49c');
    for(let i=0;i<total;i++){
      const isLogo=i>=count;
      const seed=(isLogo?i-count:i)*31+1947;
      const p=isLogo?claudeLogoPosition(seed):galaxyPosition(seed);
      layers[i]=isLogo?1:0;
      textVisible[i]=!isLogo||i-count<textPoints.length?1:0;
      if(isLogo){
        const tIdx=(i-count)%textPoints.length;
        textPositions.set(textPoints[tIdx],i*3);
        reveals[i]=seededRandom(i*61+913)()*0.58;
      }else{
        reveals[i]=seededRandom(i*61+913)()*.92;
      }
      const dist=Math.hypot(p[0],p[1]);
      const coreFactor=Math.exp(-dist*.12);
      const rColor=seededRandom(i*71+433)();
      let base=neutral.clone().lerp(warm,coreFactor);
      if(rColor<0.16){
        base.lerp(claudeTheme,0.68);
      }else if(rColor<0.52){
        base.lerp(claudeTint,0.32);
      }
      const c=base.multiplyScalar(.45+rand()*.5);
      colors.set([c.r,c.g,c.b],i*3);
      p[0]+=(rand()-.5)*.25;p[1]+=(rand()-.5)*.25;
      positions.set(p,i*3);
      scales[i]=Math.pow(rand(),3);
    }
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.BufferAttribute(positions,3));
    g.setAttribute('color',new THREE.BufferAttribute(colors,3));
    g.setAttribute('aScale',new THREE.BufferAttribute(scales,1));
    g.setAttribute('aLogo',new THREE.BufferAttribute(layers,1));
    g.setAttribute('aTextPosition',new THREE.BufferAttribute(textPositions,3));
    g.setAttribute('aTextVisible',new THREE.BufferAttribute(textVisible,1));
    g.setAttribute('aReveal',new THREE.BufferAttribute(reveals,1));
    this.historyMaterial=new THREE.ShaderMaterial({
      uniforms:{uDpr:this.uniforms.uDpr,uDensity:{value:57000/count},uFormation:this.uniforms.uFormation,uTextMorph:this.uniforms.uTextMorph,uTextReveal:this.uniforms.uTextReveal,uEntryFade:this.uniforms.uEntryFade,uTextParticleSize:this.uniforms.uTextParticleSize},
      vertexShader:historyVertex,fragmentShader:historyFragment,
      transparent:true,depthWrite:false,blending:THREE.AdditiveBlending
    });
    this.history=new THREE.Points(g,this.historyMaterial);
    this.history.name='historical-aggregate-11.4-million';
    this.history.frustumCulled=false;
    this.historyBaseCount=count;
    this.group.add(this.history);
  }
  projectHistory(){
    const p=new THREE.Vector3(3,0,3);this.group.localToWorld(p);p.project(this.camera);
    return {x:(p.x+1)*this.width/2,y:(1-p.y)*this.height/2,visible:p.z>-1&&p.z<1&&Math.abs(p.x)<1&&Math.abs(p.y)<1};
  }
  getRenderPixelRatio(){
    return Math.min(window.devicePixelRatio||1,1);
  }
  syncStarReferenceDepth(){
    const target=this.controls?.target;
    const depth=target?this.camera?.position?.distanceTo(target):NaN;
    if(Number.isFinite(depth)&&depth>.01&&this.uniforms?.uReferenceDepth)this.uniforms.uReferenceDepth.value=depth;
  }
  addDistantDust() {
    const r=seededRandom(81),p=[];
    for(let i=0;i<380;i++){
      const theta=r()*Math.PI*2,phi=Math.acos(r()*2-1),radius=95+r()*65;
      p.push(radius*Math.sin(phi)*Math.cos(theta),radius*Math.cos(phi),radius*Math.sin(phi)*Math.sin(theta));
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
    this.scene.add(new THREE.Points(g,new THREE.PointsMaterial({size:.085,color:0xc2aba0,transparent:true,opacity:.5,depthWrite:false,sizeAttenuation:true})));
  }
  setupPointer() {
    const canvas=this.renderer.domElement;
    this.controls.addEventListener('start',()=>{this.finishEntry();this.introActive=false;this.focusTween=null;this.syncZoomTarget();this.callbacks.onHover(null);});
    canvas.addEventListener('pointerdown',e=>{this.pointerDown={x:e.clientX,y:e.clientY};});
    canvas.addEventListener('pointerup',e=>{
      if(this.pointerDown&&Math.hypot(e.clientX-this.pointerDown.x,e.clientY-this.pointerDown.y)<6){
        const hit=this.pick(e.clientX,e.clientY);
        if(hit!==null)this.callbacks.onSelect(hit);
        else this.callbacks.onSelect(null);
      }
      this.pointerDown=null;
    });
    let lastPick=0;
    canvas.addEventListener('pointermove',e=>{
      if(e.buttons||e.pointerType==='touch'||performance.now()-lastPick<50)return;
      lastPick=performance.now();const hit=this.pick(e.clientX,e.clientY);this.hovered=hit??-1;
      canvas.style.cursor=hit===null?'grab':'pointer';
      this.callbacks.onHover(hit===null?null:{index:hit,x:e.clientX,y:e.clientY});
    });
    canvas.addEventListener('pointerleave',()=>{this.hovered=-1;this.callbacks.onHover(null);});
    canvas.addEventListener('keydown',e=>{
      if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){
        e.preventDefault();this.introActive=false;
        const v=this.camera.position.clone().sub(this.controls.target);
        const spherical=new THREE.Spherical().setFromVector3(v);
        if(e.key==='ArrowLeft')spherical.theta-=.08;
        if(e.key==='ArrowRight')spherical.theta+=.08;
        if(e.key==='ArrowUp')spherical.phi=Math.max(.2,spherical.phi-.08);
        if(e.key==='ArrowDown')spherical.phi=Math.min(Math.PI*.8,spherical.phi+.08);
        this.camera.position.copy(new THREE.Vector3().setFromSpherical(spherical).add(this.controls.target));
      }
    });
  }
  setupZoom() {
    const canvas=this.renderer.domElement;
    this.touchPoints=new Map();
    this.pinchDistance=0;
    this.onWheel=e=>{
      if(e.cancelable)e.preventDefault();
      const unit=e.deltaMode===1?16:e.deltaMode===2?this.height:1;
      this.zoom(Math.exp(e.deltaY*unit*.0012));
    };
    this.onTouchPointerDown=e=>{
      if(e.pointerType!=='touch')return;
      this.touchPoints.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(this.touchPoints.size===2)this.pinchDistance=this.getPinchDistance();
    };
    this.onTouchPointerMove=e=>{
      if(e.pointerType!=='touch'||!this.touchPoints.has(e.pointerId))return;
      this.touchPoints.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(this.touchPoints.size!==2)return;
      const distance=this.getPinchDistance();
      if(this.pinchDistance>0&&distance>0)this.zoom(this.pinchDistance/distance);
      this.pinchDistance=distance;
    };
    this.onTouchPointerEnd=e=>{
      if(e.pointerType!=='touch')return;
      this.touchPoints.delete(e.pointerId);
      this.pinchDistance=this.touchPoints.size===2?this.getPinchDistance():0;
    };
    canvas.addEventListener('wheel',this.onWheel,{passive:false});
    canvas.addEventListener('pointerdown',this.onTouchPointerDown);
    canvas.addEventListener('pointermove',this.onTouchPointerMove);
    canvas.addEventListener('pointerup',this.onTouchPointerEnd);
    canvas.addEventListener('pointercancel',this.onTouchPointerEnd);
  }
  getPinchDistance(){
    const points=[...this.touchPoints.values()];
    return points.length===2?Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y):0;
  }
  syncZoomTarget(){
    this.zoomTarget=THREE.MathUtils.clamp(this.camera.position.distanceTo(this.controls.target),this.controls.minDistance,this.controls.maxDistance);
  }
  updateZoom(dt){
    if(this.introActive||this.focusTween)return;
    const offset=this.zoomOffset??(this.zoomOffset=new THREE.Vector3());
    const distance=offset.subVectors(this.camera.position,this.controls.target).length();
    if(!distance)return;
    const target=THREE.MathUtils.clamp(this.zoomTarget??distance,this.controls.minDistance,this.controls.maxDistance);
    if(this.reduced){
      this.camera.position.copy(this.controls.target).addScaledVector(offset,target/distance);
      return;
    }
    if(Math.abs(Math.log(target/distance))<.0005)return;
    const next=Math.exp(THREE.MathUtils.lerp(Math.log(distance),Math.log(target),1-Math.exp(-dt*14)));
    this.camera.position.copy(this.controls.target).addScaledVector(offset,next/distance);
  }
  pick(x,y) {
    const rect=this.renderer.domElement.getBoundingClientRect();
    this.mouse.set((x-rect.left)/rect.width*2-1,-(y-rect.top)/rect.height*2+1);
    this.raycaster.params.Points.threshold=THREE.MathUtils.clamp(this.camera.position.distanceTo(this.controls.target)*.009,.012,.8);
    this.raycaster.setFromCamera(this.mouse,this.camera);
    const hits=this.raycaster.intersectObject(this.stars);
    let best=null,bestDist=innerWidth<700?22:14;
    for(const hit of hits){const p=this.project(hit.index);const d=Math.hypot(p.x-x,p.y-y);if(this.isAccountStarVisible(hit.index)&&p.visible&&d<bestDist){best=hit.index;bestDist=d;}}
    return best;
  }
  projectPoint(x=0, y=0, z=0) {
    const p = new THREE.Vector3(x, y, z);
    this.group.localToWorld(p);
    p.project(this.camera);
    return {
      x: (p.x + 1) * this.width / 2,
      y: (1 - p.y) * this.height / 2,
      visible: p.z > -1 && p.z < 1
    };
  }
  project(index) {
    this.camera.updateMatrixWorld();
    const a=this.accounts[index];if(!a)return {visible:false,x:0,y:0};
    const p=new THREE.Vector3(...a.position);this.group.localToWorld(p);p.project(this.camera);
    return {x:(p.x+1)*this.width/2,y:(1-p.y)*this.height/2,visible:p.z>-1&&p.z<1&&Math.abs(p.x)<1.05&&Math.abs(p.y)<1.05};
  }
  focus(index, {duration=this.config.focusDuration*1000, delay=this.config.focusDelay*1000, preserveDistance=false, preserveViewOffset=false}={}) {
    this.selected=-1;this.introActive=false;
    // A card-to-card cycle owns an already-safe view offset. Clearing and
    // immediately restoring it makes the field visibly jump sideways, so keep
    // it intact when the caller is continuing that card view. Otherwise the
    // offset eases back to centre in step with the camera move.
    if(!preserveViewOffset)this.setViewOffsetTarget(0,0);
    this.group.updateMatrixWorld(true);
    const target=new THREE.Vector3(...this.accounts[index].position);this.group.localToWorld(target);
    const direction=this.camera.position.clone().sub(this.controls.target);
    if(direction.lengthSq()<1e-8)direction.set(0,0,1);
    direction.normalize();
    const currentDistance=this.camera.position.distanceTo(this.controls.target);
    const fallbackDistance=this.width<700?36:24;
    const distance=preserveDistance&&Number.isFinite(currentDistance)&&currentDistance>0
      ?THREE.MathUtils.clamp(currentDistance,this.controls.minDistance,this.controls.maxDistance)
      :fallbackDistance;
    this.zoomTarget=distance;
    const to=target.clone().add(direction.multiplyScalar(distance));
    if(this.reduced){
      this.camera.position.copy(to);this.controls.target.copy(target);this.focusTween=null;this.syncZoomTarget();
      return null;
    }
    this.focusTween={start:performance.now()+delay,from:this.camera.position.clone(),fromTarget:this.controls.target.clone(),to,toTarget:target,duration,ease:this.config.focusEase};
    return this.focusTween;
  }
  reset() {
    this.introActive=false;
    this.zoomTarget=this.home.length();
    this.focusTween={start:performance.now(),from:this.camera.position.clone(),fromTarget:this.controls.target.clone(),to:this.home.clone(),toTarget:new THREE.Vector3(),duration:this.config.focusDuration*1000,ease:this.config.focusEase};
  }
  ignite(index,onLand=()=>{}, {focus=true,interrupt=focus}={}) {
    if(this.meteor)return false;
    const account=this.accounts[index];
    if(!account)return false;
    // A remote arrival may be shown while someone is reading or watching the
    // entry. It must never cancel their camera/intro state.
    if(interrupt){this.finishEntry();this.introActive=false;this.focusTween=null;}
    const profile=starProfile(account);
    const seed=hashId(account.id);
    const random=seededRandom(seed);
    const target=new THREE.Vector3(...account.position);
    const side=(seed&1)===0?-1:1;
    const offset=new THREE.Vector3(side*(22+random()*9),13+random()*7,1+random()*2);
    const start=target.clone().add(offset);
    const curve=new THREE.LineCurve3(start,target);
    const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
    const ctx=canvas.getContext('2d'),gradient=ctx.createRadialGradient(32,32,0,32,32,32);
    gradient.addColorStop(0,'#fff8f2');gradient.addColorStop(.08,'#f2cca8');gradient.addColorStop(.3,'#ce6d4d55');gradient.addColorStop(1,'#8c442a00');ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);
    const map=new THREE.CanvasTexture(canvas);
    const head=new THREE.Sprite(new THREE.SpriteMaterial({map,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,color:new THREE.Color('#f0c4a4').lerp(new THREE.Color('#ce6d4d'),0.35)}));
    head.scale.setScalar(.48+profile.peak*.17);this.group.add(head);
    const positions=new Float32Array(90*3),colors=new Float32Array(90*3),fades=new Float32Array(90);
    const trailBase=new THREE.Color('#caa088').lerp(new THREE.Color('#f2dfd0'),profile.peak);
    for(let i=0;i<90;i++){const fade=Math.pow(1-i/89,.72),c=trailBase.clone().multiplyScalar(.35+fade*.65);colors.set([c.r,c.g,c.b],i*3);fades[i]=fade;}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));geo.setAttribute('color',new THREE.BufferAttribute(colors,3));geo.setAttribute('aFade',new THREE.BufferAttribute(fades,1));
    const trailMaterial=new THREE.ShaderMaterial({uniforms:{uDpr:this.uniforms.uDpr,uOpacity:{value:.65}},vertexShader:meteorTrailVertex,fragmentShader:meteorTrailFragment,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
    const trail=new THREE.Points(geo,trailMaterial);trail.frustumCulled=false;this.group.add(trail);
    // A live arrival owns its reveal: its landing must not wait for the initial
    // nebula sequence, and it must not be mistaken for an initial meteor later.
    this.setAccountEntryReveal(index,0);
    this.stars.geometry.attributes.aVisible.setX(index,0);this.stars.geometry.attributes.aVisible.needsUpdate=true;
    this.meteor={id:account.id,index,start:performance.now(),curve,head,trail,profile,landed:false,focusOnLand:focus,onLand};
    return true;
  }
  updateMeteor(now){
    const m=this.meteor;if(!m)return;
    const currentIndex=this.accounts.findIndex(a=>a.id===m.id);
    if(currentIndex>=0)m.index=currentIndex;
    const duration=this.reduced?180:this.config.meteorDuration*1000,progress=(now-m.start)/duration,t=easeValue(this.config.meteorEase,Math.min(progress,1));
    // Straight, brief streak: fade into view, extinguish at arrival, leave the star.
    m.head.position.copy(m.curve.getPoint(t));
    const envelope=THREE.MathUtils.smoothstep(t,0,.12)*(1-THREE.MathUtils.smoothstep(t,.88,1));
    m.head.material.opacity=envelope*.95;
    m.trail.material.uniforms.uOpacity.value=envelope*.65;
    const attr=m.trail.geometry.attributes.position;
    for(let i=0;i<90;i++){const p=m.curve.getPoint(Math.max(0,t-i/89*this.config.meteorTail));attr.setXYZ(i,p.x,p.y,p.z);}attr.needsUpdate=true;
    if(progress>=1){
      if(m.index>=0){
        this.stars.geometry.attributes.aVisible.setX(m.index,1);
        this.stars.geometry.attributes.aVisible.needsUpdate=true;
        this.stars.geometry.attributes.aArrival.setX(m.index,this.time);
        this.stars.geometry.attributes.aArrival.needsUpdate=true;
      }
      this.group.remove(m.head,m.trail);
      m.head.material.map.dispose();m.head.material.dispose();
      m.trail.geometry.dispose();m.trail.material.dispose();
      this.meteor=null;
      if(m.focusOnLand&&m.index>=0)this.focus(m.index);
      m.onLand();
    }
  }

  zoom(factor) {
    this.finishEntry();
    const interrupted=this.introActive||this.focusTween;
    this.introActive=false;this.focusTween=null;
    if(interrupted)this.syncZoomTarget();
    this.zoomTarget=THREE.MathUtils.clamp(this.zoomTarget*factor,this.controls.minDistance,this.controls.maxDistance);
  }
  // Projection offsets for the card layout are animated rather than snapped.
  // The camera tween and the frustum shift therefore land together, and the
  // focused star glides toward its resting place instead of jumping sideways.
  viewOffsetTargetFor(active, side = 'right'){
    if(!active)return {x:0,y:0};
    if(this.width < 700)return {x:0,y:this.height * (this.height < 740 ? .37 : .22)};
    return {x:side === 'right' ? 180 : -180,y:0};
  }
  setViewOffsetTarget(x, y, {immediate = false, duration = (this.config?.focusDuration ?? 1.5) * 1000} = {}){
    if(!this.viewOffset){
      const view=this.camera.view;
      this.viewOffset=view?.enabled?{x:view.offsetX,y:view.offsetY}:{x:0,y:0};
    }
    const settled=Math.abs(this.viewOffset.x-x) < .01 && Math.abs(this.viewOffset.y-y) < .01;
    if(immediate || this.reduced || settled || !(duration > 0)){
      this.viewOffset={x,y};
      this.viewOffsetTween=null;
      this.applyViewOffset();
      return null;
    }
    this.viewOffsetTween={start:performance.now(),from:{...this.viewOffset},to:{x,y},duration,ease:this.config?.focusEase ?? 'smoothstep'};
    return this.viewOffsetTween;
  }
  applyViewOffset(){
    const view=this.viewOffset || {x:0,y:0};
    if(Math.abs(view.x) < .001 && Math.abs(view.y) < .001){
      if(this.camera.view?.enabled)this.camera.clearViewOffset();
      return;
    }
    const current=this.camera.view;
    if(current?.enabled && current.offsetX === view.x && current.offsetY === view.y && current.width === this.width && current.height === this.height)return;
    this.camera.setViewOffset(this.width,this.height,view.x,view.y,this.width,this.height);
  }
  updateViewOffset(now){
    const tween=this.viewOffsetTween;
    if(!tween)return;
    const t=Math.min(1,Math.max(0,(now - tween.start) / Math.max(1,tween.duration)));
    const ease=easeValue(tween.ease,t);
    this.viewOffset={
      x:tween.from.x + (tween.to.x - tween.from.x) * ease,
      y:tween.from.y + (tween.to.y - tween.from.y) * ease,
    };
    if(t===1){
      this.viewOffset={...tween.to};
      this.viewOffsetTween=null;
    }
    this.applyViewOffset();
  }
  setCardView(active, side = 'right', {immediate = false} = {}){
    this.cardView = active;
    this.cardSide = side;
    const target=this.viewOffsetTargetFor(active,side);
    this.setViewOffsetTarget(target.x,target.y,{immediate});
  }
  captureFrame({preserveView=false}={}){
    this.syncStarReferenceDepth();
    if(preserveView){
      this.renderer.render(this.scene,this.camera);
      return this.renderer.domElement.toDataURL('image/png');
    }
    // Read immediately after rendering; do not retain a costly drawing buffer.
    const view=this.camera.view?{...this.camera.view}:null;
    try{
      this.camera.clearViewOffset();
      this.renderer.render(this.scene,this.camera);
      return this.renderer.domElement.toDataURL('image/png');
    }finally{
      if(view?.enabled)this.camera.setViewOffset(view.fullWidth,view.fullHeight,view.offsetX,view.offsetY,view.width,view.height);
    }
  }
  setDay(day){this.uniforms.uDay.value=day;}
  setSelection(index){
    this.selected=index;
    // The card view owns the projection offset; resizing re-applies it right
    // after this call, so never let the selection logic pull it to zero first.
    if(this.cardView)return;
    // Keep a focused star above the mobile details sheet.
    if(this.width<700&&index>=0)this.setViewOffsetTarget(0,this.height*.2);
    else this.setViewOffsetTarget(0,0);
  }
  onResize(){
    this.width=Math.max(1,this.container.clientWidth);this.height=Math.max(1,this.container.clientHeight);
    this.camera.aspect=this.width/this.height;
    this.camera.fov=this.width<700?62:48;
    this.setSelection(this.selected??-1);
    // A viewport change is an instant layout update, not a camera move.
    if(this.cardView)this.setCardView(true, this.cardSide || 'right', {immediate:true});
    const pixelRatio=this.getRenderPixelRatio();
    if(pixelRatio!==this.pixelRatio){
      this.pixelRatio=pixelRatio;
      this.renderer.setPixelRatio(pixelRatio);
      this.uniforms.uDpr.value=pixelRatio;
    }
    this.renderer.setSize(this.width,this.height);
  }
  animate(now){
    if(this.disposed)return;
    this.raf=requestAnimationFrame(this.animate);
    const dt=Math.min((now-this.last)/1000,.06);this.last=now;
    if(document.hidden){this.entryClock.pause();return;}
    if(!this.reduced)this.time+=dt;
    this.uniforms.uTime.value=this.time;
    const mode=this.config.animationMode||'full';
    let accountReveal=0;
    if(mode==='slogan-freeze'){
      this.uniforms.uFormation.value=0;
      this.uniforms.uTextMorph.value=0;
      this.uniforms.uTextReveal.value=1;
      this.uniforms.uEntryFade.value=1;
      if(this.cloud)this.cloud.material.opacity=0;
    }else if(mode==='slogan-loop'){
      const c=this.config;
      const cycleTotal=c.lightDuration+c.textHold+1.0;
      const cycleElapsed=((now-(this.loopStartTime||now))/1000)%cycleTotal;
      const revealT=Math.min(1,cycleElapsed/Math.max(0.01,c.lightDuration));
      const reveal=easeValue(c.lightEase,revealT);
      let fade=1;
      const fadeStart=c.lightDuration+c.textHold;
      if(cycleElapsed>fadeStart){
        fade=Math.max(0,1-(cycleElapsed-fadeStart)/0.8);
      }
      this.uniforms.uTextReveal.value=this.reduced?1:reveal;
      this.uniforms.uTextMorph.value=0;
      this.uniforms.uFormation.value=0;
      this.uniforms.uEntryFade.value=fade;
      if(this.cloud)this.cloud.material.opacity=0;
    }else if(mode==='nebula-loop'){
      const c=this.config;
      const cycleTotal=c.nebulaDuration+1.8;
      const cycleElapsed=((now-(this.loopStartTime||now))/1000)%cycleTotal;
      const t=Math.min(1,cycleElapsed/Math.max(0.01,c.nebulaDuration));
      const formation=easeValue(c.nebulaEase,t);
      this.uniforms.uTextReveal.value=1;
      this.uniforms.uTextMorph.value=1;
      this.uniforms.uFormation.value=this.reduced?1:formation;
      this.uniforms.uEntryFade.value=1;
      if(this.cloud)this.cloud.material.opacity=(.08+.92*formation);
      accountReveal=this.loopAccountReveal(cycleElapsed);
    }else if(mode==='nebula-freeze'){
      this.uniforms.uTextReveal.value=1;
      this.uniforms.uTextMorph.value=1;
      this.uniforms.uFormation.value=1;
      this.uniforms.uEntryFade.value=1;
      if(this.cloud)this.cloud.material.opacity=1;
      if(this.history.geometry.drawRange.count!==this.historyBaseCount)this.history.geometry.setDrawRange(0,this.historyBaseCount);
      accountReveal=1;
    }else{
      // 默认完整流程
      const entryTime=this.entrySkipped?100:this.entryClock.frame(now);
      const progress=entryProgress(entryTime,this.config);
      const formation=this.reduced?1:progress.formation;
      this.uniforms.uFormation.value=formation;
      this.uniforms.uTextReveal.value=this.reduced?1:progress.reveal;
      const textMorph=this.reduced?1:progress.morph;
      this.uniforms.uTextMorph.value=textMorph;
      this.uniforms.uEntryFade.value=1;
      if(formation===1&&this.history.geometry.drawRange.count!==this.historyBaseCount)this.history.geometry.setDrawRange(0,this.historyBaseCount);
      if(this.cloud)this.cloud.material.opacity=(.08+.92*formation)*textMorph;
      accountReveal=this.entryAccountReveal(entryTime);
      this.entryClock.presented(performance.now());
    }
    this.setAccountReveal(accountReveal);
    const curFormation = this.uniforms.uFormation.value;
    // The dock should arrive with the first visible nebula, not wait for the
    // cloud to reach its final opacity. `formation` is exactly zero before
    // that stage, so the first positive frame is the natural handoff point.
    if(!this.nebulaReadyFired && this.controlsReadyForNebula(curFormation,mode)){
      this.nebulaReadyFired = true;
      this.callbacks.onNebulaReady?.();
    }
    if(this.introActive){
      const t=Math.min((now-this.start)/2800,1),ease=1-Math.pow(1-t,3);
      this.camera.position.copy(this.home).multiplyScalar(1.16-.16*ease);
      if(t===1){this.introActive=false;this.syncZoomTarget();}
    }
    if(this.focusTween){
      const f=this.focusTween,t=this.reduced?1:THREE.MathUtils.clamp((now-f.start)/(f.duration??1400),0,1),ease=easeValue(f.ease??this.config.focusEase,t);
      this.camera.position.lerpVectors(f.from,f.to,ease);this.controls.target.lerpVectors(f.fromTarget,f.toTarget,ease);
      if(t===1){this.focusTween=null;this.syncZoomTarget();}
    }
    this.updateViewOffset(now);
    this.controls.update(dt);
    this.updateZoom(dt);
    this.updateMeteor(now);
    this.syncStarReferenceDepth();
    this.callbacks.onFrame(dt);
    this.renderer.render(this.scene,this.camera);
    this.entryClock.presented(performance.now());
    if(!this.ready){this.ready=true;this.callbacks.onReady();}
  }
}
