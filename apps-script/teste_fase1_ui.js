const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  const http = require('http'), fs = require('fs'), path = require('path');
  const root = '/home/claude/controle-financeiro-';
  const srv = http.createServer((q, r) => { let f = path.join(root, q.url.split('?')[0]); if (f.endsWith('/')) f += 'index.html'; fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.json') ? 'application/json' : 'text/html' }); r.end(d); } }); }).listen(8099);
  let falhas = 0; const ok = (n, c) => { console.log((c ? '  ok   ' : '  FALHA ') + n); if (!c) falhas++; };
  for (const [nome, vp] of [['desktop', { width: 1280, height: 800 }], ['celular', { width: 390, height: 780 }]]) {
    console.log(nome);
    const pg = await (await b.newContext({ viewport: vp })).newPage(); const erros = [];
    pg.on('pageerror', e => erros.push(e.message));
    await pg.goto('http://localhost:8099/index.html?q=1&demo&semintro'); await pg.waitForTimeout(2500);
    
    // planos
    await pg.evaluate(() => scrollTo(0, document.body.scrollHeight)); await pg.waitForTimeout(500);
    ok('planos aparecem com 3 cartões', (await pg.locator('.plano').count()) === 3);
    ok('aviso de valor de exemplo (2)', (await pg.locator('.aviso-ex').count()) === 2);
    ok('mensal mostra R$ 14,90', /14,90/.test(await pg.locator('.planos-grade').innerText()));
    await pg.locator('.planos .seg button:has-text("Anual")').click();
    const t = await pg.locator('.planos-grade').innerText();
    ok('anual mostra R$ 149,00 e economia', /149,00/.test(t) && /economia/.test(t));
    // categorias
    await pg.locator('#nav button[data-v=cats]').click(); await pg.waitForTimeout(700);
    ok('lista categorias de despesa', (await pg.locator('.lista .item').count()) >= 8);
    await pg.fill('form.f input[maxlength="40"]', 'Academia'); await pg.locator('.ico-grade button').nth(29).click();
    await pg.locator('form.f button[type=submit]').click(); await pg.waitForTimeout(700);
    ok('criou Academia com ícone', /Academia/.test(await pg.locator('#view').innerText()) && /🏋️/.test(await pg.locator('#view').innerText()));
    await pg.locator('.item:has-text("Academia") button:has-text("Editar")').click(); await pg.waitForTimeout(300);
    await pg.fill('form.f input[maxlength="40"]', 'Academia Fit'); await pg.locator('form.f button[type=submit]').click(); await pg.waitForTimeout(700);
    ok('editou', /Academia Fit/.test(await pg.locator('#view').innerText()));
    await pg.locator('.item:has-text("Academia Fit") button:has-text("Arquivar")').click(); await pg.waitForTimeout(700);
    ok('arquivou (sai da lista principal)', !(await pg.locator('.lista .item:has-text("Academia Fit")').count()));
    await pg.locator('button:has-text("Ver arquivadas")').click(); await pg.waitForTimeout(300);
    ok('aparece em arquivadas', (await pg.locator('.item.arq:has-text("Academia Fit")').count()) === 1);
    // excluir em uso -> reatribuir
    pg.on('dialog', d => d.accept());
    await pg.locator('.item:has-text("Alimentação") .x').first().click(); await pg.waitForTimeout(600);
    ok('em uso: mostra painel de mover', (await pg.locator('text=Mover e excluir').count()) === 1);
    await pg.locator('button:has-text("Mover e excluir")').click(); await pg.waitForTimeout(800);
    ok('categoria movida e excluída', !(await pg.locator('.lista .item:has-text("Alimentação")').count()));
    // tags
    await pg.locator('#nav button[data-v=lanc]').click(); await pg.waitForTimeout(700);
    await pg.fill('input[aria-label=Valor]', '12,50'); await pg.fill('input[aria-label=Tags]', '#viagem, trabalho');
    await pg.locator('form.f button[type=submit]').first().click(); await pg.waitForTimeout(800);
    ok('lançamento com tags aparece', (await pg.locator('.tags em:has-text("#viagem")').count()) === 1);
    ok('sem scroll horizontal', await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    ok('sem erros de JS', erros.length === 0); if (erros.length) console.log(erros);
    await pg.close();
  }
  await b.close(); srv.close(); console.log(falhas ? falhas + ' FALHA(S)' : 'tudo ok'); process.exit(falhas ? 1 : 0);
})();
