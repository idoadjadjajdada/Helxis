import test from 'node:test';
import assert from 'node:assert/strict';
import { GrainSystem } from '../src/core/grains.js';
import { solveFluid } from '../src/core/fluid.js';
import { matIndex } from '../src/core/cells.js';
import { MATERIALS } from '../src/core/materials.js';
import { Body } from '../src/core/body.js';
import { World } from '../src/core/world.js';

const close = (a, b, tolerance = 1e-12) => assert.ok(Math.abs(a-b) <= tolerance * Math.max(1,Math.abs(a),Math.abs(b)), `${a} vs ${b}`);
function patch(spacing = 2, temperature = 2000, unequal = false) {
  const g = new GrainSystem({cap:200});
  for (let y=-5;y<=5;y++) for(let x=-5;x<=5;x++) {
    g.add(spacing*(x+(y&1)*0.5),spacing*y*Math.sqrt(3)/2,0,0,
      unequal ? 1+((x+y+10)%4) : 1,matIndex('silicate'),temperature,1);
  }
  return g;
}
function totals(g) {
  let mass=0,x=0,y=0,px=0,py=0;
  for(let i=0;i<g.n;i++) {const m=g.mass[i];mass+=m;x+=m*g.x[i];y+=m*g.y[i];px+=m*g.vx[i];py+=m*g.vy[i];}
  return {mass,x,y,px,py};
}
function densityAt(g,i) {
  // Independent direct sum, including self, on a 2D poly6 kernel.
  const h=4*g.r[i]; let sum=0;
  for(let j=0;j<g.n;j++) {const q=Math.hypot(g.x[i]-g.x[j],g.y[i]-g.y[j])/h;
    if(q<1) sum+=g.r[j]**2*(1-q*q)**3;
  }
  return sum/(g.r[i]**2*3.625);
}

test('molten compression converges toward rest density, with unequal masses',()=>{
  const g=patch(1.7,2000,true), before=totals(g), initial=densityAt(g,60);
  solveFluid(g,1,{fluidIterations:96});
  const after=totals(g), final=densityAt(g,60);
  assert.ok(initial>1.35); assert.ok(final<1.025 && final>0.97,`density ${initial} -> ${final}`);
  for(const key of Object.keys(before)) close(after[key],before[key],1e-10);
});

test('undeformed liquid has no spontaneous pressure',()=>{
  const g=patch(), before=totals(g);
  solveFluid(g,1);
  close(densityAt(g,60),1); close(totals(g).px,before.px);
  assert.ok(Math.max(...g.vx.slice(0,g.n).map(Math.abs))<1e-12);
});

test('pressure leaves cold material alone',()=>{
  const g=patch(1.7,250), x=g.x.slice(), y=g.y.slice();
  solveFluid(g,1); assert.deepEqual(g.x,x); assert.deepEqual(g.y,y);
});

test('pressure cannot manufacture kinetic energy from packing error at tiny timesteps',()=>{
  const g=patch(1.7,2000,true);
  for(let i=0;i<g.n;i++){g.vx[i]=-g.x[i];g.vy[i]=-g.y[i];}
  const energy=()=>Array.from({length:g.n},(_,i)=>0.5*g.mass[i]*(g.vx[i]**2+g.vy[i]**2)).reduce((a,b)=>a+b,0);
  const heat=()=>Array.from({length:g.n},(_,i)=>g.mass[i]*g.enthalpy(i)).reduce((a,b)=>a+b,0);
  const kinetic=energy(),thermal=heat();solveFluid(g,1e-6);
  assert.ok(energy()<=kinetic);close(energy()+heat(),kinetic+thermal);
});

test('sparse ejecta do not attract through negative fluid pressure',()=>{
  const g=new GrainSystem();g.add(0,0,0,0,1,2,2000,1);g.add(3,0,0,0,1,2,2000,1);
  solveFluid(g,1);close(g.x[0],0);close(g.x[1],3);close(g.vx[0],0);
});

test('fluid constraint is invariant under a uniform velocity boost',()=>{
  const a=patch(1.8), b=patch(1.8);
  for(let i=0;i<b.n;i++){b.vx[i]=123;b.vy[i]=-78;}
  solveFluid(a,0.4);solveFluid(b,0.4);
  for(let i=0;i<a.n;i++){close(a.x[i],b.x[i]);close(a.y[i],b.y[i]);close(a.vx[i]+123,b.vx[i]);close(a.vy[i]-78,b.vy[i]);}
});

test('contact cannot bounce or heat approaching parcels across a gap',()=>{
  const g=new GrainSystem();g.add(0,0,10,0,1,2,250,1);g.add(2.2,0,-10,0,1,2,250,1);
  g.buildGrid();g.contacts(1,{});close(g.vx[0],10);close(g.vx[1],-10);close(g.temp[0],250);
});

test('fusion consumes latent heat and freezing releases it reversibly',()=>{
  for(const key of ['iron','silicate','ice']) {
    const m=MATERIALS[key], g=new GrainSystem(), mass=7;
    const lo=m.melt*0.86, hi=m.melt*1.14;
    g.add(0,0,0,0,mass,matIndex(key),lo,1);
    const initial=g.enthalpy(0), energy=mass*(m.cp*(hi-lo)+m.latent);
    g.addHeat(0,energy/2);close(g.melt[0],0.5);close(g.temp[0],m.melt);
    g.addHeat(0,energy/2);close(g.melt[0],1);close(g.temp[0],hi);
    g.addHeat(0,-energy);close(g.enthalpy(0),initial);close(g.temp[0],lo);
  }
});

test('a distant compressed clump cannot change local fluid pressure',()=>{
  const a=patch(1.7), b=new GrainSystem({cap:300});
  for(let i=0;i<a.n;i++) b.add(a.x[i],a.y[i],0,0,a.mass[i],a.mat[i],2000,1);
  for(let y=-5;y<=5;y++)for(let x=-5;x<=5;x++) b.add(100+.06*(x+(y&1)*.5),.06*y*Math.sqrt(3)/2,0,0,1e-10,2,2000,.1);
  solveFluid(a,1);solveFluid(b,1);
  for(let i=0;i<a.n;i++){close(a.x[i],b.x[i]);close(a.y[i],b.y[i]);}
});

test('shatter and immediate condensation preserve bulk material, temperature and spin',()=>{
  for(const temperature of [250,1450,2400]) for(const count of [80,400]) {
    const body=new Body({mass:8e21,composition:{iron:.299999,silicate:.7,water:.000001},temperature,
      x:8e8,y:-3e8,vx:345,vy:-876,spin:1e-5,differentiation:1,seed:25});
    const world=new World(), g=world.grains=new GrainSystem({cap:1000});g.addBody(body,count);
    const s=g.summarise(Array.from({length:g.n},(_,i)=>i));
    close(s.mass,body.mass);close(s.x,body.x);close(s.y,body.y);close(s.vx,body.vx);close(s.vy,body.vy);
    close(s.temperature,temperature);close(s.spin,body.spin);
    for(const key in body.composition)close(s.composition[key],body.composition[key]);
    world.condenseGrains(true);assert.equal(world.bodies.length,1);
    const restored=world.bodies[0];close(restored.mass,body.mass);close(restored.temperature,temperature);
    for(const key in body.composition)close(restored.composition[key],body.composition[key]);
    const next=new GrainSystem();next.addBody(restored,count);
    close(next.summarise(Array.from({length:next.n},(_,i)=>i)).molten,s.molten);
  }
});

test('reset removes collision matter and pending time',()=>{
  const w=new World();w.grains=patch();w._grainDebt=100;w._grainAge=20;w.grainsActive=true;
  w.clear();assert.equal(w.grains.n,0);assert.equal(w._grainDebt,0);assert.equal(w.grainsActive,false);
});

test('absorbing a different-material scrap dilutes every existing component',()=>{
  const w=new World(),g=w.grains=new GrainSystem();
  g.add(0,0,0,0,8e20,matIndex('iron'),250,1);
  g.add(10,0,0,0,1e18,matIndex('ice'),250,1);
  w.condenseGrains(true);assert.equal(w.bodies.length,1);
  close(w.bodies[0].composition.iron,8e20/8.01e20);
  close(w.bodies[0].composition.ice,1e18/8.01e20);
});
