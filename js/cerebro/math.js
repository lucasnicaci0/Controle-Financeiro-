// Matemática mínima: vetores, matrizes 4x4 (coluna-maior), easings, ruído simplex 3D e gerador pseudo-aleatório.
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const power3InOut = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const power3Out = t => 1 - Math.pow(1 - t, 3);

export function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: a => Math.hypot(a[0], a[1], a[2]),
  dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
  norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
};

export const m4 = {
  perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), o = new Float32Array(16);
    o[0] = f / aspect; o[5] = f; o[10] = (far + near) / (near - far); o[11] = -1; o[14] = 2 * far * near / (near - far);
    return o;
  },
  lookAt(eye, c, up) {
    const z = v3.norm(v3.sub(eye, c)), x = v3.norm(v3.cross(up, z)), y = v3.cross(z, x), o = new Float32Array(16);
    o[0] = x[0]; o[1] = y[0]; o[2] = z[0]; o[4] = x[1]; o[5] = y[1]; o[6] = z[1]; o[8] = x[2]; o[9] = y[2]; o[10] = z[2];
    o[12] = -v3.dot(x, eye); o[13] = -v3.dot(y, eye); o[14] = -v3.dot(z, eye); o[15] = 1;
    return o;
  },
  mul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
    return o;
  },
  translate(x, y, z) { const o = new Float32Array(16); o[0] = o[5] = o[10] = o[15] = 1; o[12] = x; o[13] = y; o[14] = z; return o; },
  mulPoint(m, p) {
    return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
      m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14], m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15]];
  }
};

// Ruído simplex 3D (Gustavson), semente fixa para o cérebro sair sempre igual.
export function makeNoise3(seed) {
  const rnd = mulberry32(seed), p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
  const perm = new Uint8Array(512), pm12 = new Uint8Array(512);
  for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; pm12[i] = perm[i] % 12; }
  const g = [[1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1], [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]];
  const F3 = 1 / 3, G3 = 1 / 6;
  return function (xin, yin, zin) {
    let n0, n1, n2, n3;
    const s = (xin + yin + zin) * F3, i = Math.floor(xin + s), j = Math.floor(yin + s), k = Math.floor(zin + s);
    const t = (i + j + k) * G3, x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
      else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else {
      if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
      else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
      else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    }
    const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;
    const ii = i & 255, jj = j & 255, kk = k & 255;
    const g0 = g[pm12[ii + perm[jj + perm[kk]]]], g1 = g[pm12[ii + i1 + perm[jj + j1 + perm[kk + k1]]]];
    const g2 = g[pm12[ii + i2 + perm[jj + j2 + perm[kk + k2]]]], g3 = g[pm12[ii + 1 + perm[jj + 1 + perm[kk + 1]]]];
    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0; if (t0 < 0) n0 = 0; else { t0 *= t0; n0 = t0 * t0 * (g0[0] * x0 + g0[1] * y0 + g0[2] * z0); }
    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1; if (t1 < 0) n1 = 0; else { t1 *= t1; n1 = t1 * t1 * (g1[0] * x1 + g1[1] * y1 + g1[2] * z1); }
    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2; if (t2 < 0) n2 = 0; else { t2 *= t2; n2 = t2 * t2 * (g2[0] * x2 + g2[1] * y2 + g2[2] * z2); }
    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3; if (t3 < 0) n3 = 0; else { t3 *= t3; n3 = t3 * t3 * (g3[0] * x3 + g3[1] * y3 + g3[2] * z3); }
    return 32 * (n0 + n1 + n2 + n3);
  };
}
