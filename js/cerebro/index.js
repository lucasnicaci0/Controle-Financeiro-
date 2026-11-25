/**
 * ENTRADA DO CÉREBRO — liga o motor 3D ao app. O app (script clássico) fala com `window.CB`:
 * enquanto este módulo carrega, as chamadas ficam numa fila e são reproduzidas quando ele estiver pronto.
 * Se o WebGL2 não existir (ou falhar), o app segue normal com o fundo 2D e a jornada vira lista de texto.
 */
import { THEME } from './theme.js';
import { Scene } from './scene.js';
import { Cards } from './cards.js';
import { REGIONS } from './regions.js';
import { initCursor, initMagnetic, revealText, replayReveal } from './cursor.js';
import { BrainState } from './estado.js';
import { Layout } from './layout.js';
import { initControle } from './controle.js';

const $ = s => document.querySelector(s);
const loader = $('#loader'), bar = $('#ldbar'), txt = $('#ldtxt');
const CB = window.CB;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// tema → variáveis CSS (as cores nascem em theme.js)
(function aplicaTema() {
  const c = THEME.colors, r = document.documentElement.style;
  r.setProperty('--bg', c.bg0); r.setProperty('--ink', c.text); r.setProperty('--a', c.purple[1]); r.setProperty('--b', c.pink[1]); r.setProperty('--c', c.blue[1]);
})();

const progress = (p, t) => { if (bar) bar.style.width = Math.round(p * 100) + '%'; if (txt && t) txt.textContent = t; const l = $('#loader'); if (l) l.setAttribute('aria-valuenow', Math.round(p * 100)); };
const hideLoader = () => { if (!loader) return; loader.classList.add('done'); setTimeout(() => loader.remove(), 900); };

// o mesmo mapa de abas do app para a câmera nas telas comuns
const FOCO = { opcoes: 'overview', jornada: 'overview', painel: 'parietal', lanc: 'hipocampo', orc: 'prefrontal', metas: 'prefrontal', contas: 'estriado', cons: 'temporal' };

async function boot() {
  let scene = null, cards = null, api;
  const layout = new Layout();
  const base = {
    supported: false,
    fmt: CB.fmt,
    reveal: revealText, replay: replayReveal,
    setMode() {}, home() {}, setLook() {}, onView() {}, warp() {}, enterJourney() {}, leaveJourney() {}, setData() {}
  };
  try {
    progress(0.02, 'Preparando o cérebro…');
    scene = new Scene($('#gl'));
    await scene.init(progress);
    cards = new Cards(scene, $('#cerebro-ui'), { layout, onOpen: tab => CB.open(tab), brl: CB.fmt, tabName: t => ((document.querySelector('#nav button[data-v="' + t + '"]') || {}).textContent || t) });
    scene.onPalette = () => cards.recolor();
    scene.onLost = () => { document.documentElement.classList.remove('gl-on'); $('#fx').hidden = false; };
    /* ---- orquestração: 3D (scene) · interface (cards) · layout · controle (BrainState). Cada um só fala por métodos públicos. ---- */
    let spacer = null, listBox = null, emJornada = false, modo = { m: 'login', k: undefined }, view = 'login';
    const root = document.documentElement, ui = $('#cerebro-ui'), gl = $('#gl');
    const ativo = () => BrainState.ativo;

    // palco/cobertura → câmera (lente) e esmaecimento; com a folha de Planos cobrindo tudo, pausa o render
    const pausado = () => !scene.running;
    const sincLayout = () => {
      if (!ativo()) return;
      scene.setStage(emJornada ? layout.stage : { top: 0, bottom: innerHeight, left: 0, right: innerWidth });
      const c = emJornada ? layout.cover : 0;
      // a folha de Planos é opaca: a camada de cartões é recortada na borda dela (nada vaza para cima dos planos)
      const corte = emJornada && isFinite(layout.sheetTop) ? Math.max(0, innerHeight - layout.sheetTop) : 0;
      ui.style.clipPath = emJornada ? 'inset(' + Math.round(layout.stage.top) + 'px 0 ' + Math.round(corte) + 'px 0)' : '';
      ui.style.opacity = String(1 - c); ui.style.pointerEvents = c > 0.2 ? 'none' : '';
      const cobertoTodo = emJornada && layout.full;
      if (cobertoTodo && !pausado()) scene.stop(); else if (!cobertoTodo && pausado() && ativo()) scene.start();
    };
    layout.onChange(sincLayout);

    const mostraJornada = () => {   // cérebro ligado: palco 3D + lista só para leitores de tela
      if (!spacer) return;
      spacer.style.display = ''; cards.attach(spacer); layout.setJourney(true);
      document.body.classList.add('is-journey'); scene.setMode('journey'); cards.setActive(true); scene.setProgress(0);
      cards.renderList(listBox, false); sincLayout();
    };
    const mostraLista = () => {     // cérebro desligado: os mesmos dados em grade, sem 3D
      if (!spacer) return;
      spacer.style.display = 'none'; layout.setJourney(false); cards.setActive(false);
      document.body.classList.remove('is-journey'); cards.renderList(listBox, true);
    };

    const ligar = () => {
      root.classList.remove('cerebro-off'); root.classList.add('gl-on'); $('#fx').hidden = true;
      scene.resize(); scene.setMode(modo.m, modo.k); if (!scene.running) scene.start();
      if (emJornada) { scrollTo(0, 0); mostraJornada(); } else sincLayout();
      scene.setStage(emJornada ? layout.stage : { top: 0, bottom: innerHeight, left: 0, right: innerWidth }, true);
    };
    const desligar = () => {
      scene.stop(); cards.setActive(false); ui.style.opacity = ''; ui.style.clipPath = ''; ui.style.pointerEvents = ''; gl.style.opacity = '';
      root.classList.remove('gl-on'); root.classList.add('cerebro-off'); $('#fx').hidden = false;
      if (emJornada) { scrollTo(0, 0); mostraLista(); }
    };

    api = Object.assign(base, {
      supported: true, scene, cards, layout,
      setMode(m, k) { modo = { m, k }; if (m === 'login') { emJornada = false; layout.setJourney(false); } if (ativo()) scene.setMode(m, k); },
      onView(v) {
        view = v;
        if (v === 'jornada') return;
        emJornada = false; layout.setJourney(false); cards.setActive(false); document.body.classList.remove('is-journey');
        modo = { m: 'app', k: FOCO[v] || 'parietal' };
        if (ativo()) { scene.setMode('app', modo.k); sincLayout(); }
      },
      warp() { if (!reduced && ativo()) scene.warp(); },
      home() { cards.pinned = -1; scene.releaseFly(); },
      setLook(l) { scene.setLook(l); },
      enterJourney(sp, list) {
        spacer = sp; listBox = list; emJornada = true; modo = { m: 'journey', k: undefined };
        if (ativo()) {
          mostraJornada();
          ['.jhero .jt', '.jhero .jp'].forEach(q => { const e = $(q); if (e) { delete e.dataset.rv; revealText(e); } });
        } else mostraLista();
      },
      leaveJourney() { emJornada = false; layout.setJourney(false); cards.setActive(false); document.body.classList.remove('is-journey'); },
      setData(res, con) { cards.setData(res, con); cards.refreshList(listBox, !ativo()); }
    });
    BrainState.subscribe(on => (on ? ligar() : desligar()));
    if (ativo()) { document.documentElement.classList.add('gl-on'); $('#fx').hidden = true; scene.setMode('login'); scene.start(); }
    else { document.documentElement.classList.add('cerebro-off'); }
    addEventListener('pointermove', e => scene.setMouse(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight * 2 - 1)), { passive: true });
    initCursor(); initMagnetic();
    progress(1, 'Pronto');
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  } catch (e) {
    console.warn('[Cérebro] 3D indisponível, usando o fundo 2D:', e && e.message);
    document.documentElement.classList.add('gl-off');
    // fallback: sem WebGL, a "jornada" é uma lista de cartões de texto
    const fb = new Cards({ onFrame: null, anchors: [], setHover() {}, setProgress() {} }, document.createElement('div'), { onOpen: tab => CB.open(tab), brl: CB.fmt });
    let box = null;
    api = Object.assign(base, {
      enterJourney(sp, list) { sp.style.display = 'none'; box = list; fb.renderList(list, true); },
      setData(res, con) { fb.setData(res, con); fb.refreshList(box, true); }
    });
    initCursor(); initMagnetic();
  }
  CB.api = api; CB.ready = true; document.documentElement.classList.toggle('cb-sem-3d', !api.supported); CB.q.splice(0).forEach(([n, a]) => { try { api[n](...a); } catch (e) { console.warn(e); } });
  hideLoader();
  const login = document.querySelector('.login h1'); if (login) { revealText(login); revealText(document.querySelector('.login p')); }
}
initControle();
boot();
