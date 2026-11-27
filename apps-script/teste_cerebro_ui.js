// Cérebro 3D (camadas, liga/desliga, layout): os 7 cenários pedidos. Uso: node teste_cerebro_ui.js
const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const mime = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
  const srv = http.createServer((q, r) => { let f = path.join(root, q.url.split('?')[0]); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[path.extname(f)] || 'text/html' }); r.end(d); } }); }).listen(8096);
  let falhas = 0; const ok = (n, c, x) => { console.log((c ? '  ok   ' : '  FALHA ') + n + (!c && x !== undefined ? ' -> ' + JSON.stringify(x) : '')); if (!c) falhas++; };
  const abre = async (vp, reduz) => {
    const ctx = await b.newContext({ viewport: vp, reducedMotion: reduz ? 'reduce' : 'no-preference' }); const pg = await ctx.newPage(); pg.erros = [];
    pg.on('pageerror', e => pg.erros.push(e.message)); pg.on('dialog', d => d.accept());
    await pg.goto('http://localhost:8096/index.html?q=1&demo&semintro'); await pg.waitForTimeout(4500); return { ctx, pg };
  };
  const spacer = pg => pg.evaluate(() => { const s = document.querySelector('.jspacer'); const r = s.getBoundingClientRect(); return { top: r.top + scrollY, h: s.offsetHeight, vh: innerHeight }; });
  const irPara = async (pg, f) => { const s = await spacer(pg); await pg.evaluate(y => scrollTo(0, y), s.top + (f <= 1 ? (s.h - s.vh) * f : s.h - s.vh + s.vh * (f - 1))); await pg.waitForTimeout(1800); };
  const estado = pg => pg.evaluate(() => { const a = CB.api, q = s => document.querySelectorAll(s).length; return { on: window.CerebroEstado.ativo, running: a.scene.running, off: document.documentElement.classList.contains('cerebro-off'), glOn: document.documentElement.classList.contains('gl-on'),
    cards: q('.rc'), dots: q('.hs'), heros: q('.jhero'), canvases: q('#gl'), spacerShown: !!document.querySelector('.jspacer') && getComputedStyle(document.querySelector('.jspacer')).display !== 'none', listaVisivel: !!document.querySelector('.jlista .rlist'), journey: document.body.classList.contains('is-journey'), ls: localStorage.getItem('rumo_cerebro3d') }; });
  const esperaOver = pg => pg.waitForFunction(() => CB.api.cards.root.classList.contains('over') && CB.api.scene.stopIndex > 7.5, null, { timeout: 40000 }).catch(() => {}).then(() => pg.waitForTimeout(2500));
  const semScrollH = pg => pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

  for (const [nome, vp] of [['desktop', { width: 1280, height: 800 }], ['celular', { width: 390, height: 780 }]]) {
    console.log('=== ' + nome);
    // ---------- 1. ativado com rotação contínua + elementos estáticos
    console.log('1. Cérebro ativado com rotação contínua');
    let { ctx, pg } = await abre(vp, false);
    let e = await estado(pg);
    ok('começa ativado, rodando, com 1 canvas, 9 cartões e 9 pontos', e.on && e.running && e.glOn && e.canvases === 1 && e.cards === 9 && e.dots === 9, e);
    await irPara(pg, 1); await esperaOver(pg);
    const amostra = () => pg.evaluate(() => { const a = CB.api; return { eye: a.scene.cam.eye.slice(), cards: [...document.querySelectorAll('.rc')].filter(c => parseFloat(c.style.opacity) > 0.95).map(c => { const r = c.getBoundingClientRect(); return [c.dataset.i, Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; }), hero: (() => { const r = document.querySelector('.jhero').getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y)]; })(), ax: a.scene.anchors.map(p => Math.round(p.x)) }; });
    const s1 = await amostra(); await pg.waitForTimeout(2500); const s2 = await amostra();
    const girou = s1.eye.some((v, i) => Math.abs(v - s2.eye[i]) > 1e-4);
    ok('o modelo gira sozinho (a câmera orbita)', girou, [s1.eye, s2.eye]);
    ok('os cartões visíveis (' + s1.cards.length + ') ficam parados (posição, tamanho e visibilidade idênticos) enquanto ele gira', JSON.stringify(s1.cards) === JSON.stringify(s2.cards) && JSON.stringify(s1.hero) === JSON.stringify(s2.hero) && (vp.width < 720 || s1.cards.length === 9), [s1.cards, s2.cards, s1.hero, s2.hero]);
    ok('(e os pontos de navegação, que fazem parte do modelo, acompanham a rotação)', JSON.stringify(s1.ax) !== JSON.stringify(s2.ax));
    ok('sem erros de JS', pg.erros.length === 0, pg.erros);

    // ---------- 7. nunca se sobrepõem ao modelo
    console.log('7. Planos e observações nunca se sobrepõem ao modelo');
    const geo = () => pg.evaluate(() => {
      const H = innerHeight, W = innerWidth, pl = document.querySelector('.planos').getBoundingClientRect(), ui = document.getElementById('cerebro-ui');
      const inter = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
      const clipB = parseFloat((ui.style.clipPath.match(/inset\(\S+ \S+ (\d+(?:\.\d+)?)px/) || [0, 0])[1]) || 0;
      const vis = [...document.querySelectorAll('.rc')].filter(c => getComputedStyle(c).visibility === 'visible' && parseFloat(c.style.opacity) > 0.03).map(c => { const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: Math.max(0, Math.min(r.bottom, H - clipB) - r.y) }; });
      const sheet = { x: pl.x, y: pl.y, w: pl.width, h: pl.height };
      const A = CB.api.scene.anchors.filter(a => a.ok), cx0 = Math.min(...A.map(a => a.x)), cx1 = Math.max(...A.map(a => a.x));
      const brainBox = { x: cx0 - 20, y: 0, w: cx1 - cx0 + 40, h: H };
      return { sheetTop: pl.top, cardsSobFolha: vis.filter(c => c.h > 0 && inter(c, sheet)).length, cardsSobreCerebro: vis.filter(c => inter(c, brainBox)).length, n: vis.length, clipB, stageTop: CB.api.layout.stage.top };
    });
    for (const f of [0.5, 1, 1.15, 1.3, 1.5, 2.5]) {
      await irPara(pg, f); const g = await geo();
      ok('rolagem ' + f + ': nenhum cartão sobre a folha de Planos (borda em ' + Math.round(g.sheetTop) + 'px)', g.cardsSobFolha === 0, g);
    }
    await irPara(pg, 1); await esperaOver(pg); const g1 = await geo();
    if (vp.width > 720) ok('visão geral: nenhum cartão sobre o cérebro (colunas laterais, ' + g1.n + ' visíveis)', g1.cardsSobreCerebro === 0 && g1.n === 9, g1);
    await irPara(pg, 3);
    const fim = await pg.evaluate(() => { const p = document.querySelector('.planos'), st = CB.api.layout.stage; scrollTo(0, scrollY + p.getBoundingClientRect().top - st.top); const hb = st.top, t = document.querySelector('.planos h2').getBoundingClientRect().top; return { planosTop: p.getBoundingClientRect().top, estagioTop: st.top, titulo: t, paused: !CB.api.scene.running, uiOp: document.getElementById('cerebro-ui').style.opacity }; });
    ok('alinhada ao palco, a folha de Planos começa logo abaixo do cabeçalho e o título fica visível', fim.titulo >= fim.estagioTop && fim.titulo < fim.estagioTop + 80, fim);
    await pg.waitForTimeout(1200); const fim2 = await pg.evaluate(() => ({ paused: !CB.api.scene.running, uiOp: document.getElementById('cerebro-ui').style.opacity })); Object.assign(fim, fim2);
    ok('com os Planos cobrindo o palco, o 3D pausa e os cartões somem', fim.paused && parseFloat(fim.uiOp) === 0, fim);
    ok('Mensal/Anual dos Planos clicável', await pg.locator('.planos .seg button:has-text("Anual")').click().then(() => true).catch(() => false));
    await irPara(pg, 0.5); const volta = await estado(pg);
    ok('voltando para cima o 3D retoma sozinho', volta.running, volta);
    await ctx.close();

    // ---------- 2. navegando entre seções
    console.log('2. Cérebro ativado enquanto navega pelas seções');
    ({ ctx, pg } = await abre(vp, false));
    for (const v of ['painel', 'lanc', 'orc', 'contas', 'cambio', 'opcoes', 'jornada']) {
      await pg.evaluate(v => document.querySelector('#nav button[data-v=' + v + ']').click(), v); await pg.waitForTimeout(1100);
      const st = await estado(pg), modo = await pg.evaluate(() => CB.api.scene.mode);
      ok(v + ': 3D segue ativo (modo ' + modo + '), sem duplicar elementos', st.running && st.cards === 9 && st.dots === 9 && st.canvases === 1 && st.heros === 1 && modo === (v === 'jornada' ? 'journey' : 'app'), [st, modo]);
    }
    const tg = await pg.evaluate(() => ({ visJornada: getComputedStyle(document.getElementById('cb-toggle')).display !== 'none' }));
    ok('o botão aparece na Jornada', tg.visJornada);
    await pg.evaluate(() => document.querySelector('#nav button[data-v=painel]').click()); await pg.waitForTimeout(800);
    ok('e some nas outras telas (onde o fundo é só ambiente)', await pg.evaluate(() => getComputedStyle(document.getElementById('cb-toggle')).display === 'none'));
    ok('sem erros de JS', pg.erros.length === 0, pg.erros);

    // ---------- 3. desativado, tudo funcionando
    console.log('3. Cérebro desativado, demais recursos funcionando');
    await pg.evaluate(() => document.querySelector('#nav button[data-v=jornada]').click()); await pg.waitForTimeout(1200);
    await pg.click('#cb-toggle'); await pg.waitForTimeout(1200);
    e = await estado(pg);
    ok('desativado: 3D parado, canvas oculto, estado salvo', !e.on && !e.running && e.off && !e.glOn && e.ls === 'off', e);
    ok('o canvas 3D não é exibido e o fundo 2D assume', await pg.evaluate(() => getComputedStyle(document.getElementById('gl')).display === 'none' && !document.getElementById('fx').hidden));
    ok('as informações continuam: 9 cartões de região em grade e Planos', await pg.locator('.jlista .rl').count() === 9 && await pg.locator('.planos').isVisible());
    ok('sem espaço vazio: nada de palco de rolagem; Planos logo após a grade', await pg.evaluate(() => { const l = document.querySelector('.jlista').getBoundingClientRect(), p = document.querySelector('.planos').getBoundingClientRect(); return !e0(document.querySelector('.jspacer')) && p.top - l.bottom < 90 && p.top >= l.bottom - 1; function e0(x) { return getComputedStyle(x).display !== 'none'; } }));
    ok('cartões em grade não ficam sobrepostos entre si', await pg.evaluate(() => { const r = [...document.querySelectorAll('.jlista .rl')].map(c => c.getBoundingClientRect()); for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) if (r[i].left < r[j].right - 1 && r[i].right > r[j].left + 1 && r[i].top < r[j].bottom - 1 && r[i].bottom > r[j].top + 1) return false; return true; }));
    await pg.locator('.jlista .rl button').first().click(); await pg.waitForTimeout(1200);
    ok('botão "Abrir…" de um cartão leva ao módulo (' + (await pg.evaluate(() => S.view)) + ')', (await pg.evaluate(() => S.view)) !== 'jornada');
    for (const v of ['lanc', 'orc', 'metas', 'cambio']) { await pg.evaluate(v => document.querySelector('#nav button[data-v=' + v + ']').click(), v); await pg.waitForTimeout(800); ok(v + ' funciona com o cérebro desligado', (await pg.evaluate(() => S.view)) === v && (await pg.locator('#view .card').count()) > 0); }
    await pg.evaluate(() => document.querySelector('#nav button[data-v=jornada]').click()); await pg.waitForTimeout(1000);
    ok('voltar à Jornada com o cérebro desligado mostra a grade', (await estado(pg)).listaVisivel && (await pg.locator('.jlista .rl').count()) === 9);
    ok('ainda sem 3D rodando e sem erros', !(await estado(pg)).running && pg.erros.length === 0, pg.erros);
    ok('a opção também aparece em Opções › Efeitos, sincronizada', await (async () => { await pg.evaluate(() => document.querySelector('#nav button[data-v=opcoes]').click()); await pg.waitForTimeout(900); return pg.evaluate(() => { const i = document.getElementById('s-cb3d'); return !!i && i.checked === false; }); })());

    // ---------- 4. reativado
    console.log('4. Cérebro reativado');
    await pg.evaluate(() => document.getElementById('s-cb3d').click()); await pg.waitForTimeout(900);
    await pg.evaluate(() => document.querySelector('#nav button[data-v=jornada]').click()); await pg.waitForTimeout(3000);
    e = await estado(pg);
    ok('reativado: 3D rodando, canvas visível, palco de rolagem de volta', e.on && e.running && e.glOn && !e.off && e.spacerShown && e.journey && e.ls === 'on', e);
    ok('sem duplicar nada (1 canvas, 9 cartões, 9 pontos, 1 hero)', e.canvases === 1 && e.cards === 9 && e.dots === 9 && e.heros === 1, e);
    ok('a lista voltou a ser só para leitores de tela', await pg.evaluate(() => !document.querySelector('.jlista .rl') || getComputedStyle(document.querySelector('.jlista .rl')).display === 'none' || !!document.querySelector('.jlista ul.sr')));
    const antes = await pg.evaluate(() => CB.api.scene.cam.eye.slice()); await pg.waitForTimeout(2000);
    ok('a rotação retomou', await pg.evaluate(a => CB.api.scene.cam.eye.some((v, i) => Math.abs(v - a[i]) > 1e-4), antes));
    await irPara(pg, 1); await esperaOver(pg); const g2 = await geo();
    ok('posicionamento correto após reativar (sem sobreposição)', g2.cardsSobFolha === 0 && (vp.width <= 720 || g2.cardsSobreCerebro === 0), g2);
    ok('dados preservados: valores nos cartões', await pg.evaluate(() => [...document.querySelectorAll('.rc .rv')].every(v => v.textContent.trim() && v.textContent.trim() !== '…')));
    ok('sem erros de JS', pg.erros.length === 0, pg.erros);

    // ---------- 5. alternância consecutiva
    console.log('5. Alternância várias vezes seguidas');
    await pg.evaluate(() => scrollTo(0, 0)); await pg.waitForTimeout(500);
    for (let i = 0; i < 6; i++) { await pg.evaluate(() => document.getElementById('cb-toggle').click()); await pg.waitForTimeout(i < 3 ? 120 : 600); }
    await pg.waitForTimeout(1500); e = await estado(pg);
    ok('após 6 cliques (rápidos e lentos) o estado é o esperado (ativado)', e.on && e.running && e.glOn && e.spacerShown, e);
    ok('nenhum elemento duplicado', e.canvases === 1 && e.cards === 9 && e.dots === 9 && e.heros === 1, e);
    for (let i = 0; i < 5; i++) { await pg.evaluate(() => document.getElementById('cb-toggle').click()); await pg.waitForTimeout(250); }
    await pg.waitForTimeout(1200); e = await estado(pg);
    ok('após 5 cliques extras (ímpar) fica desativado e consistente', !e.on && !e.running && e.off && !e.spacerShown && e.listaVisivel && e.cards === 9, e);
    ok('aria-checked do botão acompanha o estado', (await pg.getAttribute('#cb-toggle', 'aria-checked')) === 'false');
    await pg.reload(); await pg.waitForTimeout(4500); e = await estado(pg);
    ok('o estado desligado persiste ao recarregar (e não afeta os dados)', !e.on && e.off && !e.running && (await pg.locator('.jlista .rl').count()) === 9, e);
    ok('sem erros de JS', pg.erros.length === 0, pg.erros);
    await pg.evaluate(() => window.CerebroEstado.set(true)); await pg.waitForTimeout(2500);
    ok('religar por API também funciona', (await estado(pg)).running);
    await ctx.close();

    // ---------- 6. redimensionamento
    console.log('6. Redimensionamento ativado e desativado');
    ({ ctx, pg } = await abre(vp, true));
    const tams = [[1280, 800], [900, 700], [390, 780], [1600, 900], [vp.width, vp.height]];
    for (const ligado of [true, false]) {
      if (!ligado) { await pg.evaluate(() => window.CerebroEstado.set(false)); await pg.waitForTimeout(1200); }
      for (const [w, h] of tams) {
        await pg.setViewportSize({ width: w, height: h }); await pg.waitForTimeout(1300);
        const r = await pg.evaluate(() => { const a = CB.api, c = document.getElementById('gl'); return { cw: c.clientWidth, w: innerWidth, top: CB.api.layout.stage.top, bottom: CB.api.layout.stage.bottom, h: innerHeight, sh: document.documentElement.scrollWidth, ti: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--palco-top')) }; });
        ok((ligado ? 'ativado' : 'desativado') + ' ' + w + 'x' + h + ': sem scroll horizontal' + (ligado ? ', canvas acompanha a tela e palco válido' : ''), r.sh <= r.w + 1 && (!ligado || (Math.abs(r.cw - r.w) <= 1 && r.top >= 0 && r.bottom > r.top + 100 && r.bottom <= r.h)), r);
        if (ligado) { await irPara(pg, 1); await esperaOver(pg); const g = await geo(); ok('   sem cartões sobre a folha de Planos nesse tamanho', g.cardsSobFolha === 0, g); if (w > 720) ok('   sem cartões sobre o cérebro nesse tamanho', g.cardsSobreCerebro === 0, g); await pg.evaluate(() => scrollTo(0, 0)); }
      }
    }
    ok('sem erros de JS', pg.erros.length === 0, pg.erros);
    await ctx.close();
  }
  await b.close(); srv.close(); console.log(falhas ? falhas + ' FALHA(S)' : 'tudo ok'); process.exit(falhas ? 1 : 0);
})();
