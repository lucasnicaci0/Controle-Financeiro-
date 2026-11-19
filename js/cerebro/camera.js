/**
 * CÂMERA — roteiro cinematográfico guiado pelo scroll.
 *   abertura → entrada (atravessa a malha) → 9 regiões → visão geral
 * Todos os movimentos usam power3.inOut. A câmera real segue a pose-alvo com suavização,
 * então nunca há solavancos, mesmo com scroll brusco.
 */
import { THEME } from './theme.js';
import { REGIONS } from './regions.js';
import { clamp, lerp, power3InOut, m4, v3 } from './math.js';

const C = THEME.camera;
const pose = (eye, target, fov, bokeh, idle) => ({ eye: eye.slice(), target: target.slice(), fov, bokeh, idle });
const copy = p => pose(p.eye, p.target, p.fov, p.bokeh, p.idle);
const mix = (a, b, t) => pose(v3.lerp(a.eye, b.eye, t), v3.lerp(a.target, b.target, t), lerp(a.fov, b.fov, t), lerp(a.bokeh, b.bokeh, t), lerp(a.idle, b.idle, t));

export const POSES = {
  intro: pose([5.3, 1.7, 6.3].map(x => x * C.introDistance / 8.3), [0, 0, 0], C.fovIntro, 0.15, 1),
  enter: pose([0.10, 0.12, 0.62], [0.0, 0.0, -0.55], C.fovEnter, 0.5, 0),
  overview: pose([2.95, 0.95, 3.55], [0, -0.05, 0], C.fovOverview, 0.2, 1)
};
REGIONS.forEach(r => { POSES[r.id] = pose(r.cam, r.pos, r.fov, 0.95, 0); });

// Roteiro do scroll (ordem narrativa): planejar → impulso → memória → recompensa → rotina → números → visão → linguagem → base
export const STOPS = ['intro', 'enter', 'prefrontal', 'amigdala', 'hipocampo', 'estriado', 'cerebelo', 'parietal', 'occipital', 'temporal', 'tronco', 'overview'];

// Pose da câmera nas telas comuns do app: afastada, para o cérebro servir de cenário.
function appPose(key) {
  const p = POSES[key] || POSES.overview, t = p.target;
  const dir = v3.sub(p.eye, t);
  return pose(v3.add(t, v3.scale(dir, key === 'overview' || key === 'intro' ? 1 : 1.9)), v3.add(t, [0.28, 0, 0]), Math.min(p.fov, 46), 0.4, key === 'overview' || key === 'intro' ? 1 : 0.35);
}

export class Camera {
  constructor() {
    this.cur = copy(POSES.intro); this.tgt = copy(POSES.intro);
    this.mouse = [0, 0]; this.mouseS = [0, 0];
    this.fly = null; this.pS = 0; this.stopF = 0; this.warp = 0; this.warpT = -1; this.time = 0;
    this.view = new Float32Array(16); this.proj = new Float32Array(16); this.eye = [0, 0, 5]; this.focus = 5; this.bokeh = .2; this.fovNow = 40;
  }

  setMouse(x, y) { this.mouse[0] = x; this.mouse[1] = y; }
  startWarp() { this.warpT = 0; }

  /** Voo até uma pose (clique numa região, "Visão geral"). Retorna a duração. */
  flyTo(key) {
    const to = POSES[key]; if (!to) return 0;
    this.fly = { from: copy(this.cur), to: copy(to), t: 0, dur: C.flyDuration / C.speed };
    this.startWarp();
    return this.fly.dur;
  }
  releaseFly() { this.fly = null; }

  timeline(p) {
    const n = STOPS.length, s = clamp(p, 0, 1) * (n - 1), i = Math.min(n - 2, Math.floor(s));
    const f = power3InOut(clamp((s - i - C.hold) / (1 - 2 * C.hold), 0, 1));
    return mix(POSES[STOPS[i]], POSES[STOPS[i + 1]], f);
  }

  update(dt, time, st, aspect) {
    this.time = time;
    // alvo
    let target;
    if (this.fly) {
      this.fly.t += dt; const k = clamp(this.fly.t / this.fly.dur, 0, 1);
      target = mix(this.fly.from, this.fly.to, power3InOut(k));
    } else if (st.mode === 'journey') {
      this.pS += (st.progress - this.pS) * (1 - Math.exp(-dt * 5 * C.speed));
      target = this.timeline(this.pS);
    } else if (st.mode === 'app') target = appPose(st.focusKey);
    else target = copy(st.mode === 'static' ? POSES.overview : POSES.intro);
    this.stopF = clamp(this.pS, 0, 1) * (STOPS.length - 1);

    const follow = (this.fly ? 30 : st.mode === 'journey' ? C.follow * 3 : 2.2 * C.speed);
    const a = st.reduced ? 1 : 1 - Math.exp(-dt * follow);
    this.cur = mix(this.cur, target, this.fly ? 1 : a);

    // warp
    if (st.reduced) { this.warpT = -1; this.warp = 0; }
    if (this.warpT >= 0) {
      this.warpT += dt / THEME.timing.warp;
      const k = this.warpT, e = k < .35 ? power3InOut(k / .35) : 1 - power3InOut((k - .35) / .65);
      this.warp = clamp(e, 0, 1);
      if (k >= 1) { this.warpT = -1; this.warp = 0; }
    }

    // órbita lenta em repouso + parallax do mouse
    this.mouseS[0] += (this.mouse[0] - this.mouseS[0]) * (1 - Math.exp(-dt * 3));
    this.mouseS[1] += (this.mouse[1] - this.mouseS[1]) * (1 - Math.exp(-dt * 3));
    let eye = this.cur.eye.slice(), tg = this.cur.target.slice();
    const idle = st.reduced ? 0 : this.cur.idle;
    if (idle > 0.001) {
      const th = time * C.orbitSpeed * idle * C.speed, c = Math.cos(th), s = Math.sin(th), dx = eye[0] - tg[0], dz = eye[2] - tg[2];
      eye[0] = tg[0] + dx * c - dz * s; eye[2] = tg[2] + dx * s + dz * c;
    }
    const dist = v3.dist(eye, tg), fwd = v3.norm(v3.sub(tg, eye)), right = v3.norm(v3.cross(fwd, [0, 1, 0])), up = v3.cross(right, fwd);
    if (!st.reduced) {
      const px = this.mouseS[0] * C.parallax * dist, py = this.mouseS[1] * C.parallax * dist * .6;
      eye = v3.add(eye, v3.add(v3.scale(right, px), v3.scale(up, py)));
    }
    this.eye = eye;
    this.focus = Math.max(0.1, v3.dist(eye, tg));
    this.bokeh = this.cur.bokeh;
    let fv = this.cur.fov + this.warp * 9;
    if (aspect < 1) fv = Math.min(105, 2 * Math.atan(Math.tan(fv * Math.PI / 360) * Math.pow(1 / aspect, 0.6)) * 180 / Math.PI);   // telas em pé: abre o campo de visão
    this.fovNow = fv;
    this.view = m4.lookAt(eye, tg, [0, 1, 0]);
    this.proj = m4.perspective(this.fovNow * Math.PI / 180, aspect, 0.03, 80);
  }
}
