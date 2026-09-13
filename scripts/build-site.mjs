import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'dist');
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const path of ['index.html', 'style.css', 'src', 'fonts']) {
  await cp(join(root, path), join(out, path), { recursive: true });
}
console.log('Helxis static site built in dist/');
