// Generates shared/test/fixtures/calc.json by running the ORIGINAL wonju-15c script in a Node vm.
// Usage: node scripts/gen-calc-fixtures.mjs [path/to/wonju-15c/index.html]
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2] || path.join(process.env.HOME, 'wonju-15c/index.html');
const html = fs.readFileSync(src, 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const code = scripts.sort((a, b) => b.length - a.length)[0];

// Universal fake: any property access / call returns another fake; coerces to ''/0.
function fake() {
  const f = function () {};
  return new Proxy(f, {
    get: (_, k) => {
      if (k === Symbol.toPrimitive) return () => '';
      if (k === 'length') return 0;
      if (k === 'then') return undefined;
      if (k === Symbol.iterator) return function* () {};
      return fake();
    },
    set: () => true,
    apply: () => fake(),
    construct: () => fake(),
  });
}
const store = new Map();
const localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};
const document = fake();
const window = {
  localStorage, document, location: { search: '', href: '', hash: '', pathname: '/' },
  addEventListener() {}, removeEventListener() {}, scrollTo() {}, matchMedia: () => fake(),
  history: fake(), navigator: { userAgent: 'node' }, requestAnimationFrame: () => 0,
  setTimeout: () => 0, clearTimeout() {},
};
const sandbox = {
  window, document, localStorage, location: window.location, history: window.history,
  navigator: window.navigator, console, setTimeout: () => 0, setInterval: () => 0,
  clearTimeout() {}, clearInterval() {}, requestAnimationFrame: () => 0, fetch: () => Promise.reject(new Error('no net')),
  URLSearchParams, Math, JSON, Date, Number, String, Array, Object, isNaN, parseInt, parseFloat,
  alert() {}, confirm: () => false, Image: function () {}, FormData: function () {}, Blob: function () {},
  matchMedia: () => fake(), addEventListener() {}, scrollTo() {},
};
sandbox.self = sandbox.globalThis = sandbox;
vm.createContext(sandbox);
// top-level const/let are not on the global object; expose what we need through a trailing expression.
const exportsObj = vm.runInContext(
  code + '\n;({ calculate, ACTIONS, CONFIG, S, QUESTIONS, SECTOR_KEYS, CARBON_FACTORS });',
  sandbox,
  { filename: 'wonju-15c.js' },
);
const { calculate, ACTIONS, S, QUESTIONS, SECTOR_KEYS, CARBON_FACTORS } = exportsObj;

// seeded PRNG
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261031);
const ri = (n) => Math.floor(rnd() * n);

function randomAnswers() {
  const a = {};
  for (const k of SECTOR_KEYS) {
    for (const q of QUESTIONS[k]) {
      if (rnd() < 0.08) continue; // unanswered
      if (q.type === 'num') {
        const min = q.min ?? 0;
        if (q.step) a[q.id] = min + ri(Math.floor((q.max - min) / q.step) + 1) * q.step;
        else a[q.id] = min + ri(q.max - min + 1);
        if (rnd() < 0.2 && q.id !== 'members') a[q.id] = rnd() < 0.5 ? 0 : Math.min(q.max, 2);
      } else if (q.type === 'one') a[q.id] = ri(q.o.length);
      else if (q.type === 'yesno') a[q.id] = ri(2);
      else if (q.type === 'count') {
        const o = {};
        for (const [key] of CARBON_FACTORS.consumption[q.items]) if (rnd() < 0.6) o[key] = ri(4);
        a[q.id] = o;
      } else if (q.type === 'multi') a[q.id] = q.o.map((x) => x[0]).filter(() => rnd() < 0.5);
    }
  }
  if (rnd() < 0.3) a.solarType = ri(3);
  return a;
}

function evaluate(answers) {
  S.answers = JSON.parse(JSON.stringify(answers));
  const r = calculate();
  const potentials = {};
  for (const act of ACTIONS) potentials[act.id] = act.potential(r);
  const result = { sectors: r.sectors, total: r.total, gap: r.gap, rate: r.rate, parts: r.parts, raw: r.raw, under: r.under };
  return { answers, result, potentials };
}

const fixtures = [];
for (let i = 0; i < 30; i++) fixtures.push({ name: `random-${i}`, ...evaluate(randomAnswers()) });

// edge sets
const edges = {
  'edge-defaults': {},
  'edge-members-zero': { members: 0, areaTotal: 30, elec: 2, heatType: 0, heatCost: 2 },
  'edge-briquette-max': { members: 1, areaTotal: 200, elec: 4, heatType: 4, heatCost: 4 },
  'edge-solar-detached': { members: 3, areaTotal: 40, elec: 2, heatType: 1, heatCost: 1, solar: 2, solarType: 2 },
  'edge-solar-none-detached-type': { members: 2, areaTotal: 25, solar: 0, solarType: 2, car: 5, ev: 3 },
};
for (const [name, answers] of Object.entries(edges)) fixtures.push({ name, ...evaluate(answers) });
// near 5.9t: search seeded random sets for total closest to the target
let best = null;
for (let i = 0; i < 20000; i++) {
  const a = randomAnswers();
  const s = rnd();
  for (const key of ['flight', 'train', 'car', 'ev', 'clothes', 'eatOut', 'areaTotal'])
    if (typeof a[key] === 'number') a[key] = Math.round(a[key] * s * 2) / 2;
  const f = evaluate(a);
  const d = Math.abs(f.result.total - 5.9);
  if (!best || d < best.d) best = { d, f };
}
fixtures.push({ name: 'edge-near-5.9', ...best.f });

const out = path.join(root, 'shared/test/fixtures/calc.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(fixtures, null, 2) + '\n');
console.log(`wrote ${fixtures.length} fixtures; near-target total=${best.f.result.total}`);
