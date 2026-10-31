// Advances only between completed visible frames. A long frame may finish the
// current stage, but cannot skip the next stage's first displayed frame.
export class EntryClock {
  constructor(config){this.reset(config);}
  reset(config=this.config){
    this.config=config;
    const c=config;
    const lit=c.lightDuration,held=lit+c.textHold,morphed=held+c.textMorphDuration;
    this.boundaries=[lit,held,morphed,morphed+c.logoHold,morphed+c.logoHold+c.nebulaDuration];
    this.elapsed=0;this.lastPresentedAt=null;
  }
  frame(now){
    if(this.lastPresentedAt===null)return this.elapsed;
    const delta=Math.max(0,now-this.lastPresentedAt)/1000;
    const boundary=this.boundaries.find(time=>time>this.elapsed+1e-8)??Infinity;
    this.elapsed=Math.min(this.elapsed+delta,boundary);
    return this.elapsed;
  }
  presented(now){this.lastPresentedAt=now;}
  pause(){this.lastPresentedAt=null;}
}
