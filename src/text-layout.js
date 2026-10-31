import {DEFAULT_CONFIG} from './config.js';
import {seededRandom} from './model.js';
import {sloganForLocale} from './i18n.js';

// Shared screen-space samples keep the lightweight entry and WebGL handoff aligned.
export function sampleSlogan(config,viewportWidth,viewportHeight){
  const mobile=viewportWidth<700;
  const width=Math.min(viewportWidth-24,1400),scale=2;
  const lines=config.slogan===DEFAULT_CONFIG.slogan&&mobile
    ?['你的 Claude 账号','没有消失，','只是从此不再回应，','化作了星河里的一点光']
    :config.slogan===sloganForLocale('en')&&mobile
      ?['Your Claude account','has not disappeared.','It no longer responds—','it now glows among the stars.']
      :config.slogan.split('\n');
  const desiredLineHeight=mobile?config.mobileLineHeight:config.lineHeight;
  const height=Math.min(viewportHeight*.7,Math.max(mobile?240:220,lines.length*desiredLineHeight+60));
  const canvas=document.createElement('canvas');canvas.width=width*scale;canvas.height=height*scale;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  let fontSize=mobile?config.mobileFontSize:config.fontSize;
  const setFont=()=>{ctx.font=`${config.fontWeight} ${fontSize*scale}px ${config.fontFamily}`;};setFont();
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#fff';
  const measured=Math.max(...lines.map(line=>ctx.measureText(line).width));
  const fit=Math.min(1,(canvas.width-16)/Math.max(1,measured),(height-20)/Math.max(fontSize,(lines.length-1)*desiredLineHeight+fontSize));
  fontSize*=fit;setFont();
  const lineHeight=desiredLineHeight*fit*scale;
  lines.forEach((line,i)=>ctx.fillText(line,canvas.width/2,canvas.height/2+(i-(lines.length-1)/2)*lineHeight));
  const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data,points=[];
  const step=Math.max(1,config.textSampleStep*scale);
  for(let y=0;y<canvas.height;y+=step)for(let x=0;x<canvas.width;x+=step){
    const alpha=pixels[(Math.floor(y)*canvas.width+Math.floor(x))*4+3];
    if(alpha>=88){
      // 细微亚像素确定性抖动，消除生硬网格阶梯感，笔画清秀分明且不弥散
      const r=seededRandom((Math.floor(x)*374761393+Math.floor(y)*668265263)^913);
      const jx=(r()-.5)*(step/scale*0.58);
      const jy=(r()-.5)*(step/scale*0.58);
      points.push([(viewportWidth-width)/2+x/scale+jx,(viewportHeight-height)/2+y/scale+jy]);
    }
  }
  const random=seededRandom(771);for(let i=points.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[points[i],points[j]]=[points[j],points[i]];}
  return points.length?points:[[viewportWidth/2,viewportHeight/2]];
}
