/**
 * CÉREBRO — geometria 100% procedural (não depende de .glb externo).
 * Malha com giros e sulcos (ruído simplex "ridged"), cerebelo com folhas finas, tronco encefálico,
 * nuvem de partículas que segue a forma e a rede neural (curvas Catmull-Rom entre nós).
 */
import { makeNoise3, mulberry32, v3 } from './math.js';
import { REGIONS } from './regions.js';

const tick = () => new Promise(r => setTimeout(r, 0));

/* ---------- icosfera ---------- */
function icosphere(level) {
  const t = (1 + Math.sqrt(5)) / 2;
  const base = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
  const pos = [];
  base.forEach(b => { const l = Math.hypot(b[0], b[1], b[2]); pos.push(b[0] / l, b[1] / l, b[2] / l); });
  let idx = [0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8, 3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1];
  for (let l = 0; l < level; l++) {
    const cache = new Map(), out = [];
    const mid = (a, b) => {
      const key = a < b ? a * 4194304 + b : b * 4194304 + a;
      let m = cache.get(key);
      if (m === undefined) {
        const x = pos[a * 3] + pos[b * 3], y = pos[a * 3 + 1] + pos[b * 3 + 1], z = pos[a * 3 + 2] + pos[b * 3 + 2], len = Math.hypot(x, y, z);
        m = pos.length / 3; pos.push(x / len, y / len, z / len); cache.set(key, m);
      }
      return m;
    };
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i], b = idx[i + 1], c = idx[i + 2], ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      out.push(a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca);
    }
    idx = out;
  }
  return { dirs: new Float32Array(pos), idx: new Uint32Array(idx) };
}

/* ---------- formas ---------- */
// Hemisférios: elipsoide com base achatada, lobo temporal, fissura longitudinal e giros por ruído.
function shapeBrain(ux, uy, uz, noise) {
  const sx = ux >= 0 ? 1 : -1, front = Math.max(0, uz), back = Math.max(0, -uz);
  let px = ux * 0.74 * (1 + 0.05 * front - 0.12 * back), py = uy * 0.62 * (1 + 0.05 * front), pz = uz * 0.98;
  if (py < 0) py *= 0.58;
  const tx = Math.abs(px) - 0.60, ty = py + 0.30, tz = pz - 0.14;
  const bump = Math.exp(-(tx * tx / 0.045 + ty * ty / 0.03 + tz * tz / 0.14));
  py -= bump * 0.12; px += sx * bump * 0.06;
  const groove = Math.exp(-(ux * ux) / (2 * 0.07 * 0.07));
  py -= groove * Math.max(0, uy) * 0.10;
  px += sx * 0.03;

  // giros (largos) e sulcos (estreitos): |ruído|^0.5 vale 0 nos cruzamentos → sulco fino
  const s1 = Math.pow(Math.abs(noise(ux * 3.2 + 1.3, uy * 3.2, uz * 3.8)), 0.5);
  const s2 = Math.pow(Math.abs(noise(ux * 7 + 9.1, uy * 7, uz * 8)), 0.5);
  const s3 = Math.pow(Math.abs(noise(ux * 15, uy * 15 + 4.2, uz * 16)), 0.5);
  const r = Math.min(1, s1 * 0.55 + s2 * 0.3 + s3 * 0.15);
  const d = (r - 0.55) * 0.12 * (1 - groove * 0.75);
  const l = Math.hypot(px, py, pz) || 1;
  return { p: [px + px / l * d, py + py / l * d, pz + pz / l * d], ridge: r * (1 - groove * 0.5) };
}

// Cerebelo: folhas finas e paralelas.
function shapeCerebellum(ux, uy, uz, noise) {
  const f = Math.sin(uy * 46 + noise(ux * 2, uy * 2, uz * 2) * 2.2), r = 0.5 + 0.5 * f;
  const vermis = Math.exp(-(ux * ux) / (2 * 0.06 * 0.06));
  const k = 1 + (r - 0.5) * 0.16 - vermis * 0.05;
  return { p: [ux * 0.50 * k, -0.50 + uy * 0.25 * k, -0.66 + uz * 0.33 * k], ridge: 0.25 + r * 0.75 };
}

// Tronco encefálico: ellipsoide afilado que desce levemente para trás.
function shapeStem(ux, uy, uz, noise) {
  const n = noise(ux * 3, uy * 3, uz * 3) * 0.015;
  return { p: [ux * (0.13 + n), -0.74 + uy * 0.42, -0.30 + uz * 0.12 - uy * 0.10], ridge: 0.55 + n * 8 };
}

function buildPart(kind, level, noise) {
  const { dirs, idx } = icosphere(level), n = dirs.length / 3;
  const pos = new Float32Array(n * 3), ridge = new Float32Array(n), nor = new Float32Array(n * 3);
  const fn = kind === 'brain' ? shapeBrain : kind === 'cerebellum' ? shapeCerebellum : shapeStem;
  for (let i = 0; i < n; i++) {
    const r = fn(dirs[i * 3], dirs[i * 3 + 1], dirs[i * 3 + 2], noise);
    pos[i * 3] = r.p[0]; pos[i * 3 + 1] = r.p[1]; pos[i * 3 + 2] = r.p[2]; ridge[i] = r.ridge;
  }
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const o of [a, b, c]) { nor[o] += nx; nor[o + 1] += ny; nor[o + 2] += nz; }
  }
  for (let i = 0; i < n; i++) {
    const l = Math.hypot(nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]) || 1;
    nor[i * 3] /= l; nor[i * 3 + 1] /= l; nor[i * 3 + 2] /= l;
  }
  return { pos, nor, ridge, idx, count: n };
}

/* ---------- partículas (seguem a forma, dentro e na superfície) ---------- */
function buildParticles(parts, total) {
  const rnd = mulberry32(77), pos = new Float32Array(total * 3), rn = new Float32Array(total * 4);
  const share = [['brain', 0.62], ['volume', 0.17], ['cerebellum', 0.14], ['stem', 0.07]];
  let o = 0;
  const put = (x, y, z, kind) => {
    pos[o * 3] = x; pos[o * 3 + 1] = y; pos[o * 3 + 2] = z;
    rn[o * 4] = rnd(); rn[o * 4 + 1] = 0.55 + rnd() * 1.25; rn[o * 4 + 2] = rnd(); rn[o * 4 + 3] = kind; o++;
  };
  for (const [kind, f] of share) {
    const cnt = kind === 'stem' ? total - o : Math.round(total * f);
    for (let i = 0; i < cnt && o < total; i++) {
      if (kind === 'volume') {
        let x, y, z, k = 0;
        do { x = (rnd() * 2 - 1) * 0.74; y = (rnd() * 2 - 1) * 0.6; z = (rnd() * 2 - 1) * 0.95; k++; }
        while (((x / 0.72) ** 2 + (y / 0.56) ** 2 + (z / 0.92) ** 2 > 1 || y < -0.28) && k < 20);
        put(x, y, z, 0);
      } else {
        const p = parts[kind], j = Math.floor(rnd() * p.count), depth = Math.pow(rnd(), 2.2) * (kind === 'brain' ? 0.3 : 0.12);
        put(p.pos[j * 3] - p.nor[j * 3] * depth + (rnd() - .5) * 0.012, p.pos[j * 3 + 1] - p.nor[j * 3 + 1] * depth + (rnd() - .5) * 0.012,
          p.pos[j * 3 + 2] - p.nor[j * 3 + 2] * depth + (rnd() - .5) * 0.012, kind === 'brain' ? 0 : kind === 'cerebellum' ? 1 : 2);
      }
    }
  }
  while (o < total) put(0, 0, 0, 0);
  return { pos, rnd: rn, count: total };
}

/* ---------- rede neural ---------- */
function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return [0, 1, 2].map(i => 0.5 * ((2 * p1[i]) + (-p0[i] + p2[i]) * t + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 + (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t3));
}

function buildNetwork(brain) {
  const rnd = mulberry32(2024), nodes = [];
  REGIONS.forEach((r, i) => nodes.push({ p: r.pos.slice(), reg: i, size: 15 }));
  const extra = 150;
  for (let i = 0; i < extra; i++) {
    const j = Math.floor(rnd() * brain.count), k = 0.80 + rnd() * 0.12;
    nodes.push({ p: [brain.pos[j * 3] * k, brain.pos[j * 3 + 1] * k, brain.pos[j * 3 + 2] * k], reg: -1, size: 4 + rnd() * 4 });
  }
  const nearestRegion = p => { let b = 0, d = 1e9; REGIONS.forEach((r, i) => { const dd = v3.dist(p, r.pos); if (dd < d) { d = dd; b = i; } }); return b; };
  const key = (a, b) => (a < b ? a + '-' + b : b + '-' + a), pairs = new Set(), links = [];
  const add = (a, b) => { if (a === b) return; const k = key(a, b); if (!pairs.has(k)) { pairs.add(k); links.push([a, b]); } };
  const knn = (i, k) => nodes.map((n, j) => [j, v3.dist(nodes[i].p, n.p)]).filter(x => x[0] !== i).sort((a, b) => a[1] - b[1]).slice(0, k).map(x => x[0]);
  nodes.forEach((n, i) => knn(i, n.reg >= 0 ? 7 : 2).forEach(j => add(i, j)));
  const id = n => REGIONS.findIndex(r => r.id === n);
  [['prefrontal', 'amigdala'], ['amigdala', 'hipocampo'], ['hipocampo', 'estriado'], ['estriado', 'prefrontal'], ['hipocampo', 'temporal'],
    ['parietal', 'occipital'], ['parietal', 'hipocampo'], ['cerebelo', 'tronco'], ['tronco', 'hipocampo'], ['cerebelo', 'occipital'],
    ['temporal', 'amigdala'], ['parietal', 'estriado']].forEach(([a, b]) => add(id(a), id(b)));
  for (let i = 0; i < 26; i++) {
    const a = Math.floor(rnd() * nodes.length), b = Math.floor(rnd() * nodes.length), d = v3.dist(nodes[a].p, nodes[b].p);
    if (d > 0.5 && d < 1.3) add(a, b);
  }

  const SEG = 18, linePos = [], lineMeta = [];
  links.forEach(([a, b], ci) => {
    const A = nodes[a].p, B = nodes[b].p, d = v3.sub(B, A), len = v3.len(d);
    const perp = () => v3.scale(v3.norm([rnd() - .5, rnd() - .5, rnd() - .5]), len * 0.22 * (0.4 + rnd()));
    const c1 = v3.add(v3.add(A, v3.scale(d, 0.33)), perp()), c2 = v3.add(v3.add(A, v3.scale(d, 0.66)), perp());
    const ctl = [A, A, c1, c2, B, B], pts = [];
    for (let s = 0; s < 3; s++) for (let t = 0; t < 6; t++) pts.push(catmull(ctl[s], ctl[s + 1], ctl[s + 2], ctl[s + 3], t / 6));
    pts.push(B);
    const seed = rnd(), reg = nodes[a].reg >= 0 ? nodes[a].reg : nodes[b].reg >= 0 ? nodes[b].reg : nearestRegion(v3.lerp(A, B, .5));
    for (let s = 0; s < SEG; s++) {
      for (const q of [s, s + 1]) { linePos.push(pts[q][0], pts[q][1], pts[q][2]); lineMeta.push(q / SEG, seed, reg, 0); }
    }
  });
  const nodePos = new Float32Array(nodes.length * 3), nodeMeta = new Float32Array(nodes.length * 4);
  nodes.forEach((n, i) => { nodePos.set(n.p, i * 3); nodeMeta.set([n.size, n.reg, rnd(), n.reg >= 0 ? 1 : 0], i * 4); });
  return { linePos: new Float32Array(linePos), lineMeta: new Float32Array(lineMeta), lineCount: linePos.length / 3, nodePos, nodeMeta, nodeCount: nodes.length };
}

/* ---------- montagem (com progresso para a tela de loading) ---------- */
export async function buildBrain({ meshLevel, particleCount, onProgress }) {
  const noise = makeNoise3(1337), say = (p, t) => onProgress && onProgress(p, t);
  say(0.05, 'Modelando os hemisférios…'); await tick();
  const brain = buildPart('brain', meshLevel, noise);
  say(0.40, 'Dobrando giros e sulcos…'); await tick();
  const cerebellum = buildPart('cerebellum', Math.max(3, meshLevel - 1), noise);
  const stem = buildPart('stem', 3, noise);
  say(0.62, 'Semeando partículas…'); await tick();
  const particles = buildParticles({ brain, cerebellum, stem }, particleCount);
  say(0.82, 'Tecendo as sinapses…'); await tick();
  const network = buildNetwork(brain);
  say(1, 'Pronto'); await tick();
  return { parts: { brain, cerebellum, stem }, particles, network };
}
