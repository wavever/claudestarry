import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_CONFIG,CONFIG_STORAGE_KEY,normalizeConfig,clearLegacyConfig,defaultConfigForLocale,entryProgress,easeValue,EASINGS} from './config.js';

test('saved config sanitization clamps unsafe timing values and ignores unknown keys',()=>{
  const c=normalizeConfig({textHold:-10,lightDuration:0,fontSize:1000,meteorDuration:'bad',textEase:'invalid',slogan:' ',unknown:'x'});
  assert.equal(c.textHold,0);assert.equal(c.lightDuration,.1);assert.equal(c.fontSize,96);
  assert.equal(c.meteorDuration,DEFAULT_CONFIG.meteorDuration);assert.equal(c.textEase,DEFAULT_CONFIG.textEase);
  assert.equal(c.slogan,DEFAULT_CONFIG.slogan);assert.ok(!('unknown' in c));
});
test('legacy debug presets are cleared so the opening sequence always plays',()=>{
  const values=new Map([[CONFIG_STORAGE_KEY,JSON.stringify({animationMode:'nebula-freeze'})]]);
  const storage={removeItem:key=>values.delete(key)};
  assert.equal(clearLegacyConfig(storage),true);
  assert.equal(values.has(CONFIG_STORAGE_KEY),false);
  assert.equal(clearLegacyConfig({removeItem:()=>{throw new Error('blocked');}}),false);
  assert.equal(defaultConfigForLocale('zh-CN').animationMode,'full');
  assert.equal(defaultConfigForLocale('en').animationMode,'full');
});
test('entry stages use configurable delays and durations without changing settled particles',()=>{
  const c=normalizeConfig({lightDuration:1,textHold:2,textMorphDuration:2,logoHold:1,nebulaDuration:4});
  assert.deepEqual(entryProgress(1,c),{reveal:1,morph:0,formation:0});
  assert.equal(entryProgress(3,c).morph,0);
  assert.equal(entryProgress(4,c).morph,.125);
  assert.equal(entryProgress(5,c).morph,1);
  assert.equal(entryProgress(6,c).formation,0);
  assert.equal(entryProgress(10,c).formation,1);
});
test('all interpolators are bounded, monotone, and reach their endpoints',()=>{
  for(const name of EASINGS){
    assert.equal(easeValue(name,0),0);assert.equal(easeValue(name,1),1);
    let previous=0;for(let i=0;i<=100;i++){const n=easeValue(name,i/100);assert.ok(n>=previous&&n<=1);previous=n;}
  }
  assert.ok(easeValue('easeInCubic',.5)<easeValue('linear',.5));
});
