# Helxis — working notes

A 2D n-body sandbox where collisions are matter hitting matter. Vanilla ES
modules, one canvas, no build step, no dependencies, no network. **Keep it that
way**: `README.md` promises "copy the folder anywhere and serve it and you have
the whole thing", and anything that reaches outside the folder at runtime breaks
that promise.

```
npm start     # http://localhost:4173/  — the app. No build step.
npm test      # test/physics.test.mjs   — ~5 min, 287 checks, prints progress to stderr
node scripts/build-artifact.mjs   # one self-contained HTML file in build/
```

---

## Where things are

Read this before grepping. Nothing here is a restructure — the tree was already
sensible; this is the map that was missing.

### `src/core/` — the simulation. No DOM, no canvas, no rendering imports.

| file | lines | what lives here |
|---|---|---|
| `world.js` | 1341 | The loop. `advance()`, substep budgets, collision dispatch, `stepGrains`, `condenseGrains`, `relaxFields`. **Start here for anything about time, throttling, or what happens per frame.** |
| `collide.js` | 1261 | The analytic collision path: regime choice (merge / cratering / hit-and-run / disruption / supercatastrophic), fragment layout, circumplanetary discs, tidal disruption. |
| `grains.js` | 862 | The parcel path. Self-gravity, contacts, viscosity, thermal, `settle()` (density sorting). No bodies in it and no outcomes decided. |
| `cells.js` | 796 | A body's interior as cells. `MaterialField`: `build` (from a seed), `fromParcels` (from a collision), `relax` (conduction, convection, density sorting, swirl, slump), `excavate`, `shock`. |
| `body.js` | 683 | `Body`. Radius from mass, composition, temperature, `ensureField`, `syncFromField`, `lifePossibility`. |
| `quadtree.js` | 390 | Barnes-Hut. |
| `materials.js` | 258 | The material table: density, melt, boil, heat capacity, strength. |
| `kepler.js` | 153 | Orbital elements ↔ state vectors. |
| `const.js` | 105 | Physical constants and the `format*` helpers. |
| `rng.js` | 98 | `makeRng`, `hashSeed`, `gaussian`, `fbm`. |

### `src/render/` — drawing only. Never mutates the world.

`renderer.js` (596) draws bodies · `texture.js` (1000) generates sprites,
including `renderCellular` which paints a body's **actual cells** rather than a
seeded pattern · `overlays.js` (381) trails, orbits, vectors · `effects.js` (303)
· `camera.js` (175) · `starfield.js` (140) · `scale.js` (46).

### `src/ui/` — DOM, input, content.

`tools.js` (749) · `ui.js` (737) panels, inspector, transport, speed popover ·
`catalog.js` (693) the body picker's 82 objects · `presets.js` (558) the 15
systems, plus `RING_SYSTEMS`, `MOON_SYSTEMS`, `RETINUES` · `settings.js` (135).

`src/main.js` (664) is the `App`: wiring, placement, the clock, the frame loop.

---

## Where to look for a given question

| question | file, function |
|---|---|
| "the clock is slow / speed control does nothing" | `world.js` → `advance`, `grainBudgetMs`, `grainCapacity` |
| "a collision produced the wrong thing" | `collide.js` → `resolveCollision`, then the `do*` handler for the regime |
| "the debris looks wrong / sits in a ring" | `collide.js` → `doDisruption`'s body loop and `ringLayout` |
| "a planet's insides are wrong" | `cells.js` → `relax` (sorting, swirl, slump) |
| "a planet formed from an impact looks generic" | `world.js` → `condenseGrains`, `MaterialField.fromParcels` |
| "the surface doesn't reflect what happened" | `texture.js` → `renderCellular`; a body needs `body.field` for it |
| "a preset is missing something" | `presets.js`; catalogue bodies in `catalog.js` |

---

## Measurement log (Supabase)

Project `Helxis` / `gfebxmzzzqrritjngtcx`, table `public.measurements`.
**Not part of the app** — it is never read at runtime, RLS is on with no policy,
and the app has no Supabase client. It exists so a later session can ask what a
number used to be instead of spending forty minutes re-deriving it.

```sql
select metric, value, unit, good_low, good_high, note
from measurements order by metric;
```

Check a result against its band before concluding anything has regressed.
Append a row after measuring something expensive; never edit history.

---

## Hard-won, do not rediscover

- **`pkill -f "something.mjs"` kills its own shell**, because the shell's command
  line contains the pattern. Cost me three runs. Filter on `/proc/$p/comm`.
- **The suite prints to stderr as it goes.** A stall looks exactly like slowness
  otherwise. `2> log` and watch the last line to find the guilty section.
- **A suite that hangs is almost always a collision cascade**, not a slow test.
  Bodies climb 2 → 500 inside a simulated day. Print `w.bodies.length` per
  `advance` call and it is obvious in seconds.
- **Debris at different orbital radii lap each other and collide**, and on the
  analytic path every collision makes fragments that lap in turn. Co-orbital
  debris at one shared radius is stable. This is why the circumplanetary disc
  puts every clump at the same radius — it is load-bearing, not laziness.
- **A cloud expands without crossings only when `v = H·r`.** Any velocity floor
  (`a + b·r` with `a > 0`) has inner pieces overtaking outer ones.
- **Physics must not depend on `body.id`** — that is allocation order. Seed from
  `body.seed`. Still half-true: `condenseGrains` makes bodies without explicit
  seeds, so they fall back to `hashSeed(name, id)`. **Open.**
- **Ring particles orbit in hours**, planets in months. The step chooser is
  global, so rings set the pace for the whole scene — the solar system runs
  ~190× slower with them. That is what `planetaryRings` switches.
- **`GrainSystem.add` takes positional args**, not an options object. Passing an
  object gives NaN positions and a pathologically slow grid.
- **`relax`'s `step` is `dt / coolSeconds`** and measures 6e-10 to 5e-3 in a real
  magma ocean. Anything scaled by it rounds to 1. Measure before adding a knob.

---

## House style

Comments say **why**, and cite the measurement that forced the decision — the
existing ones do this and they are the reason this codebase can be picked back
up. No decorative code: if a knob cannot be shown to change a number, delete it.
When something looks wrong on screen, the bug is the model, not the pixels.
