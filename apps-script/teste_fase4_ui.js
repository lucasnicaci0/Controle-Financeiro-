// Fase 4 (interface, modo demo): tema/layout, restaurar padrão, perfil com recorte de foto, ajuda. Uso: node teste_fase4_ui.js
const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
// PNG 64x48 gerado na hora (sem dependências)
function png() { const zlib = require('zlib'), w = 64, h = 48, raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = x * 4; raw[o + 1] = y * 5; raw[o + 2] = 160; } }
  const crc = b => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } c = 0xFFFFFFFF; for (const x of b) c = t[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const ch = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ch('IHDR', ihdr), ch('IDAT', zlib.deflateSync(raw)), ch('IEND', Buffer.alloc(0))]); }
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const mime = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
  const srv = http.createServer((q, r) => { let f = path.join(root, q.url.split('?')[0]); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[path.extname(f)] || 'text/html' }); r.end(d); } }); }).listen(8095);
  let falhas = 0; const ok = (n, c, x) => { console.log((c ? '  ok   ' : '  FALHA ') + n + (!c && x ? ' -> ' + JSON.stringify(x) : '')); if (!c) falhas++; };
  for (const [nome, vp] of [['desktop', { width: 1280, height: 800 }], ['celular', { width: 390, height: 780 }]]) {
    console.log(nome);
    const ctx = await b.newContext({ viewport: vp }); const pg = await ctx.newPage(); const erros = [];
    pg.on('pageerror', e => erros.push(e.message)); pg.on('dialog', d => d.accept());
    await pg.goto('http://localhost:8095/index.html?q=1&demo&semintro'); await pg.waitForTimeout(2500);
    const nav = v => pg.evaluate(v => document.querySelector('#nav button[data-v=' + v + ']').click(), v).then(() => pg.waitForTimeout(700));
    const css = (v) => pg.evaluate(v => getComputedStyle(document.documentElement).getPropertyValue(v).trim(), v);
    await nav('opcoes');
    const rotulo = t => pg.locator('.opts .seg button:has-text("' + t + '")');
    await rotulo('Claro').click(); await pg.waitForTimeout(300);
    ok('tema claro aplicado', (await pg.evaluate(() => document.documentElement.dataset.tema)) === 'claro' && (await pg.evaluate(() => getComputedStyle(document.body).backgroundColor)) === 'rgb(244, 241, 255)');
    // contraste do texto principal no tema claro
    const ruim = await pg.evaluate(() => {
      const lum = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
      const parse = s => { const m = s.match(/[\d.]+/g).map(Number); return { c: m.slice(0, 3), a: m.length > 3 ? m[3] : 1 }; };
      const fundo = e => { let acc = [255, 255, 255], pilha = []; for (let n = e; n; n = n.parentElement) { const p = parse(getComputedStyle(n).backgroundColor); if (p.a > 0) pilha.push(p); if (p.a >= 1) break; } pilha.reverse().forEach(p => { acc = acc.map((v, i) => v * (1 - p.a) + p.c[i] * p.a); }); return acc; };
      const out = []; document.querySelectorAll('#view *').forEach(e => { if (![...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) return; const r = e.getBoundingClientRect(); if (!r.width || !r.height) return;
        const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || +cs.opacity === 0) return; const f = parse(cs.color), bg = fundo(e), fg = f.c.map((v, i) => v * f.a + bg[i] * (1 - f.a));
        const L1 = lum(fg), L2 = lum(bg), cr = (Math.max(L1, L2) + .05) / (Math.min(L1, L2) + .05); if (cr < 4.5) out.push((e.className || e.tagName) + ' ' + cr.toFixed(2) + ' "' + e.textContent.trim().slice(0, 24) + '"'); });
      return out.slice(0, 8); });
    ok('texto legível no tema claro (contraste ≥ 4,5:1)', ruim.length === 0, ruim);
    await rotulo('Compacta').click(); await pg.waitForTimeout(200);
    ok('densidade compacta reduz o espaçamento', (await css('--dens')) === '0.8');
    await rotulo('Reto').click(); await pg.waitForTimeout(200);
    ok('cantos retos', (await css('--r')) === '6px' && (await css('--rb')) === '4px');
    // persistência após recarregar
    await pg.reload(); await pg.waitForTimeout(2500);
    ok('opções persistem depois de recarregar', (await pg.evaluate(() => JSON.parse(localStorage.rumo_opts))).tema === 'claro' && (await pg.evaluate(() => document.documentElement.dataset.tema)) === 'claro');
    await nav('opcoes');
    await pg.locator('.opts > section.card:has(h3:text-is("Layout")) button:has-text("Restaurar esta seção")').click(); await pg.waitForTimeout(800);
    const o = await pg.evaluate(() => JSON.parse(localStorage.rumo_opts));
    ok('restaurar seção Layout não mexe no tema', o.dens === 'n' && o.raio === 'p' && o.tema === 'claro');
    await pg.locator('button:has-text("Restaurar tudo ao padrão")').click(); await pg.waitForTimeout(800);
    ok('restaurar tudo volta ao escuro', (await pg.evaluate(() => JSON.parse(localStorage.rumo_opts))).tema === 'escuro' && (await pg.evaluate(() => document.documentElement.dataset.tema)) === 'escuro');
    // perfil
    await pg.evaluate(() => { document.querySelector('#avatar').click(); }); await pg.locator('#perfilBtn').click(); await pg.waitForTimeout(800);
    await pg.locator('form.f input[maxlength="80"]').fill('Maria Teste'); await pg.locator('form.f input[maxlength="30"]').fill('Mari'); await pg.locator('form.f input[type=date]').fill('1990-05-10');
    ok('idade aparece ao digitar nascimento', /\d+ anos/.test(await pg.locator('#view').innerText()));
    await pg.locator('form.f button[type=submit]').click(); await pg.waitForTimeout(600);
    ok('apelido vira o nome no menu e a inicial no avatar', (await pg.locator('#mnome').innerText()) === 'Mari' && (await pg.locator('#avatar').innerText()) === 'M');
    await pg.locator('input[type=file]').setInputFiles({ name: 'f.png', mimeType: 'image/png', buffer: png() }); await pg.waitForTimeout(700);
    ok('janela de recorte abre', await pg.locator('dialog.crop[open]').count() === 1);
    await pg.locator('dialog.crop input[type=range]').fill('2'); const cv = pg.locator('dialog.crop canvas'); const bb = await cv.boundingBox();
    await pg.mouse.move(bb.x + 100, bb.y + 100); await pg.mouse.down(); await pg.mouse.move(bb.x + 140, bb.y + 120, { steps: 4 }); await pg.mouse.up();
    await pg.locator('dialog.crop button:has-text("Usar foto")').click(); await pg.waitForTimeout(700);
    const foto = await pg.evaluate(() => demoDB.perfil.foto);
    ok('foto salva como JPEG leve (<40 mil caracteres)', /^data:image\/jpeg;base64,/.test(foto) && foto.length < 40000, foto.slice(0, 30) + ' len=' + foto.length);
    ok('avatar mostra a foto', /url\(/.test(await pg.evaluate(() => document.querySelector('#avatar').style.backgroundImage)));
    ok('troca de senha leva ao Google (sem pedir senha aqui)', (await pg.locator('a[href*="myaccount.google.com"]').count()) === 1 && (await pg.locator('input[type=password]').count()) === 0);
    // ajuda
    await pg.evaluate(() => { document.querySelector('#avatar').click(); }); await pg.locator('#ajudaBtn').click(); await pg.waitForTimeout(700);
    const total = await pg.locator('.faq details').count();
    await pg.fill('input[type=search]', 'cartao'); await pg.waitForTimeout(200);
    ok('busca da FAQ ignora acento e filtra', total >= 8 && (await pg.locator('.faq details').count()) >= 1 && (await pg.locator('.faq details').count()) < total);
    await pg.fill('input[type=search]', 'zzzz'); await pg.waitForTimeout(200);
    ok('busca sem resultado orienta a falar com a gente', /Nada encontrado/.test(await pg.locator('.faq').innerText()));
    const wa = await pg.locator('a:has-text("WhatsApp")').getAttribute('href');
    ok('WhatsApp abre wa.me com mensagem pronta', /^https:\/\/wa\.me\/\d+\?text=Ol%C3%A1/.test(wa), wa);
    ok('e-mail abre mailto', /^mailto:.+\?subject=/.test(await pg.locator('a:has-text("E-mail")').getAttribute('href')));
    await pg.fill('form.f input[maxlength="80"]', 'Dúvida'); await pg.fill('textarea', 'Como exporto para o Excel?'); await pg.locator('form.f button[type=submit]').click(); await pg.waitForTimeout(700);
    ok('mensagem enviada aparece na lista', /Dúvida/.test(await pg.locator('#view').innerText()));
    ok('sem scroll horizontal', await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    ok('sem erros de JS', erros.length === 0, erros);
    await ctx.close();
  }
  await b.close(); srv.close(); console.log(falhas ? falhas + ' FALHA(S)' : 'tudo ok'); process.exit(falhas ? 1 : 0);
})();
