import {sloganForLocale} from './i18n.js';

export const CONFIG_STORAGE_KEY = 'afterlight-animation-preset-v1';
export const EASINGS = ['linear','smoothstep','easeInQuad','easeInCubic','easeOutCubic','easeInOutCubic'];
export const ANIMATION_MODES = ['full','slogan-freeze','slogan-loop','nebula-loop','nebula-freeze'];
export const DEFAULT_CONFIG = Object.freeze({
  animationMode:'full',
  slogan:'被停用的 Claude 账号没有消失，\n只是从此不再回应，但仍留有余光',
  fontFamily:'"PingFang SC", "Microsoft YaHei", sans-serif',
  fontSize:54,mobileFontSize:34,fontWeight:500,textParticleSize:1.3,textSampleStep:3.0,
  lineHeight:80,mobileLineHeight:52,
  lightDuration:2,lightEase:'linear',textHold:1,textMorphDuration:1.7,textEase:'easeInCubic',
  logoHold:.6,nebulaDuration:6,nebulaEase:'smoothstep',
  meteorDuration:1.85,meteorEase:'linear',meteorTail:.17,focusDuration:1.5,focusDelay:.08,focusEase:'smoothstep',
  twinkleDecay:8,homeDistance:44,mobileHomeDistance:62,
});
export function defaultConfigForLocale(locale){
  return {...DEFAULT_CONFIG,slogan:sloganForLocale(locale)};
}
export function isDefaultSlogan(slogan){
  return slogan===DEFAULT_CONFIG.slogan||slogan===sloganForLocale('en');
}
export function localizeDefaultSlogan(slogan,locale,preserveCustom=true){
  return !preserveCustom||isDefaultSlogan(slogan)?sloganForLocale(locale):slogan;
}
const RANGES={fontSize:[16,96],mobileFontSize:[14,64],fontWeight:[300,700],textParticleSize:[.6,4],textSampleStep:[1,4],lineHeight:[30,140],mobileLineHeight:[24,100],lightDuration:[.1,10],textHold:[0,10],textMorphDuration:[.2,8],logoHold:[0,10],nebulaDuration:[.2,20],meteorDuration:[.2,8],meteorTail:[.03,.35],focusDuration:[.2,8],focusDelay:[0,2],twinkleDecay:[1,60],homeDistance:[25,100],mobileHomeDistance:[40,160]};
export function normalizeConfig(input={},defaults=DEFAULT_CONFIG){
  const clean={...defaults};
  if(!input||typeof input!=='object')return clean;
  for(const [key,[low,high]] of Object.entries(RANGES)){
    const value=input[key];
    if(value!==''&&value!==null&&Number.isFinite(Number(value)))clean[key]=Math.min(high,Math.max(low,Number(value)));
  }
  for(const key of ['lightEase','textEase','nebulaEase','meteorEase','focusEase'])if(EASINGS.includes(input[key]))clean[key]=input[key];
  if(typeof input.animationMode==='string'&&ANIMATION_MODES.includes(input.animationMode))clean.animationMode=input.animationMode;
  if(typeof input.slogan==='string'&&input.slogan.trim())clean.slogan=Array.from(input.slogan.trim()).slice(0,200).join('');
  if(typeof input.fontFamily==='string'&&input.fontFamily.trim())clean.fontFamily=input.fontFamily.trim().slice(0,200);
  return clean;
}
// The animation tuning panel was a development-only tool. Its saved presets
// must never skip the opening sequence again, so remove the legacy key before
// the first frame and always boot from the shipped defaults.
export function clearLegacyConfig(storage){
  try{storage?.removeItem?.(CONFIG_STORAGE_KEY);return true;}catch{return false;}
}
export function easeValue(name,t){
  const x=Math.max(0,Math.min(1,t));
  switch(name){
    case 'easeInQuad':return x*x;
    case 'easeInCubic':return x*x*x;
    case 'easeOutCubic':return 1-(1-x)**3;
    case 'easeInOutCubic':return x<.5?4*x*x*x:1-(-2*x+2)**3/2;
    case 'smoothstep':return x*x*(3-2*x);
    default:return x;
  }
}
export function entryProgress(seconds,config){
  const c=config??DEFAULT_CONFIG;
  const morphStart=c.lightDuration+c.textHold;
  const nebulaStart=morphStart+c.textMorphDuration+c.logoHold;
  return {reveal:easeValue(c.lightEase,seconds/c.lightDuration),morph:easeValue(c.textEase,(seconds-morphStart)/c.textMorphDuration),formation:easeValue(c.nebulaEase,(seconds-nebulaStart)/c.nebulaDuration)};
}
