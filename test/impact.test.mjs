import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/core/world.js';
import { Body } from '../src/core/body.js';
import { GrainSystem } from '../src/core/grains.js';
import { matIndex } from '../src/core/cells.js';
import { G, M_EARTH, M_MOON } from '../src/core/const.js';
import { loadPreset } from '../src/ui/presets.js';
import { instantiate, CATALOG_BY_ID } from '../src/ui/catalog.js';

const indices = g => Array.from({length:g.n},(_,i)=>i);
const close = (a,b,tol=1e-10) => assert.ok(Math.abs(a-b)<=tol*Math.max(1,Math.abs(a),Math.abs(b)), `${a} vs ${b}`);

test('Saturn carries ring bands through placement, save/load, and the Solar System',()=>{
  const s=instantiate(CATALOG_BY_ID.get('saturn'));
  assert.equal(s.rings.length,3);assert.deepEqual(Body.fromJSON(s.toJSON()).rings,s.rings);
  const w=new World();loadPreset(w,'solar-system');
  const saturn=w.bodies.find(b=>b.catalogId==='saturn');assert.equal(saturn.rings.length,3);
  for(const id of ['titan','enceladus']) {
    const moon=w.bodies.find(b=>b.catalogId===id);assert.ok(moon);
    const r=Math.hypot(moon.x-saturn.x,moon.y-saturn.y),v=Math.hypot(moon.vx-saturn.vx,moon.vy-saturn.vy);
    assert.ok(v*v<2*G*(saturn.mass+moon.mass)/r);
  }
});

test('iron placed outside a molten silicate interior sinks through it',()=>{
  const g=new GrainSystem();g.addBody(new Body({mass:M_EARTH,composition:{iron:.32,silicate:.68},temperature:2400,differentiation:1,seed:7}),400);
  const order=indices(g).sort((a,b)=>Math.hypot(g.x[a],g.y[a])-Math.hypot(g.x[b],g.y[b]));
  for(let k=0;k<Math.floor(order.length/2);k++)for(const key of ['mat','mass','rho0']) {
    const a=order[k],b=order[order.length-1-k],tmp=g[key][a];g[key][a]=g[key][b];g[key][b]=tmp;
  }
  const meanRadii=()=>{
    const s=g.summarise(order);let iron=0,im=0,rock=0,rm=0;
    for(const i of order){const r=Math.hypot(g.x[i]-s.x,g.y[i]-s.y);if(g.mat[i]===matIndex('iron')){iron+=g.mass[i]*r;im+=g.mass[i];}else{rock+=g.mass[i]*r;rm+=g.mass[i];}}
    return {ratio:(iron/im)/(rock/rm),ironMass:im,rockMass:rm};
  };
  const before=meanRadii(),w=new World();assert.ok(before.ratio>1.5);
  for(let i=0;i<5000;i++)g.step(Math.min(2,w.grainStep(g)));
  const after=meanRadii();assert.ok(after.ratio<0.8,`radial ratio ${before.ratio} -> ${after.ratio}`);
  close(after.ironMass,before.ironMass);close(after.rockMass,before.rockMass);
});

test('a compact hot rotating cluster can condense without waiting for cooling',()=>{
  const w=new World(),g=w.grains=new GrainSystem();
  const b=new Body({mass:M_EARTH,composition:{iron:.32,silicate:.68},temperature:2400,spin:1e-4,differentiation:1});
  g.addBody(b,400);w._grainAge=600;w.condenseGrains();
  assert.equal(g.n,0);assert.equal(w.bodies.length,1);close(w.bodies[0].mass,b.mass);close(w.bodies[0].temperature,2400);
});

test('forced condensation preserves an orbiting annulus instead of swallowing it',()=>{
  const w=new World(),g=w.grains=new GrainSystem();
  const primary=new Body({mass:M_EARTH,composition:{silicate:1},temperature:2400});
  g.addBody(primary,200);
  const r=primary.radius*4,n=60,v=Math.sqrt(G*primary.mass/r);
  for(let i=0;i<n;i++){const a=i/n*2*Math.PI;g.add(Math.cos(a)*r,Math.sin(a)*r,-Math.sin(a)*v,Math.cos(a)*v,M_MOON/n,matIndex('silicate'),2000,r*.06);}
  const initial=g.summarise(indices(g));w.condenseGrains(true);
  const planet=w.bodies.reduce((a,b)=>a.mass>b.mass?a:b),rest=w.bodies.filter(b=>b!==planet);
  assert.equal(g.n,0);assert.ok(rest.length>=n);close(rest.reduce((m,b)=>m+b.mass,0),M_MOON);
  close(w.bodies.reduce((m,b)=>m+b.mass,0),initial.mass);
  for(const b of rest)assert.ok(Math.hypot(b.x-planet.x,b.y-planet.y)>primary.radius*3);
});

test('collision time follows speed, drops old requests, and keeps surviving bodies synchronized',()=>{
  const make=()=>{
    const w=new World({frameBudgetMs:1e6,maxGrainSubsteps:4,collisions:false});
    const g=w.grains=new GrainSystem();g.add(0,0,100,0,1e10,matIndex('silicate'),2400,1e5);
    w.add(new Body({mass:1e10,x:1e10,vx:5,composition:{silicate:1}}));return w;
  };
  const slow=make(),fast=make();const low=slow.advance(.1),high=fast.advance(100000);
  close(low,.1);assert.ok(high>low*10);assert.ok(fast.throttled);assert.equal(fast._grainDebt,0);
  const t=fast.time;close(fast.advance(.001),.001);close(fast.time-t,.001);assert.equal(fast.throttled,false);
  close(fast.bodies[0].x,1e10+5*fast.time,1e-9);
});

test('molten integration respects the pressure-wave timestep even from rest',()=>{
  const g=new GrainSystem(),w=new World();g.add(0,0,0,0,1,matIndex('silicate'),2400,1);
  assert.ok(w.grainStep(g)<=g.soundStep());
  const rho=g.rho0[0];g.add(3,0,0,0,2,matIndex('iron'),2400,2);const next=g.rho0[1];g.remove(0);close(g.rho0[0],next);assert.notEqual(rho,next);
});


test('small debris reimpacts do not restart planet-scale parcels',()=>{
  const w=new World();
  const earth=new Body({mass:M_EARTH,composition:{silicate:1}});
  const a=new Body({mass:2e21,composition:{silicate:1},x:1e8,vx:3000});
  const b=new Body({mass:2e21,composition:{silicate:1},x:1e8+1e6,vx:-3000});
  w.add(earth);w.add(a);w.add(b);assert.equal(w.worthShattering(a,b),false);
  w.remove(earth);assert.equal(w.worthShattering(a,b),true);
});
