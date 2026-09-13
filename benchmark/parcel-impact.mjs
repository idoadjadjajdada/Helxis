// Reproducible resolution experiment; reports outcomes, does not prescribe them.
// node benchmark/parcel-impact.mjs [count ...]
import { Body } from '../src/core/body.js';
import { World } from '../src/core/world.js';
import { G, M_EARTH, M_MOON } from '../src/core/const.js';

const counts=process.argv.slice(2).map(Number);
for(const count of counts.length?counts:[800]) {
  const w=new World({grainCount:count,grainCap:Math.max(4200,count+100)});
  const a=new Body({mass:.9*M_EARTH,composition:{iron:.32,silicate:.68},temperature:900,differentiation:1,seed:7});
  const b=new Body({mass:.13*M_EARTH,composition:{iron:.25,silicate:.75},temperature:900,differentiation:1,seed:8});
  const rs=a.radius+b.radius, speed=1.08*Math.sqrt(2*G*(a.mass+b.mass)/rs), impact=.85;
  b.x=rs*Math.sqrt(1-impact*impact);b.y=rs*impact;b.vx=-speed;
  w.add(a);w.add(b);w.shatterInto(a,b);
  const g=w.grains, initial=g.summarise(Array.from({length:g.n},(_,i)=>i));
  const start=performance.now();let time=0,steps=0;
  while(time<7500 && steps<5000 && performance.now()-start<90000) {const h=Math.min(w.grainStep(g),7500-time);g.step(h);time+=h;steps++;}
  const groups=g.clusters().sort((a,b)=>g.summarise(b).mass-g.summarise(a).mass);
  const largest=g.summarise(groups[0]), inside=new Set(groups[0]);let bound=0,ejected=0;
  for(let i=0;i<g.n;i++)if(!inside.has(i)) {
    const r=Math.hypot(g.x[i]-largest.x,g.y[i]-largest.y),v2=(g.vx[i]-largest.vx)**2+(g.vy[i]-largest.vy)**2;
    ejected+=g.mass[i]; if(v2/2-G*largest.mass/r<0)bound+=g.mass[i];
  }
  const final=g.summarise(Array.from({length:g.n},(_,i)=>i));
  console.log(JSON.stringify({requested:count,parcels:g.n,seconds:time,complete:time>=7500,steps,wallSeconds:(performance.now()-start)/1000,
    largestEarthMass:largest.mass/M_EARTH,boundOutsideClusterLunarMass:bound/M_MOON,
    outsideClusterLunarMass:ejected/M_MOON,molten:final.molten,
    massRelativeError:final.mass/initial.mass-1,
    momentumRelativeError:Math.hypot(final.vx-initial.vx,final.vy-initial.vy)/Math.max(1,Math.hypot(initial.vx,initial.vy))}));
}
