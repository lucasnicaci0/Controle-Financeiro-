// Fase 2 (interface, modo demo): agenda, limites com 3 níveis, exportação para Excel. Uso: node teste_fase2_ui.js (precisa de Playwright + google-chrome)
const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const mime = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
  const srv = http.createServer((q, r) => { let f = path.join(root, q.url.split('?')[0]); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[path.extname(f)] || 'text/html' }); r.end(d); } }); }).listen(8098);
  let falhas = 0; const ok = (n, c) => { console.log((c ? '  ok   ' : '  FALHA ') + n); if (!c) falhas++; };
  for (const [nome, vp] of [['desktop', { width: 1280, height: 800 }], ['celular', { width: 390, height: 780 }]]) {
    console.log(nome);
    const ctx = await b.newContext({ viewport: vp, acceptDownloads: true }); const pg = await ctx.newPage(); const erros = [];
    pg.on('pageerror', e => erros.push(e.message)); pg.on('dialog', d => d.accept());
    await pg.goto('http://localhost:8098/index.html?q=1&demo'); await pg.waitForTimeout(2500);
    const nav = v => pg.evaluate(v => document.querySelector('#nav button[data-v=' + v + ']').click(), v).then(() => pg.waitForTimeout(800));
    // ---- agenda
    await nav('agenda');
    await pg.fill('form.f input[maxlength="80"]', 'Conta de luz'); await pg.fill('form.f input[inputmode=decimal]', '150');
    await pg.locator('form.f select').nth(3).selectOption('mensal');
    await pg.locator('form.f button[type=submit]').click(); await pg.waitForTimeout(800);
    ok('item aparece no calendário (ponto no dia)', (await pg.locator('.dia .pts i').count()) >= 1);
    await pg.locator('button.dia:not(.vazio)').nth(Number((await pg.evaluate(() => hojeISO())).slice(8)) - 1).click().catch(() => {});
    await pg.waitForTimeout(300);
    await pg.locator('.seg button:has-text("Lista")').click(); await pg.waitForTimeout(300);
    ok('modo lista mostra o item recorrente', (await pg.locator('.item.ag:has-text("Conta de luz")').count()) >= 1);
    const antes = await pg.evaluate(() => demoDB.lanc.length);
    await pg.locator('.item.ag:has-text("Conta de luz") .ck').first().click(); await pg.waitForTimeout(900);
    ok('pagar cria lançamento', (await pg.evaluate(() => demoDB.lanc.length)) === antes + 1);
    ok('item fica riscado/concluído', (await pg.locator('.item.ag.feito').count()) >= 1);
    await pg.locator('.item.ag.feito .ck').first().click(); await pg.waitForTimeout(900);
    ok('desmarcar remove o lançamento', (await pg.evaluate(() => demoDB.lanc.length)) === antes);
    await pg.locator('button:has-text("Gerar link")').click(); await pg.waitForTimeout(500);
    ok('link do calendário aparece', /feed=demo-/.test(await pg.locator('#view').innerText()));
    // ---- limites: 3 níveis
    await nav('limites');
    const alim = await pg.evaluate(() => S.cats.find(c => c.nome === 'Alimentação').id);
    const gasto = await pg.evaluate(() => { const m = mesAtual(); return demoDB.lanc.filter(l => l.tipo === 'despesa' && l.data.slice(0, 7) === m && l.categoriaId === S.cats.find(c => c.nome === 'Alimentação').id).reduce((s, l) => s + l.valor, 0); });
    const nivel = async (lim) => { await pg.locator('form.f select').first().selectOption('categoria'); await pg.locator('form.f select').nth(1).selectOption(alim); await pg.fill('form.f input[inputmode=decimal]', String(lim).replace('.', ',')); await pg.locator('form.f button[type=submit]').click(); await pg.waitForTimeout(900); return pg.locator('.lim .chip').first().innerText(); };
    ok('limite folgado → dentro', /Dentro/.test(await nivel(gasto * 2)));
    ok('80% → atenção', /Atenção/.test(await nivel(Math.round(gasto / 0.85 * 100) / 100)));
    ok('100% → limite atingido', /atingido/.test(await nivel(gasto)));
    ok('acima → excedido', /excedido/.test(await nivel(Math.floor(gasto * 0.5))));
    ok('histórico guarda os 3 alertas', (await pg.locator('.card:has(h3:has-text("Histórico")) .item').count()) === 3);
    ok('barra de progresso presente', (await pg.locator('.lim-barra').count()) === 1);
    // ---- exportar
    await nav('painel');
    const [dl] = await Promise.all([pg.waitForEvent('download', { timeout: 15000 }), pg.locator('button:has-text("Exportar para Excel")').click()]);
    const arq = '/tmp/export_' + nome + '.xlsx'; await dl.saveAs(arq);
    ok('baixou .xlsx', /\.xlsx$/.test(dl.suggestedFilename()) && fs.statSync(arq).size > 1500);
    ok('sem scroll horizontal', await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    ok('sem erros de JS', erros.length === 0); if (erros.length) console.log(erros);
    await ctx.close();
  }
  await b.close(); srv.close(); console.log(falhas ? falhas + ' FALHA(S)' : 'tudo ok'); process.exit(falhas ? 1 : 0);
})();
