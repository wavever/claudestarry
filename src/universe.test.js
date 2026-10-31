import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Universe } from './universe.js';

function view() {
  const u=Object.create(Universe.prototype);
  Object.assign(u,{camera:new THREE.PerspectiveCamera(),controls:{target:new THREE.Vector3(),minDistance:.25,maxDistance:600},introActive:false,focusTween:null,reduced:false,zoomTarget:64});
  u.camera.position.set(0,0,64);
  return u;
}

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
  u.stars={geometry:new THREE.BufferGeometry()};
  u.stars.geometry.setAttribute('aArrival',new THREE.Float32BufferAttribute([-10,-20],1));
  u.group={remove(){},add(){}};
  u.starMaterial=new THREE.PointsMaterial();
  u.meteor={id:'b',index:1};
  u.setAccounts([b,a,c]);
  assert.equal(u.meteor.index,0);
  assert.equal(u.stars.geometry.attributes.aVisible.getX(0),0);
  assert.equal(u.stars.geometry.attributes.aArrival.getX(0),-20);
  u.stars.geometry.dispose();u.starMaterial.dispose();
});
