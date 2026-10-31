import test from 'node:test';
import assert from 'node:assert/strict';
import {EntryClock} from './entry-clock.js';
import {DEFAULT_CONFIG,entryProgress} from './config.js';

test('first-draw compilation does not consume the entry timeline',()=>{
  const clock=new EntryClock(DEFAULT_CONFIG);
  assert.equal(clock.frame(100),0);
  clock.presented(3100); // Simulate a three-second first draw.
  assert.ok(clock.frame(3116)<.02);
});
test('a stalled frame cannot skip the fully-lit text or its hold',()=>{
  const clock=new EntryClock(DEFAULT_CONFIG);
  clock.presented(0);
  assert.equal(clock.frame(8000),2);
  assert.deepEqual(entryProgress(clock.elapsed,DEFAULT_CONFIG),{reveal:1,morph:0,formation:0});
  clock.presented(8000);
  assert.equal(clock.frame(8500),2.5);
  assert.equal(entryProgress(clock.elapsed,DEFAULT_CONFIG).morph,0);
  clock.presented(8500);
  assert.equal(clock.frame(9000),3);
  assert.equal(entryProgress(clock.elapsed,DEFAULT_CONFIG).morph,0);
  clock.presented(9000);
  assert.ok(entryProgress(clock.frame(9100),DEFAULT_CONFIG).morph>0);
});
test('background waiting and replay do not consume visible animation time',()=>{
  const clock=new EntryClock(DEFAULT_CONFIG);clock.presented(0);clock.frame(500);
  clock.pause();assert.equal(clock.frame(20000),.5);
  clock.presented(20000);assert.equal(clock.frame(20100),.6);
  clock.reset({...DEFAULT_CONFIG,lightDuration:4});assert.equal(clock.frame(30000),0);
  assert.equal(clock.boundaries[0],4);
});
