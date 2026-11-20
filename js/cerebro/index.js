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
    cards = new Cards(scene, $('#cerebro-ui'), { onOpen: tab => CB.open(tab), brl: CB.fmt, tabName: t => ((document.querySelector('#nav button[data-v="' + t + '"]') || {}).textContent || t) });
    scene.onPalette = () => cards.recolor();
    scene.onLost = () => { document.documentElement.classList.remove('gl-on'); $('#fx').hidden = false; };
    let spacer = null, listBox = null;
    api = Object.assign(base, {
      supported: true, scene, cards,
      setMode(m, k) { scene.setMode(m, k); },
      onView(v) {
        if (v === 'jornada') return;
        cards.setActive(false); document.body.classList.remove('is-journey');
        scene.setMode('app', FOCO[v] || 'parietal');
      },
      warp() { if (!reduced) scene.warp(); },
      home() { cards.pinned = -1; scene.releaseFly(); },
      setLook(l) { scene.setLook(l); },
      enterJourney(sp, list) {
        spacer = sp; listBox = list; cards.attach(sp); document.body.classList.add('is-journey');
        scene.setMode('journey'); cards.setActive(true); scene.setProgress(0); cards.renderList(list, false);
        ['.jhero .jt', '.jhero .jp'].forEach(q => { const e = $(q); if (e) { delete e.dataset.rv; revealText(e); } });
      },
      leaveJourney() { cards.setActive(false); document.body.classList.remove('is-journey'); },
      setData(res, con) { cards.setData(res, con); cards.refreshList(listBox, false); }
    });
    document.documentElement.classList.add('gl-on'); $('#fx').hidden = true;
    scene.setMode('login');
    scene.start();
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
  CB.api = api; CB.ready = true; CB.q.splice(0).forEach(([n, a]) => { try { api[n](...a); } catch (e) { console.warn(e); } });
  hideLoader();
  const login = document.querySelector('.login h1'); if (login) { revealText(login); revealText(document.querySelector('.login p')); }
}
boot();
