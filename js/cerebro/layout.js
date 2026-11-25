/**
 * CAMADA DE LAYOUT — decide ONDE cada coisa fica, para que o cérebro, os cartões e os planos nunca se sobreponham.
 *  • palco   : retângulo livre entre o topo (cabeçalho + abas) e a base (barra de abas no celular). O cérebro é
 *              centralizado e ajustado a ele (deslocamento de lente na câmera).
 *  • colunas : cada cartão tem lado e ordem FIXOS (LADOS). A rotação do modelo não os move.
 *  • cobertura: quanto a seção "Planos" (uma folha opaca) já subiu sobre o palco. O motor 3D esmaece e pausa.
 * Variáveis CSS publicadas em :root: --palco-top, --palco-bottom.
 */
import { clamp } from './math.js';

export const LADOS = {
  l: ['prefrontal', 'estriado', 'hipocampo', 'amigdala', 'tronco'],
  r: ['parietal', 'occipital', 'temporal', 'cerebelo']
};
export const ladoDe = id => (LADOS.l.includes(id) ? 'l' : 'r');

export class Layout {
  constructor() {
    this.jornada = false; this.subs = new Set(); this.cover = 0;
    this.stage = { top: 0, bottom: innerHeight, left: 0, right: innerWidth, w: innerWidth, h: innerHeight };
    this.measure();
    let raf = 0;
    const agenda = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; this.measure(); this.coverage(); }); };
    addEventListener('resize', agenda); addEventListener('scroll', agenda, { passive: true });
    if (window.ResizeObserver) { const ro = new ResizeObserver(agenda); ['.top', '.navwrap'].forEach(q => { const e = document.querySelector(q); if (e) ro.observe(e); }); }
  }
  onChange(f) { this.subs.add(f); return () => this.subs.delete(f); }
  setJourney(on) { this.jornada = !!on; this.measure(true); this.coverage(); }

  measure(force) {
    const W = innerWidth, H = innerHeight, q = s => document.querySelector(s), shell = q('#shell');
    let top = 0, bottom = H;
    if (this.jornada && shell && !shell.hidden) {
      const hd = q('.top'), nav = q('.navwrap'), mob = W <= 620;
      if (hd) top = Math.max(top, hd.getBoundingClientRect().bottom);
      if (nav) { const r = nav.getBoundingClientRect(); if (mob) bottom = Math.min(bottom, r.top - 8); else top = Math.max(top, r.bottom); }
      top += 12; bottom = Math.max(top + 160, bottom - (mob ? 0 : 40));
    }
    const pl = q('.planos');   // espaço que sobra abaixo da folha (aviso legal): a folha cobre exatamente o resto da tela
    if (pl && this.jornada) document.documentElement.style.setProperty('--abaixo-planos', Math.max(0, Math.round(document.documentElement.scrollHeight - (pl.getBoundingClientRect().bottom + scrollY))) + 'px');
    const s = this.stage;
    if (!force && Math.abs(s.top - top) < 1 && Math.abs(s.bottom - bottom) < 1 && s.w === W && s.h === H) return;
    this.stage = { top, bottom, left: 0, right: W, w: W, h: H };
    const r = document.documentElement.style; r.setProperty('--palco-top', Math.round(top) + 'px'); r.setProperty('--palco-bottom', Math.round(H - bottom) + 'px');
    this.subs.forEach(f => f(this));
  }

  /** 0 = palco livre; 1 = a folha de planos cobre tudo. */
  coverage() {
    let c = 0, t = Infinity; const p = this.jornada && document.querySelector('.planos'), H = innerHeight;
    if (p) { t = p.getBoundingClientRect().top; c = clamp((H - t) / (H * 0.55), 0, 1); this.full = t <= this.stage.top + 6; } else this.full = false;
    if (Math.abs(c - this.cover) > 0.004 || Math.abs((this.sheetTop || 0) - t) > 0.5 && t < H + 50) { this.cover = c; this.sheetTop = t; this.subs.forEach(f => f(this)); }
  }
}
