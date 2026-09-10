# Helxis

A pixel-art n-body gravity sandbox in one HTML file. Open `index.html` and it
runs. There is no build step, no dependency, no network request. Fling worlds
into orbit and the mathematics does the rest.

Nothing in this simulation is decorative. If a thing appears on screen, the
state of the simulation put it there. No effect is painted on and no outcome is
special-cased. Where you see a modelling error, that is what it is.

This build covers design steps 1 through 5: the integrator, the material
system, motes, collisions, and settling. Stars still burn as ordinary bodies,
and tides, rings, relativity and lensing are not here yet. The
"[Not built yet](#not-built-yet)" section says exactly what is missing.

---

## The three scales that are chosen rather than measured

Everything else in the file is either measured or falls out of something that
is. These three are picked, and picking them buys something specific.

**The Sun weighs 33,300 Earth masses.** The true figure is 333,000. Compressing
it tenfold makes the Sun visibly circle the barycentre it shares with Jupiter,
which at the true ratio moves it by less than one pixel at any zoom on offer.
Planets keep their real masses, so every planet-to-planet ratio is exact and
only the star is wrong.

**Bodies are drawn 25 times too large.** To scale, Earth's radius is one
156th of a world unit, smaller than a pixel at almost any zoom. Every ratio
between bodies survives; only the common factor is wrong. Below two buffer
pixels nothing is drawn smaller, and at that point the picture stops being to
scale rather than the simulation stopping being right. Fusing bodies and
remnants take a factor of 2 instead of 25, because 25 would put the Sun's own
surface outside Mercury's perihelion.

**Light travels at 1,400 world units per time unit.** The true value is about
45,000. At the true value Mercury's perihelion moves five ten-millionths of a
radian per orbit and nobody would ever see it. This only matters once step 10
lands the relativistic terms.

**The year is derived and never written down.** It is the period of a circular
orbit at one astronomical unit around the star the preset actually built.
Retune the distance scale or the Sun's mass and the readout moves with it
instead of quietly lying. In this build one year is 63.25 time units, and the
HUD says so.

`G` is 1. Everything else is scaled to make that true.

---

## Materials

Every gram of matter is one of five things, and the mass of each is conserved
exactly through every collision, shatter and merge.

| | density (g/cm³) | melts at | to melt from 300 K |
|---|---|---|---|
| Iron | 7.9 | 1810 K | 0.93 MJ/kg |
| Silicate | 3.3 | 1500 K | 1.60 MJ/kg |
| Carbon | 3.5 | 3820 K | 2.62 MJ/kg |
| Water | 1.0 (ice 0.92) | 273 K | 0.59 MJ/kg |
| Hydrogen and helium | 0.09 | none | none |

Those densities are the uncompressed values. Above about a tenth of an Earth
mass a body squeezes itself, and radius follows `M^0.279` rather than
`M^0.333`. That exponent is Chen and Kipping's measured terran fit. Their
Neptunian branch (`M^0.589`) and Jovian branch (`M^-0.044`) carry the curve
through ice giants and gas giants, re-anchored on Jupiter so Saturn lands where
Saturn is. A gas giant flattens near one Jupiter radius and then shrinks, but
it shrinks slowly: the exponent is `-0.044`, not something dramatic. The steep
inverse case is degenerate matter, where radius goes as `M^-1/3`, and that
belongs to white dwarfs.

### Molten is a temperature

There is no molten material and no molten class. A molten world is a rock world
above 1500 K. A molten world and a gas world cannot collide and produce a rocky
world out of nowhere, because the molten one is already rock and the gas one is
already gas. What comes out is rock wearing an envelope, and whether that reads
as a mini-Neptune or a stripped core depends on whether the envelope survives.

Colour comes from material and temperature together. Below about 700 K you see
reflected light and the material's own colour. Above it the hue is the
blackbody hue and the material shows through as light and dark. Tinting a
material toward orange instead turns iron and rock the same shade of sand, and
you lose the two worlds folded into a melt.

### The class name is read off the composition, never stored

`className()` evaluates a fourteen-line ladder against the layer stack and the
mass. First match wins. A body that gains a moon does not change class, because
its composition barely moved. A gas giant that loses its envelope does change
class, because its composition moved enormously. Both fall out of the same
rule. Open the Forge, drag the iron slider past 55%, and watch the label change
to "iron world" on its own.

---

## Collisions

Two worlds meeting is never resolved in one frame. No merge instruction fires
on contact.

Both measurements come off the approach rather than the overlap, because the
overlap is nearly zero at the instant they touch and tells you nothing. The
impact parameter is how far the line one body travels along misses the other's
centre by. The specific impact energy is `½μv²/M` with a floor under it:
assembling one body out of two releases gravitational energy whether they were
moving beforehand or not, and rock is a poor place to put it. For two Earths
that floor is 24 MJ/kg against a melt cost of 1.6. Even a touch at zero
relative velocity leaves a magma ocean, not a seam.

All of this runs in SI, restored from display units, so neither admitted
exaggeration leaks into the energetics.

Four outcomes, and nothing chooses between them by looking at the result:

- **Accretion** when the impactor is under a twenty-fifth of the target and
  arrives gently. Its material joins the target's outermost shell, because that
  is where it landed.
- **Hit-and-run** past an impact parameter of 0.6. The pixels that would have
  been inside the other body are scraped off both, each carrying the material of
  the shell it came from, which for a grazing hit is never the core.
- **Envelope stripping** before anything else. What holds an envelope is `GM/R`
  per kilogram, and that is small. This is what turns giants into cores, and it
  needs no other code path.
- **Merging through a melt** for everything else. Both bodies become motes,
  still carrying the velocity they came in with and their own material. From
  there nothing decides the outcome; the settling rules do.

---

## Settling

A cloud becomes a body again when three things are true at once, none of them
on a timer. Its binding energy beats the motion inside it, measured in its own
frame with the bulk rotation taken out. Its rock is below the melting point,
measured over the rock only, so two gas giants re-form as soon as gravity has
gathered them. And it is round, by the ratio of the principal axes of its own
mass, with the requirement relaxed by whatever tide it is sitting in.

While a cloud is molten, denser motes sink at a rate set by density contrast
over viscosity, and viscosity is steep in temperature because cold rock does
not flow. Cooling races the sort. A large hot melt separates almost completely
and freezes as a clean layered body. A small one, or one that was already
half-solid when it was hit, freezes part-sorted, with iron-rich streaks that
were on their way down and stopped. That interruption is where the swirl comes
from. No noise is added anywhere to produce it.

Heat leaves through the surface. A mote packed among five or six others holds
its heat about twice as long as one out on the skin, and the neighbour count
comes free from the contact pass. The visible result is a melt that darkens
from the outside inward with the glow still showing through, and a middle that
is the last part to go solid.

When a cloud settles, the sprite is projected rather than generated. Each pixel
of the new body takes the material and temperature of the nearest mote. A
grazing hit leaves a visible scar. A body that swallowed an ice moon has a pale
patch where it went in. None of that is authored, and two identical collisions
give two different worlds.

---

## Where this build departs from the design document

The design asked to be argued with. Six places it lost.

**The mass scale could not hold.** It asked for a Sun of 3,000 Earth masses and
every planet lifted twenty-fold. Mass is additive through every merge, so the
mass axis has to be linear, and a linear axis cannot compress the star-to-planet
ratio while leaving planet-to-planet ratios real. Lifting the planets by 20 and
dropping the Sun to 3,000 makes Jupiter weigh 6,356 against its own star's
3,000. A 111-fold compression also inverts the roster: no real brown dwarf
outweighs Jupiter once stars are divided by 111. The Sun is compressed tenfold
instead, and planets keep their true masses.

**The size scale contradicted itself.** Section 2 says 80 times. Section 14 then
works out that the Moon must sit "at two" Earth radii instead of sixty. Sixty
over eighty is 0.75. Sixty over twenty-five is 2.4. Section 14's arithmetic is
the load-bearing one, and 80 also puts the Sun's surface outside Mercury's
perihelion.

**Melting cannot be a fraction of the binding energy.** The design set
liquefaction at a fixed multiple of `Q/Q*`. Melting rock costs an absolute
amount of energy per kilogram; binding energy per kilogram goes as `M/R`. For
Earth, melting costs 4% of `Q*`. For Ceres it costs 2,000% of it. A single
coefficient is 15 times too high at Earth scale and 30 times too low at Ceres
scale. Melting now reads an absolute specific energy per material, and the mass
dependence falls out for free: big worlds always melt, asteroids never do, and
nobody wrote a rule saying so.

**Disruption is not the binding energy either.** The design used
`Q* ≈ 3GM/5R` for both. Taking a body apart costs about three times what
holding it together is worth, because most of what you put in comes back out as
heat rather than as escape. Disruption uses Leinhardt and Stewart's threshold
with `c* = 5`.

**Hot Jupiter was unreachable.** The design's ladder tests `HHe > 0.5` before it
tests the hot-Jupiter rule, so the gas-giant rule swallowed every hot Jupiter.
Hot Jupiter now goes first.

**Two thresholds were off the measured range.** Ice giants were gated at 15%
hydrogen and helium; Uranus and Neptune carry 8 to 15% and both landed at 12%,
outside their own class. The gate is 8% now. And "H2O at the surface > 0.25",
read as the surface shell's own water fraction, scores 1.0 on Earth, whose water
shell is pure water and 0.5% of the planet. It now asks that the water be a
quarter of the body and that it be what you are standing on.

The design's exponent of 0.27 for rock, its coefficient of a quarter for two
worlds touching at mutual escape velocity, its `e²/a^7.5` tidal heating law, its
innermost stable circular orbit at three horizon radii, and its `1/r` light
deflection all check out. So does its worry about the initial-to-final mass
relation needing real units.

---

## Nine modelling errors the building turned up

Every one of these announced itself as something that looked wrong on screen,
and every one of them turned out to be a wrong *model* rather than a wrong
number. They are listed because a fix is only worth anything if the mistake is
on the record next to it.

**The assembly energy was delivered twice.** The design's gravitational floor
was handed over at contact, and then the motes fell together and released it
again. Two merged Earths sat at 24,000 K before anything had moved. The impact
measurement now reports the gravitational term without delivering it: the
pieces a collision throws *are* the blast, and they still have the fall in
them.

**Temperature was linear in energy.** With no latent heat a merge reached
100,000 K, which is not a magma ocean and not anything else either. Silicate's
heat of vaporisation is 1.3e7 J/kg, eight times what melting it costs. There is
a four-segment enthalpy curve now — sensible heat, latent fusion, sensible
heat, latent vaporisation — and a melt sitting at its boiling point absorbs
energy without getting any hotter, because that is what boiling is.

**A cloud's full monopole imploded it.** Pulling every mote toward the centre
with the whole cloud's mass gives a mote near the middle an acceleration in the
thousands. The first fix was a tabulated enclosed mass, which fixed the force
and broke the energy: a field that depends on the configuration is not
conservative, the profile shifts under the motes as they move, and every shift
is a free joule. Measured, that leak ran at eight times the cloud's entire
mechanical budget and came out as thirty thousand kelvin. A uniform sphere is
exact inside and out, has no central singularity, and given a mass and a radius
is a fixed central potential, so it conserves. Its binding energy is the same
`3GM²/5R` the settling test already measures against.

**Fragments stopped attracting each other.** Reading the monopole rule as
strictly own-cloud-only made fragmentation permanent: the instant a shock puffed
a melt into seven pieces the pieces flew apart in straight lines forever, with
no mote anywhere near escape velocity. It also made re-accretion impossible.
Clouds feel the heaviest few other clouds now — the same fixed-source-count
bargain the top-six body rule strikes.

**A cloud's pull on another cloud was not equal and opposite.** Aiming each
cloud's monopole at each mote of the other separately sums A's pull on B over
B's motes at their own distances and with A's radius, and B's pull on A over a
different set entirely. The two do not cancel. A head-on merge released from
rest walked off at four percent of its own internal momentum. It is one force
per pair now, applied uniformly to each cloud's motes, which is exact to the
last bit however the motes are arranged. Which pairs are in the set is a
performance choice and does not touch conservation; that a pair once in gets
both halves of its force is what does. The price is stated in the list below.

**A body pulled on a mote and felt nothing back.** This one hid behind the one
above: with no body in the sky there is nothing to notice. It surfaced the
moment a world settled out of a melt while the rest of the melt was still
rubble — three bodies among five hundred motes, and the whole drift arrived
after the first settle. The reaction is summed per source body and delivered
once, so it costs a pass over six sources rather than a pass over the motes.

**A shattering body span about the wrong centre.** Mote positions are drawn at
random and each material's mass is then allotted across them, so the cloud's
centre of mass is not the body's nominal centre. Rotating the cloud about the
body's centre instead handed it a net kick: six parts in a thousand of the
sky's momentum, in one frame, every time something spinning came apart.

**Live motes landed in ghost slots.** `Motes.ghost` was declared after the
object literal that defines `spawn` and `remove`, so `spawn` did not clear the
flag and `remove` did not carry it when swapping with the last slot. Live motes
inherited a dead slot's flag and faded out still carrying their mass: 38 M⊕ of
hydrogen came out as 27.09. Found by monkey-patching `Motes.remove` with a
stack-trace tally, which is the only way anyone was going to find it.

**A four-layer settle made three layers.** The radial binning compared a
per-shell accumulator against a cumulative threshold, so the shells came out at
one, two and one quarters of the mass instead of four even ones. Mass per
material was exact throughout, which is why no test caught it; the layering was
simply not the layering it claimed to be.

---

## What is deliberately wrong, and must be said out loud

A simulation that hides its fudges is worse than one that has none.

1. **The speed of light**, set for legible precession. Lands with step 10.
2. **The Sun's mass**, 33,300 Earths rather than 333,000, so its wobble is
   visible. Jupiter is ten times heavier relative to its star than it should be,
   so the inner system is less stable here over long runs than it is in reality.
3. **Body sizes**, 25 times too large, every ratio intact, with fusing bodies
   and remnants at 2 times instead.
4. **Stellar lifetimes** will be compressed when step 7 lands.
5. **Moon orbital radii** will be scaled to a fraction of the Hill sphere when
   step 12 lands, because the planets are 25 times too wide.

Three things sit next to that list without being on it. **There is no tide
between two clouds.** A cloud feels another cloud as one force through its
centre of mass, which is what makes the pair exactly equal and opposite, and a
uniform force cannot stretch anything. The per-mote version it replaced was a
shear with a momentum leak attached rather than an honest tide, so nothing
measured was lost, but a cloud passing close to a heavier one will not be drawn
out into a streamer here. Bodies still raise a tide on motes, because a mote
feels bodies one at a time. Second, a magma ocean here cools
in a few hundred simulated years, where a real one takes a hundred thousand or
more. That is not a chosen constant; it follows from modelling a melt as
free-radiating blobs a hundred kilometres across, with no crust to insulate
them. Third, radiation pressure, when step 9 lands, will have to read a nominal
grain size rather than a mote's real mass, because a mote weighs a chunk of a
planet and its true ratio of light to gravity is about 1e-20. That one will
join the list.

---

## Not built yet

Tides, tidal locking and tidal heating. Roche disruption and rings. Stellar
burning, aging, death and remnants. Binaries, accretion discs, jets and
gravitational lensing. Radiation pressure, atmospheric escape and the habitable
zone. Relativistic precession and gravitational-wave inspiral. Zones, Lagrange
points and Hill spheres. The command palette. The TRAPPIST-1, Galilean and
Kirkwood presets.

`window.helxis.aging()`, `.flux()` and `.lagrange()` return `null` rather than a
plausible number, because a plausible number is worse than nothing.

---

## Running the tests

```
node tests/physics.mjs
```

Playwright drives the real page in Chromium with an exact `dt`, so results do
not depend on machine speed. The tests that matter are physical rather than
behavioural, because those catch an integrator regression that no amount of
clicking around would reveal.

Two of the tests drive tens of thousands of steps, so the harness installs a
`stepMany` helper in the page that yields between chunks. Holding the renderer
for five minutes in one synchronous block is how the suite used to die
mid-run. The clock stays paused throughout, so the animation frames that fire
in the gaps draw and do not integrate.

The giant-impact test is marked stochastic. Whether the largest surviving
fragment has settled into a body or is still a clump when the clock stops sits
close enough to its threshold that a single run can fall either side. Re-run it
before investigating.

## The scripting hook

`window.helxis` exposes `list()`, `add()`, `remove()`, `step(dt)`, `run(dt, n)`,
`energy()`, `momentum()`, `mass()` per material, `composition(id)`,
`className(id)`, `orbit(id)`, `clumps()`, `motes()`, `shatter(id)`, `preset()`,
`rate()`, `yearUnit()`, `paused()`, `seed()` and `events()`.

`mass()` counts material that has left the scene as well as material still in
it, so the books balance even after something escapes.

`momentum()` returns `px` and `py` and also `scalar`, the sum of `|mv|` over
everything in the sky. A system started from rest has `px = py = 0`, so a drift
in the vector has nothing its own size to be measured against; `scalar` is the
momentum actually moving around inside it, and it is the only honest
denominator for "did any of this leak".

## Controls

| | |
|---|---|
| Drag from empty space | fling a new body; the dotted line is where it will go |
| Tap empty space | with Auto-orbit on, drops it into a circular orbit |
| Tap a body | select it |
| Drag on, then drag a body | pick it up; let go and it carries your hand's speed |
| Tap again, `Esc`, or the cross | put it down |
| Scroll or pinch | zoom about the cursor |
| Two-finger drag, middle-drag, space-drag | pan |
| `Space` `C` `T` `D` `F` `G` `O` | pause, clear, trails, drag, fit, forge, orbits |

The picker can hold nothing. If it always held a selection, every press on empty
sky would put a world there whether you wanted one or not, and with a tool in
hand that is precisely the press you were trying to make. Tapping the lit one
puts it out.
