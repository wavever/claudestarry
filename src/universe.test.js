import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ACCOUNT_STAR_GLOW_SCALE, ACCOUNT_STAR_MAX_CSS_DIAMETER, ACCOUNT_STAR_MIN_CSS_DIAMETER, accountStarCssDiameter, accountStarFramebufferDiameter, GALAXY_SPIN_SPEED, glslFloatLiteral, Universe } from './universe.js';

function view() {
  const u=Object.create(Universe.prototype);
  Object.assign(u,{camera:new THREE.PerspectiveCamera(),controls:{target:new THREE.Vector3(),minDistance:.25,maxDistance:600},introActive:false,focusTween:null,reduced:false,zoomTarget:64});
  u.camera.position.set(0,0,64);
  return u;
}

test('GLSL shader interpolation always emits float literals',()=>{
  assert.equal(glslFloatLiteral(9),'9.0');
  assert.equal(glslFloatLiteral(-2),'-2.0');
  assert.equal(glslFloatLiteral(5.5),'5.5');
  assert.equal(glslFloatLiteral(.035),'0.035');
  assert.throws(()=>glslFloatLiteral(Infinity),/finite/);
});

test('rapid zoom input accumulates without jumping the camera',()=>{
  const u=view();u.zoom(.5);u.zoom(.5);
  assert.equal(u.zoomTarget,16);
  assert.equal(u.camera.position.z,64);
  let previous=64;
  for(let i=0;i<180;i++){
    u.updateZoom(1/60);
    assert.ok(u.camera.position.z<=previous&&u.camera.position.z>=16);
    previous=u.camera.position.z;
  }
  assert.ok(Math.abs(previous-16)<.01);
});

test('continuous zoom has the same trajectory at 30 and 60 FPS',()=>{
  const a=view(),b=view();a.zoom(.01);b.zoom(.01);
  for(let i=0;i<12;i++)a.updateZoom(1/30);
  for(let i=0;i<24;i++)b.updateZoom(1/60);
  assert.ok(Math.abs(a.camera.position.z-b.camera.position.z)<1e-8);
});

test('zoom endpoints stay finite and reduced motion reaches them immediately',()=>{
  const u=view();u.reduced=true;u.zoom(1e-8);u.updateZoom(1/60);
  assert.ok(Math.abs(u.camera.position.z-.25)<1e-8);
  u.zoom(1e8);u.updateZoom(1/60);
  assert.ok(Math.abs(u.camera.position.z-600)<1e-8);
  assert.ok(u.camera.position.toArray().every(Number.isFinite));
});

test('card-cycle focus preserves the current zoom and camera view offset',()=>{
  const u=view();
  u.config={focusDuration:1.5,focusDelay:.08,focusEase:'smoothstep'};
  u.width=1200;u.group=new THREE.Group();u.accounts=[{position:[14,3,-5]}];
  u.camera.position.set(8,4,42);u.controls.target.set(-2,1,3);
  u.camera.setViewOffset(1200,800,180,0,1200,800);
  const distance=u.camera.position.distanceTo(u.controls.target);
  const cardView={...u.camera.view};

  u.focus(0,{duration:900,delay:0,preserveDistance:true,preserveViewOffset:true});

  assert.deepEqual(u.camera.view,cardView);
  assert.ok(Math.abs(u.zoomTarget-distance)<1e-10);
  assert.ok(Math.abs(u.focusTween.to.distanceTo(u.focusTween.toTarget)-distance)<1e-10);
  assert.deepEqual(u.focusTween.from.toArray(),[8,4,42]);
});

test('opening a card eases the frustum offset instead of snapping the field',()=>{
  const u=view();
  Object.assign(u,{width:1200,height:800,config:{focusDuration:1.5,focusEase:'smoothstep'},cardView:false,viewOffset:{x:0,y:0},viewOffsetTween:null});

  u.setCardView(true,'right');
  assert.equal(u.viewOffset.x,0);
  assert.ok(!u.camera.view?.enabled);
  const tween=u.viewOffsetTween;
  assert.ok(tween);
  assert.equal(tween.to.x,180);

  const trail=[];
  for(const at of [.25,.5,.75,1]){
    u.updateViewOffset(tween.start+tween.duration*at);
    trail.push(u.viewOffset.x);
    assert.ok(u.camera.view?.enabled);
  }
  assert.ok(trail.every(x=>x>0&&x<=180));
  assert.ok(trail[0]<trail[1]&&trail[1]<trail[2]&&trail[2]<trail[3]);
  assert.equal(u.viewOffset.x,180);
  assert.equal(u.camera.view.offsetX,180);
  assert.equal(u.viewOffsetTween,null);
});

test('leaving the card view eases the offset back instead of cutting sideways',()=>{
  const u=view();
  Object.assign(u,{width:1200,height:800,config:{focusDuration:1.5,focusEase:'smoothstep'},cardView:false,viewOffset:{x:0,y:0},viewOffsetTween:null});
  u.setCardView(true,'right',{immediate:true});
  assert.equal(u.camera.view.offsetX,180);

  u.setCardView(false);
  assert.equal(u.camera.view.offsetX,180);
  const tween=u.viewOffsetTween;
  assert.ok(tween);
  u.updateViewOffset(tween.start+tween.duration*.5);
  assert.ok(u.viewOffset.x<180&&u.viewOffset.x>0);
  u.updateViewOffset(tween.start+tween.duration);
  assert.equal(u.viewOffset.x,0);
  assert.ok(!u.camera.view?.enabled);
});

test('reduced motion applies card view offsets immediately',()=>{
  const u=view();
  Object.assign(u,{width:1200,height:800,config:{focusDuration:1.5,focusEase:'smoothstep'},cardView:false,viewOffset:{x:0,y:0},viewOffsetTween:null});
  u.reduced=true;
  u.setCardView(true,'left');
  assert.equal(u.viewOffset.x,-180);
  assert.equal(u.camera.view.offsetX,-180);
  assert.equal(u.viewOffsetTween,null);
  u.setCardView(false);
  assert.ok(!u.camera.view?.enabled);
});

test('reduced-motion focus completes immediately at the retained distance',()=>{
  const u=view();
  u.config={focusDuration:1.5,focusDelay:.08,focusEase:'smoothstep'};
  u.width=900;u.group=new THREE.Group();u.accounts=[{position:[8,-2,1]}];
  u.reduced=true;u.camera.position.set(2,3,30);u.controls.target.set(1,1,4);
  const distance=u.camera.position.distanceTo(u.controls.target);

  u.focus(0,{preserveDistance:true,preserveViewOffset:true});

  assert.equal(u.focusTween,null);
  assert.deepEqual(u.controls.target.toArray(),[8,-2,1]);
  assert.ok(Math.abs(u.camera.position.distanceTo(u.controls.target)-distance)<1e-10);
});

test('controls become eligible on the first nebula frame',()=>{
  const u=Object.create(Universe.prototype);
  u.entrySkipped=false;
  assert.equal(u.controlsReadyForNebula(0,'full'),false);
  assert.equal(u.controlsReadyForNebula(.000001,'full'),true);
  assert.equal(u.controlsReadyForNebula(0,'nebula-freeze'),true);
  u.entrySkipped=true;
  assert.equal(u.controlsReadyForNebula(0,'slogan-freeze'),true);
});


test('share capture centers the camera and restores the mobile card framing',()=>{
  const u=view();
  u.scene=new THREE.Scene();
  u.camera.setViewOffset(390,844,0,844*.22,390,844);
  const original={...u.camera.view};
  u.renderer={render(){assert.equal(u.camera.view.enabled,false);},domElement:{toDataURL(){return 'data:image/png;base64,test';}}};
  assert.equal(u.captureFrame(),'data:image/png;base64,test');
  assert.deepEqual(u.camera.view,original);
  u.renderer.domElement.toDataURL=()=>{throw new Error('capture failed');};
  assert.throws(()=>u.captureFrame(),/capture failed/);
  assert.deepEqual(u.camera.view,original);
});

test('record updates preserve an active meteor by ID when point indices change',()=>{
  const account=(id,x)=>({id,position:[x,0,0],date:'2020-01-02',started:null});
  const a=account('a',0),b=account('b',1),c=account('c',2);
  const u=Object.create(Universe.prototype);
  u.accounts=[a,b];
  u.accountReveal=0;
  u.stars={geometry:new THREE.BufferGeometry()};
  u.stars.geometry.setAttribute('aArrival',new THREE.Float32BufferAttribute([-10,-20],1));
  u.stars.geometry.setAttribute('aEntryReveal',new THREE.Float32BufferAttribute([1,0],1));
  u.group={remove(){},add(){}};
  u.starMaterial=new THREE.PointsMaterial();
  u.meteor={id:'b',index:1};
  u.setAccounts([b,a,c]);
  assert.equal(u.meteor.index,0);
  assert.equal(u.stars.geometry.attributes.aVisible.getX(0),0);
  assert.equal(u.stars.geometry.attributes.aArrival.getX(0),-20);
  assert.equal(u.stars.geometry.attributes.aEntryReveal.getX(0),0);
  assert.equal(u.stars.geometry.attributes.aEntryReveal.getX(2),1);
  u.stars.geometry.dispose();u.starMaterial.dispose();
});

test('account stars reveal in parallel as the nebula forms and finish within two seconds',()=>{
  const u=Object.create(Universe.prototype);
  u.config={lightDuration:2,textHold:1,textMorphDuration:1.7,logoHold:.6,nebulaDuration:6};
  const nebulaStart=5.3;
  u.reduced=false;
  assert.equal(u.entryAccountReveal(nebulaStart-.1),0);
  assert.equal(u.entryAccountReveal(nebulaStart),0);
  assert.ok(u.entryAccountReveal(nebulaStart+.6)>0);
  assert.ok(u.entryAccountReveal(nebulaStart+.6)<1);
  assert.ok(Math.abs(u.entryAccountReveal(nebulaStart+1)-.5)<1e-10);
  assert.equal(u.entryAccountReveal(nebulaStart+2),1);
  u.reduced=true;
  assert.equal(u.entryAccountReveal(0),1);
});

test('entry-hidden stars cannot be picked and meteor landings bypass the entry fade',()=>{
  const u=Object.create(Universe.prototype);
  u.accountReveal=0;
  u.uniforms={uAccountReveal:{value:0}};
  u.stars={geometry:new THREE.BufferGeometry()};
  u.stars.geometry.setAttribute('aVisible',new THREE.Float32BufferAttribute([1,1,0],1));
  u.stars.geometry.setAttribute('aEntryReveal',new THREE.Float32BufferAttribute([1,0,0],1));
  assert.equal(u.isAccountStarVisible(0),false);
  assert.equal(u.isAccountStarVisible(1),true);
  assert.equal(u.isAccountStarVisible(2),false);
  u.setAccountEntryReveal(0,0);
  assert.equal(u.isAccountStarVisible(0),true);
  u.stageAccountsForEntry();
  assert.equal(u.stars.geometry.attributes.aVisible.getX(2),0);
  assert.equal(u.stars.geometry.attributes.aEntryReveal.getX(0),1);
  u.stars.geometry.dispose();
});

test('switching intro language updates text particles without moving the camera or restarting entry',()=>{
  const u=view();u.config={slogan:'中文'};u.uniforms={uTextMorph:{value:.4}};
  u.historyBaseCount=2;u.history={geometry:new THREE.BufferGeometry()};
  u.history.geometry.setAttribute('aTextPosition',new THREE.Float32BufferAttribute(new Float32Array(15),3));
  u.history.geometry.setAttribute('aTextVisible',new THREE.Float32BufferAttribute(new Float32Array(5).fill(1),1));
  const original=u.camera.position.clone(),rotation=u.camera.quaternion.clone(),clock={elapsed:2.5};u.entryClock=clock;
  u.sampleEntryText=()=>[[1,2,3],[4,5,6]];
  u.setSlogan('English');
  assert.equal(u.config.slogan,'English');assert.deepEqual(u.camera.position.toArray(),original.toArray());
  assert.deepEqual(u.camera.quaternion.toArray(),rotation.toArray());assert.equal(u.entryClock,clock);
  assert.deepEqual([u.history.geometry.attributes.aTextPosition.getX(2),u.history.geometry.attributes.aTextPosition.getX(3)],[1,4]);
  assert.equal(u.history.geometry.attributes.aTextVisible.getX(4),0);
  u.history.geometry.dispose();
});

test('account star bright cores follow the lifespan size range and keep a glow sprite',()=>{
  assert.equal(accountStarCssDiameter(0,44,44),ACCOUNT_STAR_MIN_CSS_DIAMETER);
  assert.equal(accountStarCssDiameter(1,44,44),ACCOUNT_STAR_MAX_CSS_DIAMETER);
  for(const [scale,depth,reference,twinkle] of [[0,20,44,-1],[.5,44,44,.7],[1,90,44,1]]){
    const diameter=accountStarCssDiameter(scale,depth,reference,twinkle,1);
    assert.ok(diameter>=ACCOUNT_STAR_MIN_CSS_DIAMETER&&diameter<=ACCOUNT_STAR_MAX_CSS_DIAMETER);
  }
  const cssDiameter=accountStarCssDiameter(.5,44,44,.4,1);
  assert.equal(accountStarFramebufferDiameter(cssDiameter,2),cssDiameter*ACCOUNT_STAR_GLOW_SCALE*2);
  assert.equal(accountStarCssDiameter(.5,44,44,-1,0),accountStarCssDiameter(.5,44,44,1,0));
});

test('account star phase and speed are stable per ID, independent between IDs, and survive reordering',()=>{
  const a={id:'stable-a',position:[0,0,0],started:'2026-10-01',date:'2026-10-30'};
  const b={id:'stable-b',position:[1,0,0],started:null,date:'2026-10-30'};
  const u=Object.create(Universe.prototype);
  Object.assign(u,{accounts:[],accountReveal:1,group:{remove(){},add(){}},starMaterial:new THREE.PointsMaterial()});
  u.setAccounts([a,b]);
  const sample=(index)=>({
    phase:u.stars.geometry.attributes.aPhase.getX(index),
    speed:u.stars.geometry.attributes.aSpeed.getX(index),
    breathPhase:u.stars.geometry.attributes.aBreathPhase.getX(index),
    breathSpeed:u.stars.geometry.attributes.aBreathSpeed.getX(index),
  });
  const initial={a:sample(0),b:sample(1)};
  assert.notDeepEqual(initial.a,initial.b);
  assert.notEqual(initial.a.breathPhase,initial.b.breathPhase);
  u.setAccounts([b,a]);
  assert.deepEqual(sample(0),initial.b);
  assert.deepEqual(sample(1),initial.a);
  u.stars.geometry.dispose();u.starMaterial.dispose();
});

test('galaxy spin eases in, settles on hover, and stays still when it should',()=>{
  const spin=()=>{
    const u=view();
    Object.assign(u,{group:new THREE.Group(),cardView:false,selected:-1,hovered:-1,pointerDown:null,meteor:null});
    return u;
  };
  const u=spin();
  u.updateGalaxySpin(1/60,1);
  assert.ok(u.spinVelocity>0&&u.spinVelocity<GALAXY_SPIN_SPEED*.05,'starts gently, no jump to full speed');
  for(let i=0;i<60*15;i++)u.updateGalaxySpin(1/60,1);
  assert.ok(Math.abs(u.spinVelocity-GALAXY_SPIN_SPEED)<GALAXY_SPIN_SPEED*.01);
  assert.ok(u.group.rotation.z>0);
  u.hovered=3;
  for(let i=0;i<90;i++)u.updateGalaxySpin(1/60,1);
  assert.equal(u.spinVelocity,0);
  const held=u.group.rotation.z;u.updateGalaxySpin(1/60,1);
  assert.equal(u.group.rotation.z,held);

  for(const setup of [x=>{x.reduced=true;},x=>{x.controls.target.set(6,1,0);},x=>{x.selected=0;}]){
    const still=spin();setup(still);
    for(let i=0;i<120;i++)still.updateGalaxySpin(1/60,1);
    assert.equal(still.group.rotation.z,0);
  }
  const forming=spin();
  for(let i=0;i<120;i++)forming.updateGalaxySpin(1/60,.6);
  assert.equal(forming.group.rotation.z,0);
});
