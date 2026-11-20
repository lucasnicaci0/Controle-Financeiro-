// Fase 3 (interface, modo demo): cartões, investimentos, meta de investimento. Uso: node teste_fase3_ui.js
const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const mime = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
  const srv = http.createServer((q, r) => { let f = path.join(root, q.url.split('?')[0]); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[path.extname(f)] || 'text/html' }); r.end(d); } }); }).listen(8097);
  let falhas = 0; const ok = (n, c) => { console.log((c ? '  ok   ' : '  FALHA ') + n); if (!c) falhas++; };
  for (const [nome, vp] of [['desktop', { width: 1280, height: 800 }], ['celular', { width: 390, height: 780 }]]) {
    console.log(nome);
    const pg = await (await b.newContext({ viewport: vp })).newPage(); const erros = [];
    pg.on('pageerror', e => erros.push(e.message)); pg.on('dialog', d => d.accept());
    await pg.goto('http://localhost:8097/index.html?q=1&demo'); await pg.waitForTimeout(2500);
    const nav = v => pg.evaluate(v => document.querySelector('#nav button[data-v=' + v + ']').click(), v).then(() => pg.waitForTimeout(800));
    await nav('cartoes');
    ok('sem cartão: mensagem vazia', /Nenhum cartão/.test(await pg.locator('#view').innerText()));
    await pg.fill('form.f input[maxlength="60"]', 'Cartão Roxo'); await pg.locator('form.f button[type=submit]').click(); await pg.waitForTimeout(800);
    ok('cartão sem dados avisa o que falta', /Falta informar: limite, dia de fechamento, dia de vencimento/.test(await pg.locator('#view').innerText()));
    await pg.locator('button:has-text("Editar")').first().click(); await pg.waitForTimeout(300);
    await pg.fill('form.f input[inputmode=decimal]', '5000'); await pg.locator('form.f input[type=number]').nth(0).fill('10'); await pg.locator('form.f input[type=number]').nth(1).fill('17');
    await pg.locator('form.f button[type=submit]').click(); await pg.waitForTimeout(800);
    const t = await pg.locator('#view').innerText();
    ok('limite, disponível e datas aparecem', /5\.000,00/.test(t) && /Disponível/.test(t) && /10\/12|10\/01|10\/\d\d/.test(t) && !/Falta informar/.test(t));
    await nav('invest');
    await pg.fill('form.f input[maxlength="60"]', 'Petrobras'); await pg.locator('form.f select').selectOption('acao');
    const ins = pg.locator('form.f input[inputmode=decimal]'); await ins.nth(0).fill('100'); await ins.nth(1).fill('30'); await ins.nth(2).fill('36');
    await pg.locator('form.f button[type=submit]').click(); await pg.waitForTimeout(800);
    const v = await pg.locator('#view').innerText();
    ok('retorno de 20% calculado', /\+20,00%/.test(v) && /3\.600,00/.test(v), v.slice(0, 200));
    ok('distribuição por classe aparece', /Ações/.test(v));
    ok('aviso de não recomendação', /não é recomendação de investimento/.test(v));
    await pg.locator('button:has-text("Atualizar cotações")').click(); await pg.waitForTimeout(500);
    ok('cotação automática avisa que não está ligada', /não está ligada/.test(await pg.locator('.toast').last().innerText()));
    await nav('metas');
    await pg.fill('form.f input[maxlength="60"]', 'Aposentadoria'); const mi = pg.locator('form.f input[inputmode=decimal]');
    await mi.nth(0).fill('12000'); await pg.locator('form.f select').selectOption('investimento'); await mi.nth(2).fill('1000');
    await pg.locator('form.f button[type=submit]').click(); await pg.waitForTimeout(800);
    ok('meta de investimento mostra previsão pelo aporte', /Aportando R\$\s?1\.000,00\/mês: 12 mese/.test(await pg.locator('#view').innerText()));
    ok('sem scroll horizontal', await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    ok('sem erros de JS', erros.length === 0); if (erros.length) console.log(erros);
  }
  await b.close(); srv.close(); console.log(falhas ? falhas + ' FALHA(S)' : 'tudo ok'); process.exit(falhas ? 1 : 0);
})();
