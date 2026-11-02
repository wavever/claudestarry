import test from 'node:test';
import assert from 'node:assert/strict';
import {selectEntryCardCandidates} from './entry-card-selection.js';
import {placeEntryCard} from './entry-card-layout.js';

const options={spacingX:100,spacingY:100,center:{x:0,y:0}};
const ids=items=>items.map(item=>item.id);
const distance=(a,b)=>((a.x-b.x)/options.spacingX)**2+((a.y-b.y)/options.spacingY)**2;
const intersects=(a,b,gap=0)=>a.x+a.width+gap>b.x&&a.x<b.x+b.width+gap&&a.y+a.height+gap>b.y&&a.y<b.y+b.height+gap;
const cardinal=()=>[
  {id:'core',x:0,y:0},
  {id:'top-inner',x:0,y:-20},{id:'top',x:0,y:-40},
  {id:'right-inner',x:20,y:0},{id:'right',x:40,y:0},
  {id:'bottom-inner',x:0,y:20},{id:'bottom',x:0,y:40},
  {id:'left-inner',x:-20,y:0},{id:'left',x:-40,y:0},
];

test('keeps the centre together with representatives from all surrounding directions',()=>{
  const selected=selectEntryCardCandidates(cardinal(),options);
  assert.deepEqual(ids(selected),['core','top','right','bottom','left']);
  assert.ok(distance(selected[0],selected[1])<1,'coverage is retained even inside the ordinary fill spacing');
});

test('is deterministic when cardinal candidates are reordered',()=>{
  const candidates=cardinal();
  assert.deepEqual(ids(selectEntryCardCandidates(candidates,options)),ids(selectEntryCardCandidates([...candidates].reverse(),options)));
});

test('collapses a tiny dense cluster to one centroid-nearest representative',()=>{
  const dense=[{id:'a',x:0,y:0},{id:'b',x:20,y:0},{id:'c',x:0,y:20}];
  assert.deepEqual(ids(selectEntryCardCandidates(dense,options)),['a']);
});

test('requires normal spacing for fills after directional seeds',()=>{
  const selected=selectEntryCardCandidates([
    {id:'core',x:0,y:0},
    {id:'top',x:0,y:-200},{id:'right',x:200,y:0},
    {id:'bottom',x:0,y:200},{id:'left',x:-200,y:0},{id:'fill',x:140,y:140},
  ],options);
  assert.deepEqual(ids(selected),['core','top','right','bottom','left','fill']);
  assert.ok(selected.slice(0,-1).every(item=>distance(item,selected.at(-1))>=1));
});

test('fit selection admits close candidates that normal spacing collapses',()=>{
  const dense=[{id:'core',x:0,y:0},{id:'near',x:10,y:0},{id:'outer',x:20,y:0}];
  assert.equal(selectEntryCardCandidates(dense,options).length,1);
  const calls=[];
  const selected=selectEntryCardCandidates(dense,{...options,canSelect:candidate=>{
    calls.push(candidate.id);
    return true;
  }});
  assert.deepEqual(ids(selected),['core','outer','near']);
  assert.deepEqual(calls,['core','outer','near']);
});

test('fit selection respects rejected core and directional seeds permanently',()=>{
  const calls=[];
  const selected=selectEntryCardCandidates([
    {id:'core',x:0,y:0},{id:'top',x:0,y:-40},{id:'right',x:40,y:0},
    {id:'bottom',x:0,y:40},{id:'left',x:-40,y:0},
  ],{...options,canSelect:candidate=>{
    calls.push(candidate.id);
    return candidate.id!=='core'&&candidate.id!=='right';
  }});
  assert.deepEqual(ids(selected),['top','bottom','left']);
  assert.deepEqual(calls,['core','top','right','bottom','left']);
});

test('fit selection uses real layout capacity for a dense cluster without overlap',()=>{
  const dense=[
    {id:'core',x:300,y:200},{id:'top',x:300,y:190},{id:'right',x:310,y:200},
    {id:'bottom',x:300,y:210},{id:'left',x:290,y:200},{id:'nw',x:290,y:190},
    {id:'ne',x:310,y:190},{id:'se',x:310,y:210},{id:'sw',x:290,y:210},
  ];
  const bounds={left:0,top:0,right:600,bottom:400},width=196,height=75.7,gap=14,occupied=[];
  assert.equal(selectEntryCardCandidates(dense,{...options,center:{x:300,y:200}}).length,1);
  const selected=selectEntryCardCandidates(dense,{...options,center:{x:300,y:200},canSelect:candidate=>{
    const card=placeEntryCard({point:{x:candidate.x-width/2,y:candidate.y-height/2},width,height,bounds,occupied,gap});
    if(!card)return false;
    occupied.push(card);
    return true;
  }});
  assert.ok(selected.length>1);
  assert.equal(occupied.length,selected.length);
  for(let i=0;i<occupied.length;i++)for(let j=i+1;j<occupied.length;j++)assert.ok(!intersects(occupied[i],occupied[j],gap));
});

test('has no fixed selection limit',()=>{
  const grid=Array.from({length:12},(_,index)=>({id:`${index}`,x:(index%4)*20,y:Math.floor(index/4)*20}));
  assert.equal(selectEntryCardCandidates(grid,{spacingX:10,spacingY:10}).length,12);
});

test('returns no candidates for empty or invalid input and filters duplicate IDs',()=>{
  assert.deepEqual(selectEntryCardCandidates([],{spacingX:100,spacingY:100}),[]);
  assert.deepEqual(selectEntryCardCandidates([{id:'',x:0,y:0},{id:'bad',x:Infinity,y:0}],options),[]);
  assert.deepEqual(ids(selectEntryCardCandidates([
    {id:'same',x:0,y:0},{id:'same',x:500,y:0},{id:'valid',x:200,y:0},
  ],options)).sort(),['same','valid']);
  assert.deepEqual(selectEntryCardCandidates([{id:'a',x:0,y:0}],{spacingX:0,spacingY:100}),[]);
});
