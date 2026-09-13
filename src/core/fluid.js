// A two-dimensional, area-based adaptation of Macklin & Müller (2013),
// https://mmacklin.com/pbf_sig_preprint.pdf, equations 1, 9 and 12.
// Cold neighbours participate as moving boundaries; only melt has a density
// constraint. This is an incompressible approximation, not a shock EOS.
const HEX_AREA = 2 * Math.sqrt(3);
// Poly6 quadrature on the undeformed hex packing, h = two diameters.
const REST_SUM = HEX_AREA / (4 * Math.PI) * (1 + 6 * 0.75 ** 3 + 6 * 0.25 ** 3);

export function solveFluid(g, dt, opts = {}) {
  if (opts.fluid === false || g.n < 2 || !(dt > 0)) return;
  let hot = false;
  for (let i = 0; i < g.n; i++) {
    hot ||= g.melt[i] > 0;
  }
  if (!hot) return;
  if (!g._fluid) g._fluid = {
    dx: new Float64Array(g.cap), dy: new Float64Array(g.cap),
    travel: new Float64Array(g.cap), edges: [],
    indices: new Int32Array(g.cap), gx: new Float64Array(g.cap), gy: new Float64Array(g.cap),
    density: new Float64Array(g.cap),
  };
  const f = g._fluid;
  const iterations = opts.fluidIterations ?? 4;
  for (let pass = 0; pass < iterations; pass++) {
    // Rebuild after corrections. A stale grid misses neighbours that cross a
    // cell boundary; enlarging the search radius alone does not repair that.
    g.buildGrid();
    const { minX, minY, cols, rows, size } = g._grid;
    f.travel.fill(0, 0, g.n); f.edges.length = 0;
    f.dx.fill(0, 0, g.n); f.dy.fill(0, 0, g.n);
    for (let i = 0; i < g.n; i++) {
      const massScale = g.mass[i];
      const melt = g.melt[i];
      if (!(melt > 0)) continue;
      const h = 4 * g.r[i], h2 = h * h;
      const norm = 4 / (Math.PI * h2 * REST_SUM);
      let density = HEX_AREA * g.r[i] ** 2 * norm;
      let sumX = 0, sumY = 0, denom = 0, count = 0;
      const ci = Math.min(cols - 1, Math.max(0, Math.floor((g.x[i] - minX) / size)));
      const cj = Math.min(rows - 1, Math.max(0, Math.floor((g.y[i] - minY) / size)));
      const reach = Math.ceil(h / size);
      for (let y = Math.max(0, cj - reach); y <= Math.min(rows - 1, cj + reach); y++) {
        for (let x = Math.max(0, ci - reach); x <= Math.min(cols - 1, ci + reach); x++) {
          for (let j = g._heads[y * cols + x]; j !== -1; j = g._next[j]) {
            if (j === i) continue;
            const dx = g.x[i] - g.x[j], dy = g.y[i] - g.y[j];
            const q2 = (dx * dx + dy * dy) / h2;
            if (q2 >= 1) continue;
            const q = 1 - q2, volume = HEX_AREA * g.r[j] ** 2;
            density += volume * norm * q ** 3;
            const grad = -6 * volume * norm * q * q / h2;
            const gx = grad * dx, gy = grad * dy;
            f.indices[count] = j; f.gx[count] = gx; f.gy[count++] = gy;
            sumX += gx; sumY += gy;
            denom += (gx * gx + gy * gy) * massScale / g.mass[j];
          }
        }
      }
      f.density[i] = density;
      // No negative pressure in vacuum: an isolated droplet must not attract
      // distant ejecta just to fill its kernel support.
      const error = Math.max(0, density - 1);
      const wi = massScale / g.mass[i];
      denom += (sumX * sumX + sumY * sumY) * wi;
      const lambda = -melt * error / (denom + 1e-3 / h2);
      if (lambda === 0) continue;
      for (let k = 0; k < count; k++) {
        const j = f.indices[k], wj = massScale / g.mass[j];
        const dx = lambda * f.gx[k], dy = lambda * f.gy[k];
        const length = Math.hypot(dx, dy);
        f.travel[i] += wi * length; f.travel[j] += wj * length;
        // Store actual impulse-like displacement, independent of the local
        // mass normalisation used to condition this constraint's denominator.
        f.edges.push(i, j, dx * massScale, dy * massScale);
      }
    }
    // Limit each central exchange by both endpoints' total proposed travel.
    // The triangle inequality bounds aggregate displacement to 0.2 radii per
    // iteration. Equal/opposite impulses preserve momentum, while a distant
    // compressed clump cannot throttle pressure here.
    for (let k = 0; k < f.edges.length; k += 4) {
      const i = f.edges[k], j = f.edges[k + 1];
      const limit = Math.min(1, 0.2 * g.r[i] / (f.travel[i] || 1),
        0.2 * g.r[j] / (f.travel[j] || 1));
      const length = Math.hypot(f.edges[k + 2], f.edges[k + 3]) * limit;
      const rx = g.x[i] - g.x[j], ry = g.y[i] - g.y[j];
      const distance = Math.hypot(rx, ry);
      if (!(length > 0 && distance > 0)) continue;
      const nx = rx / distance, ny = ry / distance;
      const invMass = 1 / g.mass[i] + 1 / g.mass[j];
      const reduced = 1 / invMass;
      const vx = g.vx[i] - g.vx[j], vy = g.vy[i] - g.vy[j];
      const vn = vx * nx + vy * ny, vt = -vx * ny + vy * nx;
      const impulse = vn < 0 ? Math.min(length / dt, -vn * reduced) : 0;
      const expanded = distance + length * invMass;
      // Geometric pressure correction changes the lever arm. Carry the pair's
      // angular momentum through that change instead of silently creating it:
      // reduced*d*vt = reduced*expanded*vtNew. Both kinetic losses become heat.
      const ratio = distance / expanded;
      const tangentImpulse = reduced * vt * (ratio - 1);
      const jx = impulse * nx - tangentImpulse * ny;
      const jy = impulse * ny + tangentImpulse * nx;
      g.vx[i] += jx / g.mass[i]; g.vy[i] += jy / g.mass[i];
      g.vx[j] -= jx / g.mass[j]; g.vy[j] -= jy / g.mass[j];
      g.x[i] += length * nx / g.mass[i]; g.y[i] += length * ny / g.mass[i];
      g.x[j] -= length * nx / g.mass[j]; g.y[j] -= length * ny / g.mass[j];
      const heat = -impulse * vn - 0.5 * impulse * impulse * invMass
        + 0.5 * reduced * vt * vt * (1 - ratio * ratio);
      g.addHeat(i, heat * 0.5); g.addHeat(j, heat * 0.5);
    }
  }
}
