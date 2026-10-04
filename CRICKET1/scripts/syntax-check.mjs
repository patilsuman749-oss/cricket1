/** `npm run check` — syntax-checks every JS file and verifies the cache/version wiring. */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import vm from 'node:vm';

const root = new URL('..', import.meta.url).pathname;
const files = [];
const walk = (dir) => { for (const n of readdirSync(dir)) { if (n === 'node_modules' || n.startsWith('.')) continue; const p = join(dir, n); statSync(p).isDirectory() ? walk(p) : /\.m?js$/.test(n) && files.push(p); } };
walk(root);

let bad = 0;
for (const f of files) { try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); } catch (e) { bad++; console.error('SYNTAX ERROR', relative(root, f), '\n', e.stderr.toString()); } }
console.log(`${files.length - bad}/${files.length} files parse`);

// version.js, package.json and the service worker must agree; every module must be precached.
const ctx = { globalThis: {} }; vm.createContext(ctx); vm.runInContext(readFileSync(join(root, 'version.js'), 'utf8'), ctx);
const version = ctx.globalThis.CRICKET1_VERSION;
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
if (version !== pkg.version) { bad++; console.error(`version.js (${version}) != package.json (${pkg.version})`); }
const sw = readFileSync(join(root, 'service-worker.js'), 'utf8');
for (const f of files.filter((f) => relative(root, f).startsWith('src/'))) {
  const rel = './' + relative(root, f);
  if (!sw.includes(`'${rel}'`)) { bad++; console.error(`service-worker.js CORE is missing ${rel}`); }
}
console.log(bad ? `${bad} problem(s)` : `OK — version ${version}, service worker precache complete`);
process.exit(bad ? 1 : 0);
