import test from 'node:test';
import assert from 'node:assert/strict';
import {placeEntryCard} from './entry-card-layout.js';

function intersects(a,b,gap=0){
  return a.x+a.width+gap>b.x&&a.x<b.x+b.width+gap&&a.y+a.height+gap>b.y&&a.y<b.y+b.height+gap;
}

function assertPlacement(card,bounds,occupied,gap=8){
  assert.ok(card,'expected a placement');
  assert.ok(card.x>=bounds.left&&card.y>=bounds.top);
  assert.ok(card.x+card.width<=bounds.right&&card.y+card.height<=bounds.bottom);
  assert.ok(occupied.every(other=>!intersects(card,other,gap)),'placement must not overlap an occupied card');
}

test('places ten dense desktop cards without overlap',()=>{
  const bounds={left:12,top:78,right:971,bottom:668},width=196,height=75.7,occupied=[];
  const point={x:bounds.left+Math.floor((bounds.right-bounds.left)/2)-width/2,y:bounds.top+Math.floor((bounds.bottom-bounds.top)/2)-height/2};
  for(let i=0;i<10;i++){
    const card=placeEntryCard({point,width,height,bounds,occupied});
    assertPlacement(card,bounds,occupied);
    occupied.push(card);
  }
});

test('eventually places ten dense mobile compact cards as slots are released',()=>{
  const bounds={left:12,top:100,right:378,bottom:754},width=179,height=70.2,occupied=[];
  const point={x:bounds.left+Math.floor((bounds.right-bounds.left)/2)-width/2,y:bounds.top+Math.floor((bounds.bottom-bounds.top)/2)-height/2};
  let deferred=0,placed=0;
  for(let i=0;i<10;i++){
    let card=placeEntryCard({point,width,height,bounds,occupied});
    if(!card){
      deferred++;
      occupied.shift();
      card=placeEntryCard({point,width,height,bounds,occupied});
    }
    assertPlacement(card,bounds,occupied);
    occupied.push(card);
    placed++;
  }
  assert.equal(placed,10);
  assert.ok(deferred>=1,'compact layout should defer until a slot is released');
});

test('clamps a desired position at each bounds edge',()=>{
  const bounds={left:10,top:20,right:210,bottom:160};
  assert.deepEqual(placeEntryCard({point:{x:-100,y:-100},width:80,height:40,bounds}),{x:10,y:20,width:80,height:40});
  assert.deepEqual(placeEntryCard({point:{x:999,y:999},width:80,height:40,bounds}),{x:130,y:120,width:80,height:40});
});

test('returns null when the card cannot fit',()=>{
  const bounds={left:0,top:0,right:100,bottom:80};
  assert.equal(placeEntryCard({point:{x:0,y:0},width:101,height:40,bounds}),null);
  assert.equal(placeEntryCard({point:{x:0,y:0},width:100,height:80,bounds,occupied:[{x:0,y:0,width:100,height:80}],gap:0}),null);
});

test('keeps a valid previous position stable before considering the new point',()=>{
  const bounds={left:0,top:0,right:500,bottom:300};
  const previous={x:32,y:48,width:120,height:64};
  const card=placeEntryCard({point:{x:390,y:210},width:120,height:64,bounds,occupied:[{x:250,y:90,width:100,height:80}],previous});
  assert.deepEqual(card,{x:32,y:48,width:120,height:64});
  assertPlacement(card,bounds,[{x:250,y:90,width:100,height:80}]);
});
