/* Rumi flutuante: personagem fixo na interface (arrastável) que abre o painel de conversa sem tirar o usuário da tela atual. */
(function (g) {
  const POS = 'rumo_rumi_pos';
  let ctxG = null, fab = null, wrap = null, painel = null, chat = null, aberto = false, masc = null, status = null, hintT = 0;
  const pequeno = () => g.matchMedia && g.matchMedia('(max-width:700px)').matches;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function posiciona(x, y) {
    const w = fab.offsetWidth || 56, h = fab.offsetHeight || 61;
    fab.style.left = clamp(x, 6, g.innerWidth - w - 6) + 'px'; fab.style.top = clamp(y, 6, g.innerHeight - h - 6) + 'px'; fab.style.right = 'auto'; fab.style.bottom = 'auto';
  }
  function posicaoPadrao() {
    const w = fab.offsetWidth || 56, h = fab.offsetHeight || 61;
    posiciona(g.innerWidth - w - 14, g.innerHeight - h - (pequeno() ? 92 : 24));   // no celular fica acima da barra de navegação
  }
  function restaura() {
    let p = null; try { p = JSON.parse(localStorage.getItem(POS) || 'null'); } catch (e) { /* sem armazenamento */ }
    if (p && isFinite(p.x) && isFinite(p.y)) posiciona(p.x * g.innerWidth, p.y * g.innerHeight); else posicaoPadrao();
  }
  function guardaPos() { try { const r = fab.getBoundingClientRect(); localStorage.setItem(POS, JSON.stringify({ x: r.left / g.innerWidth, y: r.top / g.innerHeight })); } catch (e) { /* ok */ } }

  function criarFab() {
    const { el } = ctxG;
    masc = g.RumiMascote.criar('espera', 52);
    fab = el('button', { type: 'button', class: 'rm-fab', id: 'rumi-fab', 'aria-label': 'Abrir conversa com o Rumi', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', title: 'Rumi, seu assistente (arraste para mudar de lugar)' }, masc, el('span', { class: 'rm-dica', role: 'status' }));
    let ini = null, moveu = false;
    fab.addEventListener('pointerdown', ev => { if (ev.button) return; const r = fab.getBoundingClientRect(); ini = { dx: ev.clientX - r.left, dy: ev.clientY - r.top, x: ev.clientX, y: ev.clientY }; moveu = false; fab.setPointerCapture(ev.pointerId); });
    fab.addEventListener('pointermove', ev => { if (!ini) return; if (!moveu && Math.hypot(ev.clientX - ini.x, ev.clientY - ini.y) > 7) { moveu = true; fab.classList.add('arrastando'); } if (moveu) posiciona(ev.clientX - ini.dx, ev.clientY - ini.dy); });
    fab.addEventListener('pointerup', ev => { if (!ini) return; const foi = moveu; ini = null; fab.classList.remove('arrastando'); try { fab.releasePointerCapture(ev.pointerId); } catch (e) { /* ok */ } if (foi) { guardaPos(); fab._acabou = true; setTimeout(() => { fab._acabou = false; }, 0); } });
    fab.addEventListener('click', () => { if (fab._acabou) return; abrir(); });
    fab.addEventListener('mouseenter', () => { if (!aberto) g.RumiMascote.definir(masc, 'analisando'); }); fab.addEventListener('mouseleave', () => { if (!aberto) g.RumiMascote.definir(masc, 'espera'); });
    document.body.append(fab); restaura();
    g.addEventListener('resize', () => { const r = fab.getBoundingClientRect(); posiciona(r.left, r.top); });
    // some enquanto o usuário rola ou digita, para nunca cobrir botões e o teclado
    let t = 0; g.addEventListener('scroll', () => { fab.classList.add('quieto'); clearTimeout(t); t = setTimeout(() => fab.classList.remove('quieto'), 700); }, { passive: true });
    document.addEventListener('focusin', e => { if (pequeno() && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && !(painel && painel.contains(e.target))) fab.classList.add('teclado'); });
    document.addEventListener('focusout', () => fab.classList.remove('teclado'));
    setInterval(() => { if (!aberto && fab && !fab.hidden && !g.matchMedia('(prefers-reduced-motion:reduce)').matches) { fab.classList.add('acena'); setTimeout(() => fab.classList.remove('acena'), 1600); } }, 30000);
  }
  function dica(txt, ms) { if (!fab) return; const d = fab.querySelector('.rm-dica'); d.textContent = txt; d.classList.add('on'); clearTimeout(hintT); hintT = setTimeout(() => d.classList.remove('on'), ms || 6000); }

  function criarPainel() {
    const { el } = ctxG;
    const m = g.RumiMascote.criar('espera', 40); status = el('span', { class: 'rm-status', role: 'status', 'aria-live': 'polite' }, g.RumiMascote.rotulo('espera'));
    const corpo = el('div', { class: 'rm-pnl-corpo' });
    wrap = el('div', { class: 'rm-pnl-wrap', hidden: true },
      el('div', { class: 'rm-pnl-fundo', onclick: () => fechar() }),
      painel = el('section', { class: 'rm-pnl glass', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Conversa com o Rumi' },
        el('header', { class: 'rm-pnl-head' }, m, el('div', { class: 'rm-pnl-tit' }, el('b', null, 'Rumi'), status),
          el('button', { type: 'button', class: 'rm-ic', 'data-rumi-ajustes': '1', 'aria-label': 'Ajustes e permissões do Rumi', title: 'Ajustes do Rumi', onclick: () => { fechar(); ctxG.ir('opcoes').then(() => setTimeout(() => { const e = document.getElementById('opt-rumi'); if (e) e.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 250)); } }, '⚙'),
          el('button', { type: 'button', class: 'rm-ic', 'data-rumi-fechar': '1', 'aria-label': 'Fechar conversa', title: 'Fechar (Esc)', onclick: () => fechar() }, '✕')),
        corpo));
    document.body.append(wrap);
    const c2 = Object.assign({}, ctxG, { fechar });
    chat = g.RumiTela.montarChat(corpo, c2, { masc: m, status });
  }
  function abrir() {
    if (!ctxG || aberto) return; if (g.RumiTutorial && g.RumiTutorial.ativo()) g.RumiTutorial.pausar();   // conversar pausa o tutorial (dá para retomar)
    if (!wrap) criarPainel();
    aberto = true; wrap.hidden = false; document.body.classList.add('rm-aberto'); fab.setAttribute('aria-expanded', 'true'); fab.hidden = true; clearTimeout(hintT);
    document.addEventListener('keydown', tecla, true);
    setTimeout(() => chat && chat.focar(), 60);
  }
  function fechar() {
    if (!aberto) return; aberto = false; wrap.hidden = true; document.body.classList.remove('rm-aberto'); fab.hidden = false; fab.setAttribute('aria-expanded', 'false');
    document.removeEventListener('keydown', tecla, true); if (chat) chat.parar(); try { fab.focus({ preventScroll: true }); } catch (e) { /* ok */ }
  }
  function tecla(ev) {
    if (ev.key === 'Escape' && !document.body.classList.contains('rm-modal-aberto')) { ev.stopPropagation(); fechar(); return; }
    if (ev.key === 'Tab' && painel) { const f = [...painel.querySelectorAll('button,input,select')].filter(x => !x.disabled && x.offsetParent !== null); if (!f.length) return; const i = f.indexOf(document.activeElement); if (ev.shiftKey && i <= 0) { ev.preventDefault(); f[f.length - 1].focus(); } else if (!ev.shiftKey && (i === f.length - 1 || i < 0)) { ev.preventDefault(); f[0].focus(); } }
  }
  function iniciar(ctx) { ctxG = ctx; if (!fab) criarFab(); fab.hidden = false; if (!ctx._dicaFeita) { ctx._dicaFeita = true; setTimeout(() => dica('Oi! Posso ajudar?', 5000), 1500); } }
  function ocultar() { if (aberto) fechar(); if (fab) fab.hidden = true; if (wrap) { wrap.remove(); wrap = null; painel = null; chat = null; } }
  g.RumiFlutuante = { iniciar, abrir, fechar, ocultar, estaAberto: () => aberto, dica };
})(window);
