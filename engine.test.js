// Run with: node tests/engine.test.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'engine.js'), 'utf8');
const SG = new Function(src + '; return SG;')();

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('ok  ' + name); };

test('state to elements round trip', () => {
  const el = SG.makeEl(7000, 0.05, 53, 40, 70, 123);
  const s = SG.propagate(el, 1234);
  const el2 = SG.stateToElements(s.r, s.v); el2.M0 -= el2.n * 1234;
  const a = SG.propagate(el, 5000), b = SG.propagate(el2, 5000);
  assert(SG.norm(SG.sub(a.r, b.r)) < 1e-6);
});

test('energy is conserved (vis-viva)', () => {
  const el = SG.makeEl(7000, 0.05, 53, 40, 70, 123);
  const s = SG.propagate(el, 5000);
  const v = SG.norm(s.v), r = SG.norm(s.r);
  assert(Math.abs(v * v / 2 - SG.MU / r + SG.MU / (2 * el.a)) < 1e-9);
});

const cat = SG.buildCatalogue(2026);
const by = new Map(cat.list.map(o => [o.id, o]));

test('catalogue is deterministic and sane', () => {
  assert.strictEqual(cat.list.length, 247);
  assert(cat.list.every(o => o.el.rp - SG.RE > 150));
});

test('scenario A is a red conjunction near T+3.1 h', () => {
  const sc = cat.scenarios[0];
  const c = SG.findConjunctions(by.get(sc.primary).el, by.get(sc.secondary).el, 0, 12 * 3600, 20, 1)[0];
  assert(Math.abs(c.t / 3600 - 3.1) < 0.05 && c.d < 1);
  const pc = SG.collisionProb(c.d, 0.2, 0.01);
  assert.strictEqual(SG.riskLevel(c.d, pc, { redD: 1, amberD: 5, redPc: 1e-4, amberPc: 1e-5 }).level, 'red');
});

test('a 0.25 m/s prograde burn clears scenario A', () => {
  const sc = cat.scenarios[0], A = by.get(sc.primary), B = by.get(sc.secondary);
  const c = SG.findConjunctions(A.el, B.el, 0, 12 * 3600, 20, 1)[0];
  const e2 = SG.burn(A.el, c.t - 2 * A.el.T, SG.DIRS.prograde, 0.25);
  assert(SG.minNear(e2, B.el, c.t, 300, 2).d > 5);
});

test('classifier labels the scripted events', () => {
  const cases = [
    ['SG-COM-014', { snr: 18, loss: 62, dv: 0, att: 0.1, pwr: 2, near: 120, close: 0, frag: 0, kp: 2 }, 'rf'],
    ['SG-NAV-006', { snr: 6, loss: 15, dv: 0, att: 2.1, pwr: 22, near: 150, close: 0, frag: 0, kp: 7.5 }, 'env'],
    ['SG-EO-007', { snr: 2, loss: 10, dv: 12, att: 3, pwr: 8, near: 2, close: 2.8, frag: 14, kp: 2 }, 'coll'],
    ['SG-COM-002', { snr: 1, loss: 3, dv: 0, att: 0.1, pwr: 2, near: 160, close: 0, frag: 0, kp: 1.5 }, 'nominal']
  ];
  for (const [id, t, want] of cases) assert.strictEqual(SG.classify(t, by.get(id).role).cat.id, want);
});

console.log('\n' + passed + ' tests passed');
