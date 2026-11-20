/**
 * CURSOR, MAGNETISMO e REVELAÇÃO DE TEXTO — microinterações da interface.
 * Tudo desligado em telas de toque e com prefers-reduced-motion.
 */
import { THEME } from './theme.js';

const fine = () => matchMedia('(hover:hover) and (pointer:fine)').matches;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Cursor personalizado: ponto + anel que acompanha com atraso + rastro luminoso (canvas 2D). */
export function initCursor() {
  if (!fine() || reduced()) return;
  const c = Object.assign(document.createElement('canvas'), { id: 'cursorfx' }), g = c.getContext('2d');
  c.setAttribute('aria-hidden', 'true'); document.body.append(c);
  const dot = Object.assign(document.createElement('div'), { className: 'cur-dot' }), ring = Object.assign(document.createElement('div'), { className: 'cur-ring' });
  dot.setAttribute('aria-hidden', 'true'); ring.setAttribute('aria-hidden', 'true'); document.body.append(dot, ring);
  document.documentElement.classList.add('cursor-on');
  let W = 0, H = 0, dpr = 1;
  const fit = () => { dpr = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight; c.width = W * dpr; c.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0); };
  fit(); addEventListener('resize', fit);
  const m = { x: -100, y: -100 }, r = { x: -100, y: -100 }, trail = []; let seen = false, press = 0;
  addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    m.x = e.clientX; m.y = e.clientY; if (!seen) { r.x = m.x; r.y = m.y; seen = true; document.documentElement.classList.add('cursor-seen'); }
    const t = e.target.closest && e.target.closest('a,button,[role=button],.rc,input,select,.tilt');
    ring.classList.toggle('hot', !!t && !(t.matches && t.matches('input,select')));
  }, { passive: true });
  addEventListener('pointerdown', () => { press = 1; ring.classList.add('down'); });
  addEventListener('pointerup', () => { press = 0; ring.classList.remove('down'); });
  document.addEventListener('pointerleave', () => document.documentElement.classList.remove('cursor-seen'));
  document.addEventListener('pointerenter', () => seen && document.documentElement.classList.add('cursor-seen'));
  const A = THEME.colors, col = ['#8B5CF6', '#FF4DA6', '#22D3EE'];
  (function loop() {
    requestAnimationFrame(loop);
    if (document.hidden) return;
    r.x += (m.x - r.x) * 0.18; r.y += (m.y - r.y) * 0.18;
    dot.style.transform = 'translate3d(' + m.x + 'px,' + m.y + 'px,0)'; ring.style.transform = 'translate3d(' + r.x + 'px,' + r.y + 'px,0)';
    if (seen) {
      const last = trail[trail.length - 1];
      if (last && Math.hypot(last.x - m.x, last.y - m.y) > 220) trail.length = 0;   // salto grande: não liga os pontos com uma linha
      trail.push({ x: m.x, y: m.y, t: performance.now() });
    }
    while (trail.length > 22) trail.shift();
    g.clearRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';
    for (let i = 1; i < trail.length; i++) {
      const a = trail[i - 1], b = trail[i], k = i / trail.length;
      g.strokeStyle = col[i % 3]; g.globalAlpha = k * 0.5; g.lineWidth = 1 + k * 4;
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    }
    g.globalAlpha = 1;
  })();
}

/** Botões "magnéticos": são puxados levemente em direção ao cursor quando ele chega perto. */
export function initMagnetic(sel) {
  if (!fine() || reduced()) return;
  const S = sel || '.btn,.nav button,.icon,.avatar,.rc .open,.rback,.rchip,.seg button';
  let cur = null;
  const reset = el => { el.style.transform = ''; el.classList.remove('mag'); };
  addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    const el = e.target.closest && e.target.closest(S);
    if (cur && cur !== el) { reset(cur); cur = null; }
    if (!el || el.disabled) return;
    const r = el.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    el.classList.add('mag'); el.style.transform = 'translate(' + (dx * 0.22).toFixed(1) + 'px,' + (dy * 0.3).toFixed(1) + 'px)'; cur = el;
  }, { passive: true });
  document.addEventListener('pointerleave', () => { if (cur) { reset(cur); cur = null; } });
}

/**
 * Revelação de texto: cada linha (ou palavra) surge de borrado e deslocada para nítido.
 * Mantém o texto original num aria-label para leitores de tela.
 */
export function revealText(el, mode) {
  if (!el || el.dataset.rv) return;
  const txt = el.textContent; el.dataset.rv = '1';
  if (reduced()) return;
  el.setAttribute('aria-label', txt);
  const words = txt.split(/\s+/).filter(Boolean); el.textContent = '';
  const step = mode === 'line' ? 0 : 55;
  words.forEach((w, i) => {
    const s = document.createElement('span'); s.className = 'rw'; s.setAttribute('aria-hidden', 'true');
    s.style.animationDelay = (i * (step || 70)) + 'ms'; s.textContent = w; el.append(s, i < words.length - 1 ? ' ' : '');
  });
}
export function replayReveal(el) { if (!el) return; delete el.dataset.rv; el.querySelectorAll && el.querySelectorAll('.rw').forEach(s => { s.style.animation = 'none'; void s.offsetWidth; s.style.animation = ''; }); }
