/**
 * CENA — dona do contexto WebGL2. Junta Cérebro + Conexões (sinapses) + Câmera + Pós-processamento,
 * escolhe a qualidade pela GPU, ajusta a resolução em tempo real e projeta as âncoras das regiões
 * para a camada de cartões (DOM).
 */
import { THEME, hexLin } from './theme.js';
import { REGIONS, REGION_RADIUS } from './regions.js';
import { createProgram, bufferF } from './gl.js';
import { buildBrain } from './brain.js';
import { Camera, STOPS } from './camera.js';
import { Post } from './post.js';
import { clamp, m4, mulberry32 } from './math.js';
import * as SH from './shaders.js';

const TIERS = [
  { nome: 'baixa', meshLevel: 5, particles: THEME.particles.low, bloomLevels: 2, dprCap: 1.5, post: true, nodes: 70, floaters: 90 },
  { nome: 'média', meshLevel: 5, particles: THEME.particles.mid, bloomLevels: 3, dprCap: 2, post: true, floaters: 220 },
  { nome: 'alta', meshLevel: 6, particles: THEME.particles.high, bloomLevels: 4, dprCap: 3, post: true, floaters: 360 }
];

function detectTier(gl) {
  const q = new URLSearchParams(location.search).get('q');
  if (q !== null && TIERS[+q]) return +q;
  let r = '';
  const e = gl.getExtension('WEBGL_debug_renderer_info');
  if (e) r = String(gl.getParameter(e.UNMASKED_RENDERER_WEBGL) || '');
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && innerWidth < 900);
  if (/swiftshader|llvmpipe|software|mali-[4t]|adreno \(?TM\)? ?[23]\d\d|powervr sgx|intel\(r\) hd graphics [23]\d\d\d/i.test(r)) return 0;
  if (mobile || (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 2) return 1;
  return 2;
}

export class Scene {
  constructor(canvas) {
    this.canvas = canvas;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const gl = this.gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 indisponível');
    this.tierIdx = detectTier(gl);
    this.tier = TIERS[this.tierIdx];
    this.lost = false; this.onLost = null;
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.lost = true; this.onLost && this.onLost(); });
    this.cam = new Camera();
    this.mode = 'login'; this.progress = 0; this.focusKey = 'overview';
    this.hover = -1; this.act = new Float32Array(9); this.manual = new Float32Array(9);
    this.anchors = REGIONS.map(() => ({ x: 0, y: 0, ok: false, depth: 1, s: 1 }));
    this.time = 0; this.assemble = 0; this.dirty = true; this.running = false;
    this.dpr = Math.min(window.devicePixelRatio || 1, this.tier.dprCap); this.dprScale = 1; this.ema = 16;
    this.onFrame = null; this.w = 2; this.h = 2; this.cssW = 1; this.cssH = 1;
    this.defReg = REGIONS.map(r => r.cor);
    this.look = { uni: 1, floatOn: true, floatQty: 0.6 }; this.degradeLvl = 0; this.partFrac = 1; this.floatCap = 1; this.pal = null;
  }

  async init(onProgress) {
    const gl = this.gl, T = THEME, tier = this.tier;
    const total = T.particles.override > 0 ? T.particles.override : tier.particles;
    const data = await buildBrain({ meshLevel: tier.meshLevel, particleCount: total, onProgress });
    this.data = data;
    this.prog = {
      mesh: createProgram(gl, SH.MESH_VS, SH.MESH_FS, 'mesh'),
      part: createProgram(gl, SH.PART_VS, SH.PART_FS, 'particulas'),
      line: createProgram(gl, SH.LINE_VS, SH.LINE_FS, 'sinapses'),
      node: createProgram(gl, SH.NODE_VS, SH.NODE_FS, 'nos'),
      flo: createProgram(gl, SH.FLOAT_VS, SH.FLOAT_FS, 'artefatos'),
      bg: createProgram(gl, SH.FULL_VS, SH.BG_FS, 'fundo')
    };
    const mkMesh = p => {
      const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
      bufferF(gl, p.pos, 0, 3); bufferF(gl, p.nor, 1, 3); bufferF(gl, p.ridge, 2, 1);
      const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, p.idx, gl.STATIC_DRAW);
      gl.bindVertexArray(null); return { vao, n: p.idx.length };
    };
    this.meshes = [data.parts.brain, data.parts.cerebellum, data.parts.stem].map(mkMesh);
    this.pVao = gl.createVertexArray(); gl.bindVertexArray(this.pVao);
    bufferF(gl, data.particles.pos, 0, 3); bufferF(gl, data.particles.rnd, 1, 4); gl.bindVertexArray(null);
    // sinapses: cada segmento vira uma faixa (2 triângulos) cuja largura é calculada em pixels no shader
    {
      const lp = data.network.linePos, lm = data.network.lineMeta, segs = lp.length / 6, V = segs * 6;
      const P = new Float32Array(V * 3), O = new Float32Array(V * 3), M = new Float32Array(V * 4), SD = new Float32Array(V * 2);
      const order = [[0, 1], [0, -1], [1, 1], [0, -1], [1, -1], [1, 1]];   // [vértice (0=início,1=fim), lado]
      let k = 0;
      for (let sgi = 0; sgi < segs; sgi++) for (const [e, side] of order) {
        const me = sgi * 2 + e, ot = sgi * 2 + (1 - e);
        P.set(lp.subarray(me * 3, me * 3 + 3), k * 3); O.set(lp.subarray(ot * 3, ot * 3 + 3), k * 3);
        M.set(lm.subarray(me * 4, me * 4 + 4), k * 4); SD[k * 2] = side; SD[k * 2 + 1] = e === 0 ? 1 : -1; k++;
      }
      this.lVao = gl.createVertexArray(); gl.bindVertexArray(this.lVao);
      bufferF(gl, P, 0, 3); bufferF(gl, O, 1, 3); bufferF(gl, M, 2, 4); bufferF(gl, SD, 3, 2); gl.bindVertexArray(null);
      this.lineVerts = V;
    }
    // artefatos voadores
    {
      const N = tier.floaters, r = mulberry32(4242), P = new Float32Array(N * 3), R = new Float32Array(N * 4);
      for (let i = 0; i < N; i++) {
        const u = r() * 2 - 1, th = r() * 6.2832, rad = 1.5 + Math.pow(r(), 0.8) * 4.2, q = Math.sqrt(1 - u * u);
        P.set([rad * q * Math.cos(th), rad * u * 0.75, rad * q * Math.sin(th)], i * 3);
        R.set([r(), 0.6 + r() * 1.1, r(), r()], i * 4);
      }
      this.fVao = gl.createVertexArray(); gl.bindVertexArray(this.fVao);
      bufferF(gl, P, 0, 3); bufferF(gl, R, 1, 4); gl.bindVertexArray(null); this.floatN = N;
    }
    this.nVao = gl.createVertexArray(); gl.bindVertexArray(this.nVao);
    bufferF(gl, data.network.nodePos, 0, 3); bufferF(gl, data.network.nodeMeta, 1, 4); gl.bindVertexArray(null);
    this.emptyVao = gl.createVertexArray();
    this.post = new Post(gl);
    this.usePost = tier.post;

    this.regA = new Float32Array(9 * 4); this.regC = new Float32Array(9 * 3); this.regS = new Float32Array(9);
    REGIONS.forEach((r, i) => { this.regA.set([...r.pos, REGION_RADIUS], i * 4); this.regC.set(hexLin(r.cor), i * 3); });
    const c = T.colors;
    this.cols = { a: hexLin(c.purple[1]), b: hexLin(c.pink[1]), c: hexLin(c.blue[1]), bg0: hexLin(c.bg0), bg1: hexLin(c.bg1) };
    this.resize();
    addEventListener('resize', () => this.resize());
    if (this.reduced) this.assemble = 1;
  }

  /* ---------- API pública ---------- */
  /** Aplica as Opções: paleta {a,b,c,reg:[9 hex]}, universo {uni 0..1}, artefatos {floatOn, floatQty 0..1}. */
  setLook(l) {
    if (l.pal) {
      this.pal = l.pal;
      if (this.cols) { this.cols.a = hexLin(l.pal.a); this.cols.b = hexLin(l.pal.b); this.cols.c = hexLin(l.pal.c); }
      if (!this.defReg) this.defReg = REGIONS.map(r => r.cor);
      if (this.regC) REGIONS.forEach((r, i) => { r.cor = (l.pal.reg || this.defReg)[i]; this.regC.set(hexLin(r.cor), i * 3); });
      this.onPalette && this.onPalette();
    }
    if (l.uni != null) this.look.uni = l.uni;
    if (l.floatOn != null) this.look.floatOn = l.floatOn;
    if (l.floatQty != null) this.look.floatQty = l.floatQty;
    this.dirty = true;
  }
  setMode(mode, focusKey) {
    if (mode !== this.mode) this.cam.startWarp();
    this.mode = mode; if (focusKey) this.focusKey = focusKey; this.dirty = true;
  }
  /** Palco: retângulo (px de tela) onde o cérebro deve ficar centralizado. Só afeta a câmera do modelo. */
  setStage(st, imediato) {
    const W = this.cssW, H = this.cssH, cx = (st.left + st.right) / 2, cy = (st.top + st.bottom) / 2;
    this.cam.setLens(cx / W * 2 - 1, 1 - cy / H * 2, clamp((st.bottom - st.top) / H, 0.62, 1), imediato); this.dirty = true;
  }
  setProgress(p) { this.progress = clamp(p, 0, 1); this.dirty = true; }
  setHover(i) { this.hover = i; this.dirty = true; }
  setMouse(x, y) { this.cam.setMouse(x, y); this.dirty = true; }
  flyTo(key, mul) { this.dirty = true; return this.cam.flyTo(key, mul); }
  releaseFly() { this.cam.releaseFly(); }
  warp() { this.cam.startWarp(); this.dirty = true; }
  get flying() { return !!this.cam.fly; }
  get qualityName() { return this.tier.nome; }
  get stopIndex() { return this.cam.stopF; }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, this.tier.dprCap);
    const c = this.canvas, cssW = Math.max(1, innerWidth), cssH = Math.max(1, innerHeight), s = this.dpr * this.dprScale;
    this.cssW = cssW; this.cssH = cssH;
    this.w = Math.max(2, Math.round(cssW * s)); this.h = Math.max(2, Math.round(cssH * s));
    c.width = this.w; c.height = this.h;
    c.style.width = cssW + 'px'; c.style.height = cssH + 'px';
    if (this.post) this.post.resize(this.w, this.h, this.tier.bloomLevels);
    this.dirty = true;
  }

  start() {
    if (this.running) return; this.running = true;
    let last = performance.now();
    const loop = now => {
      if (!this.running) return;
      requestAnimationFrame(loop);
      if (this.lost || document.hidden) { last = now; return; }
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const busy = this.cam.fly || this.cam.warpT >= 0 || Math.abs(this.cam.pS - this.progress) > 0.0004 || this.assemble < 1 || this.cam.lensMoving;
      if (this.reduced && !this.dirty && !busy) return;
      this.dirty = false;
      this.frame(dt, now);
    };
    requestAnimationFrame(loop);
  }
  stop() { this.running = false; }

  /* ---------- quadro ---------- */
  frame(dt, now) {
    const gl = this.gl, T = THEME, cam = this.cam, aspect = this.w / this.h;
    const t0 = performance.now();
    if (!this.reduced) this.time += dt;
    this.assemble = this.reduced ? 1 : clamp(this.assemble + dt / T.timing.assemble, 0, 1);
    const st = { mode: this.mode, progress: this.progress, focusKey: this.focusKey, reduced: this.reduced };
    cam.update(dt, this.time, st, aspect);

    // regiões acesas: a da jornada (mais próxima do passo atual) + a sob o mouse
    const f = cam.stopF, k = 1 - Math.exp(-dt * 6);
    for (let i = 0; i < 9; i++) {
      const si = STOPS.indexOf(REGIONS[i].id);
      let target = 0.10 + 0.05 * Math.sin(this.time * 1.2 + i);
      if (this.mode === 'journey' || cam.fly) {
        const near = clamp(1 - Math.abs(f - si) * 1.6, 0, 1);
        target = Math.max(target, near * 0.95);
      }
      if (this.mode === 'login' || this.mode === 'static') target = Math.max(target, 0.18);
      if (this.hover === i) target = 1;
      if (this.manual[i] > target) target = this.manual[i];
      this.act[i] += (target - this.act[i]) * k;
      this.regS[i] = this.act[i] * T.glow.regionBoost;
    }

    const dim = this.mode === 'app' ? T.dim.app : this.mode === 'journey' ? T.dim.journey : T.dim.login;
    const VP = m4.mul(cam.proj, cam.view);
    this.VP = VP;
    const ang = T.gradient.angleDeg * Math.PI / 180 + this.time * T.gradient.spin * 0.2;
    const px = this.h / Math.max(1, this.cssH) * 0.9 + 0.3;

    if (this.usePost) this.post.beginScene(); else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, this.w, this.h); }
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);

    const common = p => {
      p.use();
      const u = n => p.u(n);
      gl.uniform1f(u('uTime'), this.time); gl.uniform3fv(u('uCA'), this.cols.a); gl.uniform3fv(u('uCB'), this.cols.b); gl.uniform3fv(u('uCC'), this.cols.c);
      gl.uniform1f(u('uAng'), ang); gl.uniform1f(u('uGlow'), T.glow.intensity * this.glowMul()); gl.uniform1f(u('uDim'), dim);
      gl.uniform1f(u('uAssemble'), this.assemble); gl.uniformMatrix4fv(u('uVP'), false, VP);
      gl.uniform4fv(u('uRegA[0]'), this.regA); gl.uniform3fv(u('uRegC[0]'), this.regC); gl.uniform1fv(u('uRegS[0]'), this.regS);
      gl.uniform1f(u('uPx'), px);
    };

    // fundo
    const bg = this.prog.bg.use(); gl.bindVertexArray(this.emptyVao);
    const fwd = [cam.view[2], cam.view[6], cam.view[10]].map(x => -x), right = [cam.view[0], cam.view[4], cam.view[8]], up = [cam.view[1], cam.view[5], cam.view[9]];
    gl.uniform3fv(bg.u('uRight'), right); gl.uniform3fv(bg.u('uUp'), up); gl.uniform3fv(bg.u('uFwd'), fwd);
    gl.uniform1f(bg.u('uTan'), Math.tan(cam.fovNow * Math.PI / 360)); gl.uniform1f(bg.u('uAspect'), aspect); gl.uniform1f(bg.u('uTime'), this.time);
    gl.uniform3fv(bg.u('uBg0'), this.cols.bg0); gl.uniform3fv(bg.u('uBg1'), this.cols.bg1);
    gl.uniform3fv(bg.u('uCA'), this.cols.a); gl.uniform3fv(bg.u('uCB'), this.cols.b); gl.uniform3fv(bg.u('uCC'), this.cols.c);
    gl.uniform1f(bg.u('uDim'), 0.55 + dim * 0.45); gl.uniform3fv(bg.u('uEye'), cam.eye); gl.uniform1f(bg.u('uUni'), this.look.uni);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);

    // malha (vidro)
    const m = this.prog.mesh; common(m);
    gl.uniform3fv(m.u('uCam'), cam.eye); gl.uniform1f(m.u('uRim'), T.glow.rim); gl.uniform1f(m.u('uBoost'), 1); gl.uniform1f(m.u('uBreath'), this.reduced ? 0 : 1);
    const gains = [1, 0.5, 0.42];
    this.meshes.forEach((me, mi) => { gl.uniform1f(m.u('uGain'), gains[mi]); gl.bindVertexArray(me.vao); gl.drawElements(gl.TRIANGLES, me.n, gl.UNSIGNED_INT, 0); });

    // partículas
    const pp = this.prog.part; common(pp);
    gl.uniform1f(pp.u('uFocus'), cam.focus); gl.uniform1f(pp.u('uBokeh'), cam.bokeh * (this.tier.post ? 1 : 0.5)); gl.uniform1f(pp.u('uWarp'), cam.warp);
    gl.bindVertexArray(this.pVao); gl.drawArrays(gl.POINTS, 0, Math.floor(this.data.particles.count * this.partFrac));

    // sinapses
    const lp = this.prog.line; common(lp);
    gl.uniform2f(lp.u('uRes'), this.w, this.h); gl.uniform1f(lp.u('uLineW'), 1.6 * this.h / Math.max(1, this.cssH));
    gl.bindVertexArray(this.lVao); gl.drawArrays(gl.TRIANGLES, 0, this.lineVerts);

    // nós
    const np = this.prog.node; common(np);
    gl.bindVertexArray(this.nVao); gl.drawArrays(gl.POINTS, 0, this.tier.nodes ? Math.min(this.tier.nodes, this.data.network.nodeCount) : this.data.network.nodeCount);
    const nf = this.look.floatOn ? Math.floor(this.floatN * this.look.floatQty * this.floatCap) : 0;
    if (nf > 0) {
      const fp = this.prog.flo; common(fp);
      gl.uniform1f(fp.u('uFocus'), cam.focus); gl.uniform1f(fp.u('uBokeh'), cam.bokeh); gl.uniform1f(fp.u('uSize'), 12);
      gl.bindVertexArray(this.fVao); gl.drawArrays(gl.POINTS, 0, nf);
    }
    gl.bindVertexArray(null); gl.disable(gl.BLEND);

    if (this.usePost) this.post.render({ bloom: 1, warp: cam.warp, aberr: 1, grain: this.reduced ? 0.4 : 1, time: this.time });

    this.project(VP);
    this.onFrame && this.onFrame(this);
    this.adapt(performance.now() - t0, dt);
  }

  glowMul() { return 1; }

  project(VP) {
    REGIONS.forEach((r, i) => {
      const c = m4.mulPoint(VP, r.pos), a = this.anchors[i];
      if (c[3] <= 0.02) { a.ok = false; return; }
      const nx = c[0] / c[3], ny = c[1] / c[3];
      a.x = (nx * 0.5 + 0.5) * this.cssW; a.y = (1 - (ny * 0.5 + 0.5)) * this.cssH;
      a.depth = c[3]; a.s = clamp(1.8 / c[3], 0.35, 2.2);
      a.ok = nx > -1.15 && nx < 1.15 && ny > -1.15 && ny < 1.15;
    });
  }

  /** Qualidade adaptativa: mede o tempo entre quadros. Se cair abaixo de ~50 fps reduz primeiro a resolução,
   *  depois os efeitos (artefatos, bloom, partículas). Se sobrar folga, devolve a resolução aos poucos. */
  adapt(cpuMs, dt) {
    if (this.reduced) return;
    this.ema += (dt * 1000 - this.ema) * 0.05;
    this.adaptTick = (this.adaptTick || 0) + 1;
    if (this.adaptTick < 45) return;
    this.adaptTick = 0;
    const target = this.mode === 'app' ? 28 : 19.5;
    if (this.ema > target) {
      if (this.dprScale > 0.72) { this.dprScale = Math.max(0.72, this.dprScale * 0.88); this.resize(); }
      else this.degrade();
    } else if (this.ema < 14 && this.dprScale < 1) { this.dprScale = Math.min(1, this.dprScale * 1.06); this.resize(); }
  }
  degrade() {
    if (this.degradeLvl >= 3) return;
    this.degradeLvl++;
    if (this.degradeLvl === 1) this.floatCap = 0.5;
    else if (this.degradeLvl === 2) { this.tier = { ...this.tier, bloomLevels: Math.min(2, this.tier.bloomLevels) }; this.post.resize(this.w, this.h, this.tier.bloomLevels); }
    else this.partFrac = 0.6;
    this.ema = 16;
  }
}
