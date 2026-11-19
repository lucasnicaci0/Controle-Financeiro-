/**
 * CARTÕES — a camada de interface da jornada: cartões de vidro ligados às regiões do cérebro por linhas
 * luminosas (SVG), hover nos dois sentidos, clique/duplo clique para voar, roteiro por scroll.
 * Também gera a lista em texto de cada região (alternativa acessível e fallback sem WebGL).
 */
import { REGIONS } from './regions.js';
import { STOPS } from './camera.js';
import { THEME } from './theme.js';
import { clamp } from './math.js';

const NS = 'http://www.w3.org/2000/svg';
const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const sv = (tag, at) => { const e = document.createElementNS(NS, tag); for (const k in at) e.setAttribute(k, at[k]); return e; };
const plural = (n, a, b) => n + ' ' + (n === 1 ? a : b);

/** Converte a resposta do back-end ('resumo' e 'consultor') no texto de cada região. */
export function regionData(res, con, brl) {
  const out = {}, dicas = (con && con.dicas) || [];
  const o = res.orcamentos || [], serie = res.serie || [];
  const g = o.reduce((s, x) => s + x.gasto, 0), l = o.reduce((s, x) => s + x.limite, 0);
  out.prefrontal = o.length ? { v: Math.round(g / l * 100) + '% do limite', s: brl(g) + ' de ' + brl(l) + ' em ' + plural(o.length, 'orçamento', 'orçamentos'), t: g > l ? 'neg' : '' }
    : { v: 'Sem orçamentos', s: 'Defina um limite por categoria para planejar o mês.' };
  const risco = dicas.filter(d => d.nivel === 'alerta' || d.nivel === 'atencao');
  out.amigdala = risco.length ? { v: plural(risco.length, 'alerta', 'alertas'), s: risco[0].titulo, t: 'neg' } : { v: 'Tudo calmo', s: 'Nenhum risco detectado neste mês.', t: 'pos' };
  out.hipocampo = { v: brl(res.despesas) + ' gastos', s: 'Histórico de ' + plural(serie.length, 'mês', 'meses') + ' no extrato.' };
  out.estriado = { v: brl(res.saldoContas), s: 'Saldo somado de todas as suas contas.' };
  const ass = dicas.filter(d => /^Possível assinatura/.test(d.titulo));
  out.cerebelo = ass.length ? { v: plural(ass.length, 'recorrente', 'recorrentes'), s: ass[0].titulo.replace(/^Possível assinatura:\s*/, '') + ' e outras cobranças que se repetem.' }
    : { v: 'Nenhuma detectada', s: 'Cobranças que se repetem aparecem aqui.' };
  out.parietal = { v: brl(res.saldoMes), s: 'Receitas ' + brl(res.receitas) + ' · Despesas ' + brl(res.despesas), t: res.saldoMes < 0 ? 'neg' : 'pos' };
  const top = (res.porCategoria || [])[0];
  out.occipital = { v: plural(serie.length, 'mês', 'meses'), s: 'Receitas x despesas e categorias nos gráficos.' };
  out.temporal = top ? { v: top.nome, s: 'Maior gasto do mês: ' + brl(top.valor) + '. O consultor explica em palavras.' } : { v: 'Sem categorias', s: 'Registre lançamentos para receber insights.' };
  const gastos = serie.map(x => x.despesas).filter(x => x > 0), media = gastos.length ? gastos.reduce((a, b) => a + b, 0) / gastos.length : 0;
  const meses = media > 0 ? res.saldoContas / media : 0;
  out.tronco = { v: media > 0 ? meses.toFixed(1).replace('.', ',') + ' meses' : '—', s: 'de despesas cobertas pelo saldo. Meta comum: 3 a 6 meses.', t: media > 0 && meses < 3 ? 'neg' : '' };
  return out;
}

export class Cards {
  constructor(scene, root, opts) {
    this.scene = scene; this.root = root; this.onOpen = opts.onOpen; this.fmt = opts.brl;
    this.active = false; this.spacer = null; this.hoverBrain = -1; this.hoverCard = -1; this.pinned = -1; this.pinUntil = 0;
    this.ignoreScroll = 0; this.data = {}; this.lastFrame = performance.now();
    this.vis = new Float32Array(9); this.drawn = new Float32Array(9);
    this.mobile = () => innerWidth < 720;
    this.build();
    addEventListener('scroll', () => this.onScroll(), { passive: true });
    addEventListener('resize', () => { this.measure(); this.onScroll(); });
    document.addEventListener('pointermove', e => this.onPointer(e), { passive: true });
    document.addEventListener('click', e => this.onClick(e));
    document.addEventListener('dblclick', e => this.onClick(e));
    scene.onFrame = () => this.update();
  }

  build() {
    const r = this.root;
    this.hero = mk('div', 'jhero');
    this.hero.append(mk('h2', 'jt', 'Seu cérebro financeiro'), mk('p', 'jp', 'Role para entrar e conhecer cada região do seu dinheiro.'), mk('div', 'jhint', '↓'));
    this.svg = sv('svg', { class: 'rlines', 'aria-hidden': 'true' });
    this.paths = []; this.dots = [];
    REGIONS.forEach((reg, i) => {
      const p = sv('path', { class: 'rline', pathLength: '1', stroke: reg.cor }), d = sv('circle', { class: 'rdot', r: '4.5', fill: reg.cor });
      this.svg.append(p, d); this.paths.push(p); this.dots.push(d);
    });
    this.cards = REGIONS.map((reg, i) => {
      const c = mk('article', 'rc glass'); c.dataset.i = i; c.style.setProperty('--rc', reg.cor);
      c.setAttribute('aria-label', reg.nome + ': ' + reg.modulo);
      const h = mk('h3', null, reg.nome), m = mk('p', 'rm', reg.modulo), v = mk('div', 'rv', '…'), s = mk('p', 'rs', ''), b = mk('button', 'open', 'Abrir módulo →');
      b.type = 'button'; b.addEventListener('click', e => { e.stopPropagation(); this.onOpen(reg.tab); });
      c.append(h, m, v, s, b);
      c.addEventListener('pointerenter', () => { this.hoverCard = i; this.scene.setHover(i); });
      c.addEventListener('pointerleave', () => { this.hoverCard = -1; this.scene.setHover(this.hoverBrain); });
      c.addEventListener('focusin', () => { this.hoverCard = i; this.scene.setHover(i); });
      c.addEventListener('focusout', () => { this.hoverCard = -1; this.scene.setHover(this.hoverBrain); });
      c._v = v; c._s = s;
      return c;
    });
    // mobile: faixa de regiões na visão geral
    this.strip = mk('div', 'rstrip'); this.strip.setAttribute('role', 'list');
    REGIONS.forEach((reg, i) => { const b = mk('button', 'rchip', reg.nome); b.type = 'button'; b.setAttribute('role', 'listitem'); b.style.setProperty('--rc', reg.cor); b.onclick = () => this.fly(i); this.strip.append(b); });
    this.back = mk('button', 'rback btn ghost', 'Visão geral'); this.back.type = 'button'; this.back.onclick = () => this.overview();
    this.back.setAttribute('aria-label', 'Voltar à visão geral do cérebro');
    r.append(this.hero, this.svg, ...this.cards, this.strip, this.back);
    this.measure();
  }

  measure() { this.cw = this.cards.map(c => [c.offsetWidth || 300, c.offsetHeight || 150]); }

  setData(res, con) {
    this.data = regionData(res, con, this.fmt);
    this.cards.forEach((c, i) => { const d = this.data[REGIONS[i].id]; if (!d) return; c._v.textContent = d.v; c._v.className = 'rv ' + (d.t || ''); c._s.textContent = d.s; });
    this.measure();
  }

  attach(spacer) { this.spacer = spacer; }
  setActive(on) {
    this.active = on; this.root.classList.toggle('on', on);
    if (!on) { this.hoverBrain = -1; this.scene.setHover(-1); }
    else this.onScroll();
  }

  progress() {
    const s = this.spacer; if (!s || !s.isConnected) return 0;
    const r = s.getBoundingClientRect(), total = r.height - innerHeight;
    return total > 0 ? clamp(-r.top / total, 0, 1) : 0;
  }
  onScroll() {
    if (!this.active) return;
    const p = this.progress(); this.scene.setProgress(p);
    if (this.scene.flying && performance.now() > this.ignoreScroll) this.scene.releaseFly();
  }
  scrollToProgress(p) {
    const s = this.spacer; if (!s || !s.isConnected) return;
    const top = s.getBoundingClientRect().top + scrollY, total = s.offsetHeight - innerHeight;
    scrollTo({ top: top + total * p, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  /* ---------- interações ---------- */
  nearest(x, y, max) {
    let best = -1, bd = max;
    this.scene.anchors.forEach((a, i) => { if (!a.ok) return; const d = Math.hypot(a.x - x, a.y - y); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  uiTarget(t) { return t && t.closest && t.closest('.rc,button,a,input,select,textarea,.top,.navwrap,.glass,.menu,.rstrip'); }
  onPointer(e) {
    if (!this.active || e.pointerType === 'touch') return;
    const i = this.uiTarget(e.target) ? -1 : this.nearest(e.clientX, e.clientY, 70 * (this.scene.anchors[0].s || 1));
    if (i !== this.hoverBrain) { this.hoverBrain = i; if (this.hoverCard < 0) this.scene.setHover(i); document.body.classList.toggle('over-region', i >= 0); }
  }
  onClick(e) {
    if (!this.active || this.uiTarget(e.target)) return;
    const i = this.nearest(e.clientX, e.clientY, 80);
    if (i >= 0) this.fly(i);
  }
  fly(i) {
    const key = REGIONS[i].id, dur = this.scene.flyTo(key);
    this.pinned = i; this.pinUntil = performance.now() + dur * 1000 + 600; this.ignoreScroll = performance.now() + dur * 1000 + 250;
    this.scrollToProgress(STOPS.indexOf(key) / (STOPS.length - 1));
  }
  overview() {
    const dur = this.scene.flyTo('overview');
    this.pinned = -1; this.ignoreScroll = performance.now() + dur * 1000 + 250;
    this.scrollToProgress(1);
  }

  /* ---------- quadro ---------- */
  update() {
    const now = performance.now(), dt = Math.min(0.1, (now - this.lastFrame) / 1000); this.lastFrame = now;
    const sc = this.scene, f = sc.stopIndex, A = sc.anchors, W = sc.cssW, H = sc.cssH, mob = this.mobile();
    const over = this.active && f > STOPS.length - 1.55 && !sc.flying;
    if (over !== this.lastOver) { this.root.classList.toggle('over', over); this.measure(); this.lastOver = over; }
    this.hero.style.opacity = this.active ? String(clamp(1 - f * 2.4, 0, 1)) : '0';
    this.back.classList.toggle('show', this.active && f > 1.2);
    this.strip.classList.toggle('show', this.active && over && mob);

    // quais cartões aparecem
    const want = new Float32Array(9);
    if (this.active) {
      REGIONS.forEach((r, i) => {
        const si = STOPS.indexOf(r.id);
        if (over) want[i] = mob ? 0 : 1;
        else if (Math.abs(f - si) < 0.5) want[i] = 1;
      });
      if (this.pinned >= 0 && now < this.pinUntil) { want.fill(0); want[this.pinned] = 1; }
      const h = this.hoverCard >= 0 ? this.hoverCard : this.hoverBrain;
      if (h >= 0 && !mob) want[h] = 1;
    }

    // posições
    const pos = new Array(9).fill(null), pad = Math.max(14, W * 0.045), top = 92, bot = H - (mob ? 24 : 40);
    const list = REGIONS.map((_, i) => i).filter(i => want[i] > 0 && A[i].ok);
    if (mob) {
      list.forEach(i => { const [cw, ch] = this.cw[i]; pos[i] = { x: 12, y: H - ch - 92, w: W - 24, side: 'b' }; });
    } else if (over) {
      const s = list.slice().sort((a, b) => A[a].x - A[b].x), half = Math.ceil(s.length / 2), L = s.slice(0, half).sort((a, b) => A[a].y - A[b].y), R = s.slice(half).sort((a, b) => A[a].y - A[b].y);
      [[L, 'l'], [R, 'r']].forEach(([col, side]) => {
        const n = col.length, hh = Math.min(...col.map(i => this.cw[i][1])) || 100, gap = Math.max(8, Math.min(14, (bot - top - n * hh) / Math.max(1, n - 1)));
        let y = top + Math.max(0, (bot - top - (n * hh + (n - 1) * gap)) / 2);
        col.forEach(i => { const [cw] = this.cw[i]; pos[i] = { x: side === 'l' ? pad : W - cw - pad, y, side }; y += hh + gap; });
      });
    } else {
      list.forEach(i => {
        const [cw, ch] = this.cw[i], left = A[i].x > W * 0.52;
        pos[i] = { x: left ? pad : W - cw - pad, y: clamp(A[i].y - ch / 2, top, Math.max(top, bot - ch)), side: left ? 'l' : 'r' };
      });
    }

    this.cards.forEach((c, i) => {
      const target = want[i] > 0 && pos[i] ? 1 : 0;
      this.vis[i] += (target - this.vis[i]) * (1 - Math.exp(-dt / (THEME.timing.cardFade / 4)));
      const on = this.vis[i] > 0.02;
      c.classList.toggle('show', target > 0); c.style.visibility = on ? 'visible' : 'hidden'; c.style.opacity = this.vis[i].toFixed(3);
      c.classList.toggle('hl', i === this.hoverBrain || i === this.hoverCard);
      const p = pos[i];
      if (p && on) {
        if (mob) { c.style.transform = 'translate3d(0,0,0)'; c.style.left = '12px'; c.style.top = p.y + 'px'; c.style.width = (W - 24) + 'px'; }
        else { c.style.width = ''; c.style.left = '0px'; c.style.top = '0px'; c.style.transform = 'translate3d(' + p.x.toFixed(1) + 'px,' + (p.y + (1 - this.vis[i]) * 14).toFixed(1) + 'px,0)'; }
      }
      // linha cérebro → cartão (se desenha em lineDraw segundos)
      const path = this.paths[i], dot = this.dots[i], a = A[i];
      this.drawn[i] = clamp(this.drawn[i] + (target > 0 && p && a.ok ? 1 : -1.6) * dt / THEME.timing.lineDraw, 0, 1);
      const k = this.drawn[i];
      if (k > 0 && p && a.ok) {
        const [cw, ch] = this.cw[i], w = mob ? W - 24 : cw;
        const ex = mob ? W / 2 : (p.side === 'l' ? p.x + w : p.x), ey = mob ? p.y : p.y + ch / 2, mx = (a.x + ex) / 2;
        path.setAttribute('d', mob ? 'M' + a.x.toFixed(1) + ' ' + a.y.toFixed(1) + ' C' + a.x.toFixed(1) + ' ' + ((a.y + ey) / 2).toFixed(1) + ' ' + ex + ' ' + ((a.y + ey) / 2).toFixed(1) + ' ' + ex + ' ' + ey.toFixed(1)
          : 'M' + a.x.toFixed(1) + ' ' + a.y.toFixed(1) + ' C' + mx.toFixed(1) + ' ' + a.y.toFixed(1) + ' ' + mx.toFixed(1) + ' ' + ey.toFixed(1) + ' ' + ex.toFixed(1) + ' ' + ey.toFixed(1));
        path.style.strokeDashoffset = (1 - k).toFixed(3); path.style.opacity = (0.35 + 0.65 * Math.min(1, k * 2)).toFixed(2);
        dot.setAttribute('cx', a.x.toFixed(1)); dot.setAttribute('cy', a.y.toFixed(1)); dot.style.opacity = Math.min(1, k * 3).toFixed(2);
      } else { path.style.opacity = '0'; dot.style.opacity = '0'; }
    });
  }

  /* ---------- texto de cada região (acessível / fallback) ---------- */
  renderList(container, visible) {
    container.replaceChildren();
    const ul = mk('ul', visible ? 'rlist' : 'sr');
    REGIONS.forEach((r, i) => {
      const li = mk('li', visible ? 'card glass rl' : ''), d = this.data[r.id] || {};
      li.style.setProperty('--rc', r.cor);
      li.append(mk('h3', visible ? 'rh' : '', r.nome), mk('p', visible ? 'rm' : '', r.modulo + '. ' + r.alt));
      if (d.v) li.append(mk('p', visible ? 'rv ' + (d.t || '') : '', d.v + (d.s ? ' — ' + d.s : '')));
      const b = mk('button', visible ? 'btn ghost' : 'sr-btn', 'Abrir ' + r.modulo.split(',')[0].toLowerCase()); b.type = 'button'; b.onclick = () => this.onOpen(r.tab);
      li.append(b); ul.append(li);
    });
    container.append(ul);
  }
  refreshList(container, visible) { if (container && container.isConnected) this.renderList(container, visible); }
}
