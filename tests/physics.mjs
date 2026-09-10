/* Helxis acceptance tests.
 *
 * These are physical rather than behavioural, because those are the ones
 * that catch an integrator regression that no amount of clicking around
 * would reveal.  The simulation is driven with an exact dt so results do
 * not depend on machine speed.
 *
 *   node tests/physics.mjs
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGE = 'file://' + path.join(HERE, '..', 'index.html');

let pass = 0, fail = 0, skipped = 0;
const results = [];
let t0 = Date.now();
function check(name, ok, detail, stochastic) {
  const tag = ok ? ' ok ' : stochastic ? 'flky' : 'FAIL';
  if (ok) pass++; else if (stochastic) skipped++; else fail++;
  results.push([tag, name, detail]);
  console.log(`${tag}  ${name}  ${detail}   [${((Date.now() - t0) / 1000).toFixed(1)}s]`);
  t0 = Date.now();
}
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-30);

const browser = await chromium.launch();
const page = await browser.newPage();
page.setDefaultTimeout(0);
/* Two of these tests drive tens of thousands of steps.  Doing that in one
 * synchronous block holds the renderer for five minutes at a stretch, and
 * a renderer that never yields is a renderer Chromium is entitled to kill
 * - which is exactly how this suite used to die mid-run.  `stepMany` is
 * installed in the page and yields between chunks; the clock is paused
 * throughout, so the animation frames that fire in the gap draw and do
 * not integrate.                                                         */
await page.addInitScript(() => {
  window.stepMany = async (n, dt, chunk = 200) => {
    for (let i = 0; i < n; i += chunk) {
      helxis.run(dt, Math.min(chunk, n - i));
      await new Promise(r => setTimeout(r, 0));
    }
  };
});
page.on('pageerror', e => { fail++; results.push(['FAIL', 'page error', e.message]); });
await page.goto(PAGE);
await page.waitForFunction(() => !!window.helxis);
const run = fn => page.evaluate(fn);

/* -- 1. a circular orbit stays circular --------------------------------- */
{
  const r = await run(() => {
    helxis.preset('Empty sky'); helxis.paused(true);
    const sun = helxis.add({ x: 0, y: 0, m: helxis.K.SUN_MASS, f: { HHe: 1 }, T: 5772,
                             R: 3, fusing: true, name: 'sun' });
    const v = Math.sqrt(helxis.K.G * helxis.K.SUN_MASS) * 150 / Math.pow(150 * 150 + helxis.K.SOFT2, 0.75);
    const p = helxis.add({ x: 150, y: 0, vx: 0, vy: v, m: 1, f: { Si: 1 }, T: 288, name: 'p' });
    const o0 = helxis.orbit(p);
    const T = o0.T;
    const dt = T / 1200;
    for (let i = 0; i < 1200 * 20; i++) helxis.step(dt);   // twenty laps
    const o1 = helxis.orbit(p);
    return { e0: o0.e, e1: o1.e, a0: o0.a, a1: o1.a };
  });
  check('circular orbit stays circular (20 laps)',
    r.e1 < 2e-3 && rel(r.a0, r.a1) < 2e-4,
    `e ${r.e0.toExponential(2)} -> ${r.e1.toExponential(2)}, a drift ${rel(r.a0, r.a1).toExponential(2)}`);
}

/* -- 2. total energy does not drift on a closed system ------------------ */
{
  const r = await run(() => {
    helxis.preset('Empty sky'); helxis.paused(true);
    helxis.add({ x: 0, y: 0, m: helxis.K.SUN_MASS, f: { HHe: 1 }, T: 5772, R: 3, fusing: true });
    for (const [a, e] of [[150, 0.0], [230, 0.21], [420, 0.35]]) {
      const rp = a * (1 - e);
      const v = Math.sqrt(helxis.K.G * helxis.K.SUN_MASS * (1 + e) / rp);
      helxis.add({ x: rp, y: 0, vx: 0, vy: v, m: 1, f: { Fe: .3, Si: .7 }, T: 288 });
    }
    const E0 = helxis.energy().total;
    const dt = helxis.yearUnit() / 1500;
    for (let i = 0; i < 1500 * 40; i++) helxis.step(dt);   // forty years
    return { E0, E1: helxis.energy().total };
  });
  check('energy does not drift on a closed system (40 yr)',
    rel(r.E0, r.E1) < 1e-4, `relative drift ${rel(r.E0, r.E1).toExponential(2)}`);
}

/* -- 3. momentum is exact with no rubble in play ------------------------ */
{
  const r = await run(() => {
    helxis.preset('Empty sky'); helxis.paused(true);
    helxis.add({ x: -40, y: 0, vx: 0.3, vy: 1.2, m: 40, f: { Si: 1 }, T: 300 });
    helxis.add({ x: 60, y: 20, vx: -0.7, vy: 0.4, m: 25, f: { Fe: 1 }, T: 300 });
    helxis.add({ x: 10, y: -90, vx: 1.1, vy: -0.9, m: 12, f: { H2O: 1 }, T: 200 });
    const p0 = helxis.momentum();
    for (let i = 0; i < 20000; i++) helxis.step(0.012);
    const p1 = helxis.momentum();
    const s = Math.hypot(p0.px, p0.py) || 1;
    return { d: Math.hypot(p1.px - p0.px, p1.py - p0.py) / s };
  });
  check('momentum exact with no rubble in play', r.d < 1e-9, `drift ${r.d.toExponential(2)}`);
}

/* -- 4. per-material mass through a shatter ----------------------------- */
{
  const r = await run(() => {
    helxis.preset('Empty sky'); helxis.paused(true);
    const id = helxis.add({ x: 0, y: 0, m: 2.4, f: { Fe: .3, Si: .5, C: .05, H2O: .1, HHe: .05 }, T: 2600 });
    const m0 = helxis.mass();
    helxis.shatter(id);
    const m1 = helxis.mass();
    return { m0, m1, motes: helxis.motes() };
  });
  const bad = ['Fe', 'Si', 'C', 'H2O', 'HHe'].filter(k => rel(r.m0[k], r.m1[k]) > 1e-12);
  check('per-material mass exact through a shatter', bad.length === 0 && r.motes > 100,
    bad.length ? 'drifted: ' + bad.join(',') : `${r.motes} motes, all five exact`);
}

/* -- 5. per-material mass through a melt merge -------------------------- */
{
  const r = await run(async () => {
    helxis.preset('Head-on merge'); helxis.paused(true);
    const m0 = helxis.mass();
    await stepMany(6000, 0.02);
    return { m0, m1: helxis.mass(), motes: helxis.motes(), bodies: helxis.list().length };
  });
  const bad = ['Fe', 'Si', 'C', 'H2O', 'HHe'].filter(k => rel(r.m0[k], r.m1[k]) > 1e-9);
  check('per-material mass conserved through a melt merge', bad.length === 0,
    bad.length ? 'drifted: ' + bad.map(k => `${k} ${rel(r.m0[k], r.m1[k]).toExponential(1)}`).join(', ')
               : `total ${r.m1.total.toFixed(6)} M⊕ intact`);
}

/* -- 6. momentum with a cloud sloshing ---------------------------------- */
{
  const r = await run(() => {
    helxis.preset('Head-on merge'); helxis.paused(true);
    const p0 = helxis.momentum();
    let worst = 0, scale = 0;
    for (let k = 0; k < 150; k++) {
      for (let i = 0; i < 30; i++) helxis.step(0.02);
      const p = helxis.momentum();
      /* the preset starts from rest, so the total is zero and has no size
       * of its own.  The yardstick is the momentum actually moving about
       * inside the cloud, which is what a leak would be stealing from.  */
      if (p.scalar > scale) scale = p.scalar;
      const d = Math.hypot(p.px - p0.px, p.py - p0.py);
      if (d > worst) worst = d;
    }
    return { worst: worst / Math.max(scale, 1e-12), abs: worst, scale };
  });
  check('momentum holds to a part in a thousand with a cloud sloshing',
    r.worst < 1e-3,
    `worst excursion ${r.worst.toExponential(2)} of the cloud's own ` +
    `${r.scale.toExponential(2)} of internal momentum`);
}

/* -- 6b. momentum with bodies AND rubble in the same sky ----------------- *
 *  This is the gap the sloshing test could not see.  A head-on merge ends
 *  up all rubble, so a body that pulls on a mote and feels nothing back
 *  costs nothing there.  Put a world next to a cloud and it costs four
 *  percent.                                                              */
{
  const r = await run(() => {
    helxis.preset('Empty sky'); helxis.paused(true);
    const heavy = helxis.add({ x: 0, y: 0, m: 6, f: { Fe: .32, Si: .68 }, T: 300 });
    const H = helxis.get(heavy);
    const light = helxis.add({ x: H.radius * 4, y: 0, vy: 0.35, m: 0.5,
                               f: { Fe: .3, Si: .6, H2O: .1 }, T: 900 });
    helxis.shatter(light);
    const p0 = helxis.momentum();
    let worst = 0, scale = 0;
    for (let k = 0; k < 120; k++) {
      for (let i = 0; i < 25; i++) helxis.step(0.004);
      const p = helxis.momentum();
      if (p.scalar > scale) scale = p.scalar;
      const d = Math.hypot(p.px - p0.px, p.py - p0.py);
      if (d > worst) worst = d;
    }
    return { rel: worst / Math.max(scale, 1e-12), scale,
             bodies: helxis.list().length, motes: helxis.motes() };
  });
  check('momentum holds with a world and its rubble in the same sky',
    r.rel < 1e-3,
    `worst excursion ${r.rel.toExponential(2)} of ${r.scale.toExponential(2)}, ` +
    `ending with ${r.bodies} bod${r.bodies === 1 ? 'y' : 'ies'} and ${r.motes} motes`);
}

/* -- 7. a molten rock world merged with a gas giant makes no new rock ---- */
{
  const r = await run(async () => {
    helxis.preset('Empty sky'); helxis.paused(true);
    const a = helxis.add({ x: -40, y: 0, m: 3, f: { Fe: .3, Si: .7 }, T: 2200 });   // molten rock
    const b = helxis.add({ x: 40, y: 0, m: 40, f: { HHe: .95, Si: .05 }, T: 400 }); // gas
    const A = helxis.get(a), B = helxis.get(b);
    const v = 0.55 * Math.sqrt(helxis.K.G * (A.mass + B.mass) / (A.radius + B.radius));
    A.vx = v * B.mass / (A.mass + B.mass); B.vx = -v * A.mass / (A.mass + B.mass);
    const m0 = helxis.mass();
    await stepMany(7000, 0.02);
    return { m0, m1: helxis.mass(), list: helxis.list().map(x => ({ cls: x.cls, m: x.m })) };
  });
  const rock0 = r.m0.Fe + r.m0.Si + r.m0.C, rock1 = r.m1.Fe + r.m1.Si + r.m1.C;
  check('molten rock plus gas giant creates zero new rock',
    rel(rock0, rock1) < 1e-9,
    `rock ${rock0.toFixed(6)} -> ${rock1.toFixed(6)} M⊕`);
}

/* -- 8. the class name is a function of the composition ------------------ */
{
  const r = await run(() => {
    helxis.preset('Empty sky'); helxis.paused(true);
    const out = {};
    const mk = (f, m, T) => helxis.className(helxis.add({ x: 1e5 * Math.random(), y: 0, m, f, T }));
    out.iron70   = mk({ Fe: .70, Si: .30 }, 1.2, 400);
    out.rock     = mk({ Fe: .32, Si: .68 }, 1.0, 288);
    out.carbon   = mk({ Fe: .25, C: .45, Si: .30 }, 2, 700);
    out.gas      = mk({ HHe: .92, Si: .08 }, 318, 130);
    out.stripped = mk({ Fe: .35, Si: .65 }, 8, 1900);
    out.super    = mk({ Fe: .30, Si: .70 }, 6, 320);
    out.asteroid = mk({ Fe: .2, Si: .8 }, 3e-4, 200);
    return out;
  });
  const want = { iron70: 'iron world', rock: 'rocky world', carbon: 'carbon world',
                 gas: 'gas giant', stripped: 'stripped core', super: 'super-Earth',
                 asteroid: 'asteroid' };
  const wrong = Object.keys(want).filter(k => r[k] !== want[k]);
  check('the class name is read off the composition', wrong.length === 0,
    wrong.length ? wrong.map(k => `${k}: got ${r[k]}, want ${want[k]}`).join('; ')
                 : Object.values(r).join(', '));
}

/* -- 9. a moon at the softened circular speed stays on its planet -------- */
{
  const r = await run(async () => {
    helxis.preset('Empty sky'); helxis.paused(true);
    const p = helxis.add({ x: 0, y: 0, m: 1, f: { Fe: .32, Si: .68 }, T: 288 });
    const P = helxis.get(p);
    const rr = P.radius * 2.6;
    const eps2 = helxis.K.SOFT2;
    const v = Math.sqrt(helxis.K.G * P.mass) * rr / Math.pow(rr * rr + eps2, 0.75);
    const m = helxis.add({ x: rr, y: 0, vx: 0, vy: v, m: 0.0123, f: { Si: 1 }, T: 250 });
    const o0 = helxis.orbit(m);
    const dt = helxis.yearUnit() / 6000;
    await stepMany(6000 * 2, dt);                             // two simulated years
    const o1 = helxis.orbit(m);
    /* what the textbook sqrt(GM/r) would have launched it at */
    const naive = Math.sqrt(helxis.K.G * P.mass / rr);
    return { e0: o0.e, e1: o1 ? o1.e : null, a0: o0.a, a1: o1 ? o1.a : null,
             overspeed: naive / v };
  });
  check('softened circular speed keeps a close moon on its planet',
    r.e1 !== null && r.e1 < 0.05 && rel(r.a0, r.a1) < 0.02,
    `e ${r.e1 === null ? 'escaped' : r.e1.toFixed(4)}; the textbook speed would have been ` +
    `${((r.overspeed - 1) * 100).toFixed(0)}% too fast`);
}

/* -- 10. the giant impact leaves an iron-poor moon ----------------------- */
{
  const r = await run(async () => {
    helxis.preset('Giant impact'); helxis.paused(true);
    const start = helxis.list();
    const proto = start.find(b => b.name === 'proto-Earth');
    const c0 = helxis.composition(proto.id);
    const feProto = c0.Fe / (c0.Fe + c0.Si + c0.C + c0.H2O + c0.HHe);
    const m0 = helxis.mass();
    await stepMany(9000, 0.02);
    const startIds = start.map(b => b.id);
    const bodies = helxis.list().sort((a, b) => b.m - a.m);
    const out = bodies.map(b => {
      const c = helxis.composition(b.id);
      const t = c.Fe + c.Si + c.C + c.H2O + c.HHe;
      return { id: b.id, cls: b.cls, m: b.m, fe: t > 0 ? c.Fe / t : 0 };
    });
    /* clumps that have not settled yet still count as candidate moons */
    const cl = helxis.clumps().map(c => {
      const t = c.comp.reduce((a, b) => a + b, 0);
      return { m: t, fe: t > 0 ? c.comp[0] / t : 0, n: c.n };
    }).filter(c => c.m > 1e-4);
    return { feProto, out, cl, m0, m1: helxis.mass(), motes: helxis.motes(), startIds };
  });
  const bad = ['Fe', 'Si', 'C', 'H2O', 'HHe'].filter(k => rel(r.m0[k], r.m1[k]) > 1e-9);
  check('giant impact conserves every material', bad.length === 0,
    bad.length ? 'drifted: ' + bad.join(',') : 'all five exact');

  /* the moon is what the impact THREW, so the two bodies that started the
   * preset are not candidates however much mass they have shed             */
  const cands = [...r.out.filter(b => !r.startIds.includes(b.id)), ...r.cl]
    .filter(c => c.m > 1e-4 && c.m < r.out[0].m * 0.5);
  const best = cands.sort((a, b) => b.m - a.m)[0];
  check('giant-impact debris is iron-poor compared with the proto-Earth',
    !!best && best.fe < r.feProto,
    best ? `proto-Earth Fe ${(r.feProto * 100).toFixed(1)}%, largest debris ${(best.fe * 100).toFixed(1)}% ` +
           `at ${best.m.toExponential(2)} M⊕`
         : `no debris above 1e-4 M⊕ survived (${r.out.length} bodies, ${r.motes} motes)`,
    true);
}

/* ---------------------------------------------------------------------- */
await browser.close();
console.log(`\n${pass} passed, ${fail} failed, ${skipped} stochastic`);
process.exit(fail ? 1 : 0);
