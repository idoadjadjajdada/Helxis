// End-to-end check of the visible Giant impact preset, including re-accretion.
// Optional numeric arguments offset the preset's material sampling seeds.
import assert from 'node:assert/strict';
import { World } from '../src/core/world.js';
import { loadPreset } from '../src/ui/presets.js';
import { orbitalElements } from '../src/core/kepler.js';
import { G, DAY, M_EARTH, M_MOON } from '../src/core/const.js';

const seeds = process.argv.slice(2).map(Number);
for (const seed of seeds.length ? seeds : [0]) {
  assert.ok(Number.isFinite(seed));
  const world = new World({ frameBudgetMs: 40, maxGrainSubsteps: 100 });
  loadPreset(world, 'giant-impact');
  for (const body of world.bodies) body.seed += seed;
  const initialMass = world.bodies.reduce((sum, body) => sum + body.mass, 0);
  const started = performance.now(), target = 2 * DAY;
  let impacts = 0, condensations = 0, nextReport = 30000;
  world.on('shatter', () => impacts++);
  world.on('condense', () => condensations++);
  while (world.time < target && performance.now() - started < 240000) {
    world.advance(Math.min(3600, target - world.time));
    if (performance.now() - started > nextReport) {
      console.log(`seed ${seed}: ${(world.time / DAY).toFixed(2)} days, ${world.bodies.length} bodies, ${world.grains?.n || 0} parcels`);
      nextReport += 30000;
    }
  }
  const bodies = [...world.bodies].sort((a, b) => b.mass - a.mass);
  const primary = bodies[0];
  const satellites = bodies.slice(1).map(body => {
    const orbit = orbitalElements(body.x - primary.x, body.y - primary.y,
      body.vx - primary.vx, body.vy - primary.vy, G * (primary.mass + body.mass));
    return { lunarMass: body.mass / M_MOON, bound: orbit?.energy < 0,
      clearsPrimary: orbit?.periapsis > primary.radius + body.radius,
      periapsisInPrimaryRadii: orbit?.periapsis / primary.radius };
  });
  const massError = (bodies.reduce((sum, body) => sum + body.mass, 0)
    + (world.grains?.totalMass() || 0)) / initialMass - 1;
  console.log(JSON.stringify({ seed, completed: world.time >= target, simulatedDays: world.time / DAY,
    wallSeconds: (performance.now() - started) / 1000, impacts, condensations,
    primaryEarthMass: primary?.mass / M_EARTH, massError, satellites: satellites.slice(0, 8) }));
  assert.ok(world.time >= target, 'simulation did not complete the two-day observation window');
  assert.ok(impacts > 0 && condensations > 0, 'the actual parcel path must run');
  assert.ok(Math.abs(massError) < 1e-8, 'impact lost mass');
  assert.ok(satellites.some(s => s.bound && s.clearsPrimary && s.lunarMass >= .4),
    'no substantial moon remained on an orbit that clears the primary');
}
