// Câmbio (interface, modo demo): busca, cotação, conversor, histórico, favoritos, cache offline, lançamento em moeda, alerta. Uso: node teste_cambio_ui.js
const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const mime = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
  const srv = http.createServer((q, r) => { let f = path.join(root, q.url.split('?')[0]); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[path.extname(f)] || 'text/html' }); r.end(d); } }); }).listen(8093);
  let falhas = 0; const ok = (n, c, x) => { console.log((c ? '  ok   ' : '  FALHA ') + n + (!c && x !== undefined ? ' -> ' + JSON.stringify(x) : '')); if (!c) falhas++; };
  for (const [nome, vp] of [['desktop', { width: 1280, height: 800 }], ['celular', { width: 390, height: 780 }]]) {
    console.log(nome);
    const ctx = await b.newContext({ viewport: vp }); const pg = await ctx.newPage(); const erros = [];
    pg.on('pageerror', e => erros.push(e.message)); pg.on('dialog', d => d.accept());
    await pg.goto('http://localhost:8093/index.html?q=1&demo'); await pg.waitForTimeout(2500);
    const nav = v => pg.evaluate(v => document.querySelector('#nav button[data-v=' + v + ']').click(), v).then(() => pg.waitForTimeout(900));
    // Painel: cartão de câmbio
    await nav('painel'); await pg.waitForTimeout(600);
    ok('Painel tem o cartão com dólar e euro de hoje', /USD/.test(await pg.locator('[data-card=cambio]').innerText()) && /EUR/.test(await pg.locator('[data-card=cambio]').innerText()));
    await nav('cambio');
    ok('favoritos padrão no topo (USD, EUR, GBP, ARS, BTC)', (await pg.locator('.cb-fav b').allInnerTexts()).join() === 'USD,EUR,GBP,ARS,BTC');
    // busca < 2 s
    const t0 = Date.now(); await pg.fill('input[role=combobox]', 'dólar'); await pg.waitForSelector('.cb-sug li:has-text("USD")', { timeout: 2000 });
    ok('"dólar" lista USD em menos de 2 s (' + (Date.now() - t0) + ' ms)', Date.now() - t0 < 2000);
    ok('primeiro resultado é o dólar americano', /USD.*Dólar americano/.test(await pg.locator('.cb-sug li').first().innerText()));
    for (const [termo, cod] of [['euro', 'EUR'], ['libra', 'GBP'], ['iene', 'JPY'], ['peso argentino', 'ARS'], ['bitcoin', 'BTC'], ['usd', 'USD']]) {
      await pg.fill('input[role=combobox]', termo); await pg.waitForTimeout(80);
      ok('busca "' + termo + '" encontra ' + cod, (await pg.locator('.cb-sug li').first().innerText()).includes(cod));
    }
    await pg.fill('input[role=combobox]', 'iene'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(900);
    ok('Enter escolhe a moeda e mostra o detalhe', /Iene japonês \(JPY\)/i.test(await pg.locator('.cb-det').innerText()));
    // detalhe: campos
    await pg.locator('.cb-fav[data-c=USD]').click(); await pg.waitForTimeout(900);
    const dt = await pg.locator('.cb-det').innerText();
    ok('detalhe mostra compra, venda, variação, máxima, mínima, hora, fonte e aviso', /Compra/.test(dt) && /Venda/.test(dt) && /Variação no dia/.test(dt) && /Máxima/.test(dt) && /Mínima/.test(dt) && /Atualizado em/.test(dt) && /Fonte:/.test(dt) && /Valores de referência, podem diferir da cotação praticada por bancos e corretoras\./.test(dt), dt);
    // conversor confere com a cotação exibida
    const venda = await pg.locator('[data-venda=USD]').innerText(), compra = await pg.locator('[data-compra=USD]').innerText();
    const num = t => parseFloat(t.replace(/[^\d,]/g, '').replace(',', '.'));
    await pg.locator('select[aria-label=De]').selectOption('USD'); await pg.locator('select[aria-label=Para]').selectOption('BRL'); await pg.fill('input[aria-label="Valor a converter"]', '100'); await pg.waitForTimeout(500);
    const r1 = num(await pg.locator('.cb-res').innerText());
    ok('USD → BRL usa a compra exibida (100 × ' + compra + ')', Math.abs(r1 - 100 * num(compra)) < 0.02, [r1, compra]);
    await pg.locator('button[aria-label="Inverter moedas"]').click(); await pg.waitForTimeout(500);
    const r2 = num(await pg.locator('.cb-res').innerText());
    ok('inverter: BRL → USD usa a venda exibida', Math.abs(r2 - 100 / num(venda)) < 0.02 && (await pg.locator('select[aria-label=De]').inputValue()) === 'BRL', [r2, venda]);
    await pg.fill('input[aria-label="Valor a converter"]', '250'); await pg.waitForTimeout(400);
    ok('resultado muda enquanto digita', Math.abs(num(await pg.locator('.cb-res').innerText()) - 250 / num(venda)) < 0.02);
    ok('formato pt-BR com símbolo da moeda (US$)', /US\$/.test(await pg.locator('.cb-res').innerText()));
    // gráfico e filtros
    const pontos = async () => pg.evaluate(() => { const p = document.querySelector('.cb-graf svg path:nth-of-type(2)'); return p ? (p.getAttribute('d').match(/[ML]/g) || []).length : 0; });
    const res = {}; for (const [d, t] of [[7, '7 dias'], [30, '30 dias'], [180, '6 meses'], [365, '1 ano']]) { await pg.locator('.seg[aria-label="Período do gráfico"] button:has-text("' + t + '")').click(); await pg.waitForTimeout(500); res[d] = await pontos(); }
    ok('filtros 7d/30d/6m/1a mudam a série (7, 30, 180, 365 pontos)', res[7] === 7 && res[30] === 30 && res[180] === 180 && res[365] === 365, res);
    const svg = pg.locator('.cb-graf svg'); const bb = await svg.boundingBox(); await pg.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
    ok('passar o dedo/mouse no gráfico mostra data e valor', /\d{2}\/\d{2}\/\d{4} · R\$/.test(await pg.locator('.cb-tip').innerText()));
    // favoritos por usuário
    await pg.locator('.cb-det button:has-text("Favorita")').click(); await pg.waitForTimeout(400);
    ok('desfavoritar tira da lista e salva', !(await pg.locator('.cb-fav b').allInnerTexts()).includes('USD') && !(await pg.evaluate(() => demoDB.cambioFav)).includes('USD'));
    await pg.fill('input[role=combobox]', 'canadense'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(800);
    await pg.locator('.cb-det button:has-text("Favoritar")').click(); await pg.waitForTimeout(400);
    ok('favoritar adiciona CAD', (await pg.evaluate(() => demoDB.cambioFav)).includes('CAD'));
    // API fora do ar: usa a última cotação guardada
    await pg.evaluate(() => { window.__cambioFalha = true; }); await pg.locator('.cb-fav[data-c=EUR]').click(); await pg.waitForTimeout(900);
    const off = await pg.locator('.cb-det').innerText();
    ok('API fora: mostra a última cotação com aviso de desatualizada e a hora', /Desatualizado/.test(off) && /Compra/.test(off) && /\d{2}\/\d{2} \d{2}:\d{2}/.test(off), off.slice(0, 300));
    ok('API fora: conversor continua funcionando', /€/.test((await (async () => { await pg.locator('select[aria-label=Para]').selectOption('EUR'); await pg.waitForTimeout(500); return pg.locator('.cb-res').innerText(); })())));
    ok('API fora: tela não quebrou (sem erros de JS)', erros.length === 0, erros);
    await pg.evaluate(() => { window.__cambioFalha = false; });
    // alerta de cotação (dispara no app)
    await pg.fill('input[aria-label="Cotação alvo em reais"]', '5'); await pg.locator('.cb-det ~ * form button[type=submit], form:has(input[aria-label="Cotação alvo em reais"]) button[type=submit]').first().click(); await pg.waitForTimeout(600);
    ok('alerta criado e listado', /≥ R\$/.test(await pg.locator('#view').innerText()));
    await nav('painel'); await nav('cambio'); await pg.waitForTimeout(500);
    ok('ao abrir o Câmbio o alerta dispara (aviso no app)', (await pg.locator('.toast').allInnerTexts()).some(t => /Cotação: USD/.test(t)));
    // lançamento em moeda estrangeira
    await nav('lanc');
    await pg.fill('input[aria-label=Valor]', '10'); await pg.locator('form.f select:has(option[value=USD])').selectOption('USD'); await pg.waitForTimeout(700);
    ok('moeda estrangeira pede/mostra a cotação e a conversão', /= R\$\s?54,30/.test(await pg.locator('form.f').innerText()) || /54,3/.test(await pg.locator('form.f').innerText()), await pg.locator('form.f').innerText());
    await pg.locator('form.f button[type=submit]').click(); await pg.waitForTimeout(900);
    const l = await pg.evaluate(() => demoDB.lanc.slice(-1)[0]);
    ok('salvou em R$ com valor original e taxa', l.moeda === 'USD' && l.valorOrig === 10 && Math.abs(l.cotacao - 5.43) < 0.001 && Math.abs(l.valor - 54.3) < 0.011, l);
    ok('lista mostra o valor original e a taxa', /US\$\s?10,00 a R\$\s?5,4300/.test(await pg.locator('#view').innerText()), (await pg.locator('.item').first().innerText()));
    ok('sem scroll horizontal', await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    ok('sem erros de JS', erros.length === 0, erros);
    await ctx.close();
  }
  await b.close(); srv.close(); console.log(falhas ? falhas + ' FALHA(S)' : 'tudo ok'); process.exit(falhas ? 1 : 0);
})();
