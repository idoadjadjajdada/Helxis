/* Bundle Helxis into one self-contained HTML file.
 *
 *   node scripts/build-artifact.mjs        -> build/helxis.html
 *
 * The app itself needs no build step and this is not one: `npm start` serves
 * the real modules and that is the supported way to run it. This exists only
 * because some hosts take a single file and nothing else, and a relative font
 * or module URL there is a 404 that silently falls back to a system face.
 *
 * Plain concatenation is not available: seven top-level names collide across
 * the modules (`RHO`, `MELT`, `CP`, `picker`, `P`, `rng`, `MATERIAL_KEYS`). So
 * each module gets its own function scope and a small registry, which is what
 * the module system was doing anyway. The graph is acyclic, so a topological
 * init order means a plain snapshot of exports is correct — the build fails
 * loudly if a cycle ever appears.
 *
 * Which names a module exposes is taken from what other modules IMPORT from it,
 * so nothing here has to parse export declarations.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const ENTRY = join(ROOT, 'src/main.js');
const OUT = join(ROOT, 'build/helxis.html');

const IMPORT_RE = /^import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"];?[ \t]*$/gm;
const id = (abs) => relative(ROOT, abs).split('\\').join('/');

const specsOf = (list) => list.split(',').map((s) => s.trim()).filter(Boolean)
  .map((s) => {
    const [name, local] = s.split(/\s+as\s+/).map((x) => x.trim());
    return { name, local: local || name };
  });

/* ---- collect the module graph ------------------------------------------- */
const mods = new Map();
async function load(abs) {
  if (mods.has(abs)) return;
  const src = await readFile(abs, 'utf8');
  const imports = [];
  for (const m of src.matchAll(IMPORT_RE)) {
    imports.push({ from: resolve(dirname(abs), m[2]), specs: specsOf(m[1]) });
  }
  mods.set(abs, { abs, src, imports });
  for (const i of imports) await load(i.from);
}
await load(ENTRY);

/* ---- what each module has to expose ------------------------------------- */
const needed = new Map();
for (const m of mods.values()) {
  for (const i of m.imports) {
    if (!needed.has(i.from)) needed.set(i.from, new Set());
    for (const s of i.specs) needed.get(i.from).add(s.name);
  }
}

/* ---- a cycle would make the export snapshot wrong ------------------------ */
const state = new Map();
(function visit(abs, stack) {
  if (state.get(abs) === 2) return;
  if (state.get(abs) === 1) {
    throw new Error(`import cycle: ${stack.map(id).join(' -> ')}\n`
      + 'The registry below snapshots exports after a module runs, which is '
      + 'only correct on an acyclic graph. Break the cycle or teach it live '
      + 'bindings.');
  }
  state.set(abs, 1);
  for (const i of mods.get(abs).imports) visit(i.from, stack.concat(i.from));
  state.set(abs, 2);
})(ENTRY, [ENTRY]);

/* ---- rewrite each module into a scoped factory -------------------------- */
const parts = [];
for (const m of mods.values()) {
  let code = m.src.replace(IMPORT_RE, (_full, list, spec) => {
    const from = resolve(dirname(m.abs), spec);
    const bindings = specsOf(list)
      .map((s) => (s.local === s.name ? s.name : `${s.name}: ${s.local}`));
    return `const { ${bindings.join(', ')} } = __req(${JSON.stringify(id(from))});`;
  });
  code = code.replace(/^export\s+\{[\s\S]*?\};?[ \t]*$/gm, '');
  code = code.replace(/^export\s+/gm, '');
  const exposed = [...(needed.get(m.abs) || [])]
    .map((n) => `  __e[${JSON.stringify(n)}] = ${n};`).join('\n');
  parts.push(`__mods[${JSON.stringify(id(m.abs))}] = function (__e, __req) {\n`
    + `${code}\n${exposed}\n};`);
}

const bundle = `(function () {
'use strict';
const __mods = {}, __cache = {};
function __req(id) {
  if (__cache[id]) return __cache[id];
  const e = {};
  __cache[id] = e;          // before running, so a future cycle degrades rather than loops
  __mods[id](e, __req);
  return e;
}
${parts.join('\n')}
__req(${JSON.stringify(id(ENTRY))});
})();`;

/* ---- inline the stylesheet and the fonts -------------------------------- */
let css = await readFile(join(ROOT, 'style.css'), 'utf8');
for (const file of ['hanken.woff2', 'jetbrains.woff2']) {
  const uri = `data:font/woff2;base64,`
    + (await readFile(join(ROOT, 'fonts', file))).toString('base64');
  const before = css;
  for (const q of ["'", '"', '']) {
    css = css.split(`url(${q}./fonts/${file}${q})`).join(`url(${q}${uri}${q})`);
  }
  if (css === before) throw new Error(`no @font-face reference found for ${file}`);
}
if (/url\(['"]?\.\//.test(css)) throw new Error('a relative url() survived in the css');

/* ---- the page ------------------------------------------------------------ */
const html = await readFile(join(ROOT, 'index.html'), 'utf8');
const body = html
  .slice(html.indexOf('<body>') + '<body>'.length, html.lastIndexOf('</body>'))
  .replace(/<script[\s\S]*?<\/script>/g, '')
  .trim();

const page = `<title>Helxis</title>
<style>
/* Hosts wrap this in their own skeleton, which ships a body margin and a
   system font. Helxis paints the whole viewport itself, so give the canvas
   something to fill and stop anything scrolling behind it. */
html, body { height: 100%; margin: 0; overflow: hidden; background: #0b0812; }
${css}
</style>

${body}

<script>
${bundle}
</script>
`;

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, page, 'utf8');
console.log(`${relative(ROOT, OUT)} — ${mods.size} modules, `
  + `${(page.length / 1024 / 1024).toFixed(2)} MB`);
